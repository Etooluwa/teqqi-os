import { NextResponse } from "next/server";

import { GooglePlacesError, searchGooglePlaces } from "@/lib/business-discovery/google-places";
import {
  createSearchExecution,
  finalizeSearchExecution,
  findRecentCompletedSearch,
  findRecentRunningSearch,
  getPreviouslyDiscoveredPlaceIds,
  recoverStaleSearchExecutions,
  storeSearchPlaceReferences,
} from "@/lib/business-discovery/persistence";
import type { BusinessSearchInput } from "@/lib/business-discovery/types";
import { createRequestLogContext, logEvent } from "@/lib/observability/logger";

export const runtime = "nodejs";

const BUSINESS_SEARCH_CACHE_TTL_MS = 15 * 60 * 1000;
const BUSINESS_SEARCH_ACTIVE_WINDOW_MS = 10 * 60 * 1000;
type SearchRequestBody = Partial<BusinessSearchInput> & { reuseRecent?: boolean; forceRefresh?: boolean };

function parseInput(body: SearchRequestBody): BusinessSearchInput {
  const industry = typeof body.industry === "string" ? body.industry.trim() : "";
  const location = typeof body.location === "string" ? body.location.trim() : "";
  const maxResults = typeof body.maxResults === "number" ? body.maxResults : Number.NaN;
  if (!industry) throw new Error("Industry is required.");
  if (!location) throw new Error("Location is required.");
  if (!Number.isInteger(maxResults) || maxResults < 1 || maxResults > 60) {
    throw new Error("maxResults must be an integer between 1 and 60.");
  }
  return { industry, location, maxResults };
}

