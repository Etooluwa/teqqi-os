import { NextResponse } from "next/server";

import {
  GooglePlacesError,
  searchGooglePlaces,
} from "@/lib/business-discovery/google-places";
import {
  createSearchExecution,
  finalizeSearchExecution,
  storeSearchPlaceReferences,
} from "@/lib/business-discovery/persistence";
import type { BusinessSearchInput } from "@/lib/business-discovery/types";

export const runtime = "nodejs";

type SearchRequestBody = Partial<BusinessSearchInput>;

function parseInput(body: SearchRequestBody): BusinessSearchInput {
  const industry = typeof body.industry === "string" ? body.industry.trim() : "";
  const location = typeof body.location === "string" ? body.location.trim() : "";
  const maxResults =
    typeof body.maxResults === "number" ? body.maxResults : Number.NaN;

  if (!industry) throw new Error("Industry is required.");
  if (!location) throw new Error("Location is required.");
  if (!Number.isInteger(maxResults) || maxResults < 1 || maxResults > 60) {
    throw new Error("maxResults must be an integer between 1 and 60.");
  }

  return { industry, location, maxResults };
}

export async function POST(request: Request) {
  let searchId: string | null = null;

  try {
    const body = (await request.json()) as SearchRequestBody;
    const input = parseInput(body);
    const query = `${input.industry} in ${input.location}`;

    searchId = await createSearchExecution(input, query);

    const result = await searchGooglePlaces(input);

    await storeSearchPlaceReferences(searchId, result.results);
    await finalizeSearchExecution({
      searchId,
      status: "COMPLETED",
      resultCount: result.returnedResults,
    });

    return NextResponse.json({
      ok: true,
      searchId,
      ...result,
      persistence: {
        stored: true,
        storedFields: [
          "search inputs",
          "provider",
          "Google Place ID",
          "result position",
        ],
        googlePlaceContentPersisted: false,
      },
    });
  } catch (error) {
    if (searchId) {
      try {
        await finalizeSearchExecution({
          searchId,
          status: "FAILED",
          resultCount: 0,
          errorCode:
            error instanceof GooglePlacesError
              ? "GOOGLE_PLACES_ERROR"
              : "SEARCH_ERROR",
          errorMessage:
            error instanceof Error ? error.message : "Business search failed.",
        });
      } catch (finalizeError) {
        console.error("Failed to finalize search history", finalizeError);
      }
    }

    if (error instanceof GooglePlacesError) {
      console.error("Google Places search failed", {
        status: error.status,
        responseBody: error.responseBody,
      });

      return NextResponse.json(
        {
          ok: false,
          searchId,
          error: {
            code: "GOOGLE_PLACES_ERROR",
            message: "Business search provider request failed.",
          },
        },
        { status: 502 },
      );
    }

    const message = error instanceof Error ? error.message : "Invalid request.";

    return NextResponse.json(
      {
        ok: false,
        searchId,
        error: {
          code: searchId ? "SEARCH_ERROR" : "VALIDATION_ERROR",
          message,
        },
      },
      { status: searchId ? 500 : 400 },
    );
  }
}