export async function POST(request: Request) {
  const context = createRequestLogContext(request, "business.discovery");
  const startedAt = Date.now();
  let searchId: string | null = null;

  try {
    const body = (await request.json()) as SearchRequestBody;
    const input = parseInput(body);
    const query = `${input.industry} in ${input.location}`;
    const forceRefresh = body.forceRefresh === true;
    const reuseRecent = body.reuseRecent === true && !forceRefresh;

    logEvent("INFO", "business_search.requested", context, {
      industry: input.industry,
      location: input.location,
      maxResults: input.maxResults,
      forceRefresh,
      reuseRecent,
    });

    const recoveredStaleCount = await recoverStaleSearchExecutions(BUSINESS_SEARCH_ACTIVE_WINDOW_MS);
    if (recoveredStaleCount > 0) {
      logEvent("WARN", "business_search.stale_recovered", context, { recoveredStaleCount });
    }

    if (reuseRecent) {
      const cachedSearch = await findRecentCompletedSearch(input, BUSINESS_SEARCH_CACHE_TTL_MS);
      if (cachedSearch) {
        logEvent("INFO", "business_search.cache_hit", context, {
          searchId: cachedSearch.id,
          returnedResults: cachedSearch.result_count ?? 0,
          durationMs: Date.now() - startedAt,
        });
        return NextResponse.json({
          ok: true,
          searchId: cachedSearch.id,
          query: cachedSearch.query_text ?? query,
          provider: "GOOGLE_PLACES",
          requestedMaxResults: cachedSearch.requested_max_results,
          returnedResults: cachedSearch.result_count ?? 0,
          results: [],
          discovery: {
            mode: "RECENT_SEARCH_REUSE",
            requestedNewResults: input.maxResults,
            returnedNewResults: cachedSearch.result_count ?? 0,
          },
          cache: {
            hit: true,
            ttlMs: BUSINESS_SEARCH_CACHE_TTL_MS,
            cachedSearchId: cachedSearch.id,
            cachedAt: cachedSearch.created_at,
            forceRefresh: false,
          },
          persistence: {
            stored: true,
            reusedExistingSearch: true,
            storedFields: ["search inputs", "provider", "Google Place ID", "result position"],
            googlePlaceContentPersisted: false,
          },
        }, { headers: { "X-Request-Id": context.requestId } });
      }
    }

    const activeSearch = await findRecentRunningSearch(input, BUSINESS_SEARCH_ACTIVE_WINDOW_MS);
    if (activeSearch) {
      logEvent("WARN", "business_search.duplicate_blocked", context, {
        searchId: activeSearch.id,
        startedAt: activeSearch.created_at,
      });
      return NextResponse.json(
        {
          ok: false,
          searchId: activeSearch.id,
          error: {
            code: "SEARCH_ALREADY_RUNNING",
            message: "An identical business discovery search is already running. Try again after it finishes.",
            retryable: true,
          },
          recovery: {
            activeSearchId: activeSearch.id,
            startedAt: activeSearch.created_at,
            staleAfterMs: BUSINESS_SEARCH_ACTIVE_WINDOW_MS,
          },
        },
        { status: 409, headers: { "X-Request-Id": context.requestId } },
      );
    }

    const previouslyDiscovered = await getPreviouslyDiscoveredPlaceIds();
    searchId = await createSearchExecution(input, query);
    logEvent("INFO", "business_search.started", context, { searchId });

    const result = await searchGooglePlaces(input, previouslyDiscovered);
    await storeSearchPlaceReferences(searchId, result.results);
    await finalizeSearchExecution({
      searchId,
      status: "COMPLETED",
      resultCount: result.returnedResults,
    });

    logEvent("INFO", "business_search.completed", context, {
      searchId,
      returnedResults: result.returnedResults,
      durationMs: Date.now() - startedAt,
    });

    return NextResponse.json({
      ok: true,
      searchId,
      ...result,
      discovery: {
        mode: "NEW_RESULTS_ONLY",
        previouslyDiscoveredCount: previouslyDiscovered.size,
        requestedNewResults: input.maxResults,
        returnedNewResults: result.returnedResults,
        exhaustedAvailableNewResults: result.returnedResults < input.maxResults,
      },
      cache: {
        hit: false,
        eligible: body.reuseRecent === true,
        forceRefresh,
        ttlMs: BUSINESS_SEARCH_CACHE_TTL_MS,
      },
      persistence: {
        stored: true,
        reusedExistingSearch: false,
        storedFields: ["search inputs", "provider", "Google Place ID", "result position"],
        googlePlaceContentPersisted: false,
      },
    }, { headers: { "X-Request-Id": context.requestId } });
  } catch (error) {
    if (searchId) {
      try {
        const providerTemporarilyLimited = error instanceof GooglePlacesError && (error.status === 429 || error.status === 503);
        await finalizeSearchExecution({
          searchId,
          status: "FAILED",
          resultCount: 0,
          errorCode: providerTemporarilyLimited ? "GOOGLE_PLACES_RATE_LIMITED" : error instanceof GooglePlacesError ? "GOOGLE_PLACES_ERROR" : "SEARCH_ERROR",
          errorMessage: error instanceof Error ? error.message : "Business search failed.",
        });
      } catch (finalizeError) {
        logEvent("ERROR", "business_search.finalize_failed", context, { searchId, error: finalizeError });
      }
    }

    if (error instanceof GooglePlacesError) {
      const rateLimited = error.status === 429 || error.status === 503;
      const retryAfterSeconds = error.retryAfterMs == null ? null : Math.max(1, Math.ceil(error.retryAfterMs / 1_000));
      logEvent(rateLimited ? "WARN" : "ERROR", rateLimited ? "business_search.rate_limited" : "business_search.provider_failed", context, {
        searchId,
        providerStatus: error.status,
        retryAfterMs: error.retryAfterMs ?? null,
        durationMs: Date.now() - startedAt,
      });

      return NextResponse.json(
        {
          ok: false,
          searchId,
          error: {
            code: rateLimited ? "GOOGLE_PLACES_RATE_LIMITED" : "GOOGLE_PLACES_ERROR",
            message: rateLimited
              ? "Google Places is temporarily rate-limited. Try the search again shortly."
              : "Business search provider request failed.",
            retryable: rateLimited,
            retryAfterSeconds,
          },
        },
        {
          status: rateLimited ? 503 : 502,
          headers: {
            "X-Request-Id": context.requestId,
            ...(retryAfterSeconds ? { "Retry-After": String(retryAfterSeconds) } : {}),
          },
        },
      );
    }

    const message = error instanceof Error ? error.message : "Invalid request.";
    logEvent(searchId ? "ERROR" : "WARN", searchId ? "business_search.failed" : "business_search.invalid_request", context, {
      searchId,
      error,
      durationMs: Date.now() - startedAt,
    });
    return NextResponse.json(
      { ok: false, searchId, error: { code: searchId ? "SEARCH_ERROR" : "VALIDATION_ERROR", message } },
      { status: searchId ? 500 : 400, headers: { "X-Request-Id": context.requestId } },
    );
  }
}
