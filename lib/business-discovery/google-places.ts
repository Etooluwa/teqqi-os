import "server-only";

import { getGooglePlacesEnv } from "@/lib/env/server";
import type {
  BusinessSearchInput,
  BusinessSearchProviderResponse,
  ProviderBusinessResult,
} from "@/lib/business-discovery/types";

const GOOGLE_TEXT_SEARCH_URL = "https://places.googleapis.com/v1/places:searchText";
const GOOGLE_PLACE_DETAILS_URL = "https://places.googleapis.com/v1/places";

const SEARCH_FIELD_MASK = [
  "places.id", "places.displayName", "places.formattedAddress",
  "places.nationalPhoneNumber", "places.websiteUri", "places.rating",
  "places.location", "places.businessStatus", "nextPageToken",
].join(",");

const DETAILS_FIELD_MASK = [
  "id", "displayName", "formattedAddress", "nationalPhoneNumber",
  "websiteUri", "rating", "location", "businessStatus",
].join(",");

const GOOGLE_MAX_RESULTS = 60;
const GOOGLE_MAX_PAGE_SIZE = 20;

type GooglePlace = {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  nationalPhoneNumber?: string;
  websiteUri?: string;
  rating?: number;
  location?: { latitude?: number; longitude?: number };
  businessStatus?: string;
};

type GoogleTextSearchResponse = { places?: GooglePlace[]; nextPageToken?: string };

export class GooglePlacesError extends Error {
  constructor(message: string, public readonly status: number, public readonly responseBody?: string) {
    super(message);
    this.name = "GooglePlacesError";
  }
}

function validateInput(input: BusinessSearchInput): BusinessSearchInput {
  const industry = input.industry.trim();
  const location = input.location.trim();
  if (!industry) throw new Error("Industry is required.");
  if (!location) throw new Error("Location is required.");
  if (!Number.isInteger(input.maxResults) || input.maxResults < 1) {
    throw new Error("maxResults must be a positive integer.");
  }
  if (input.maxResults > GOOGLE_MAX_RESULTS) {
    throw new Error(`maxResults cannot exceed ${GOOGLE_MAX_RESULTS} for Google Text Search.`);
  }
  return { industry, location, maxResults: input.maxResults };
}

function toProviderResult(place: GooglePlace, resultPosition: number): ProviderBusinessResult | null {
  const externalId = place.id?.trim();
  const name = place.displayName?.text?.trim();
  if (!externalId || !name) return null;
  return {
    provider: "GOOGLE_PLACES",
    externalId,
    name,
    websiteUrl: place.websiteUri ?? null,
    phone: place.nationalPhoneNumber ?? null,
    formattedAddress: place.formattedAddress ?? null,
    latitude: place.location?.latitude ?? null,
    longitude: place.location?.longitude ?? null,
    rating: place.rating ?? null,
    providerStatus: place.businessStatus ?? null,
    resultPosition,
  };
}

async function fetchSearchPage(params: { query: string; pageSize: number; pageToken?: string }): Promise<GoogleTextSearchResponse> {
  const { googlePlacesApiKey } = getGooglePlacesEnv();
  const response = await fetch(GOOGLE_TEXT_SEARCH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": googlePlacesApiKey,
      "X-Goog-FieldMask": SEARCH_FIELD_MASK,
    },
    body: JSON.stringify({
      textQuery: params.query,
      pageSize: params.pageSize,
      ...(params.pageToken ? { pageToken: params.pageToken } : {}),
    }),
    cache: "no-store",
  });
  if (!response.ok) {
    const responseBody = await response.text();
    throw new GooglePlacesError(`Google Places request failed with status ${response.status}.`, response.status, responseBody);
  }
  return (await response.json()) as GoogleTextSearchResponse;
}

export async function getGooglePlaceDetails(placeId: string, resultPosition: number): Promise<ProviderBusinessResult> {
  const { googlePlacesApiKey } = getGooglePlacesEnv();
  const response = await fetch(`${GOOGLE_PLACE_DETAILS_URL}/${encodeURIComponent(placeId)}`, {
    method: "GET",
    headers: { "X-Goog-Api-Key": googlePlacesApiKey, "X-Goog-FieldMask": DETAILS_FIELD_MASK },
    cache: "no-store",
  });
  if (!response.ok) {
    const responseBody = await response.text();
    throw new GooglePlacesError(`Google Place Details request failed with status ${response.status}.`, response.status, responseBody);
  }
  const result = toProviderResult((await response.json()) as GooglePlace, resultPosition);
  if (!result) throw new GooglePlacesError("Google Place Details response was missing required identity fields.", 502);
  return result;
}

export async function searchGooglePlaces(
  rawInput: BusinessSearchInput,
  excludedPlaceIds: ReadonlySet<string> = new Set(),
): Promise<BusinessSearchProviderResponse> {
  const input = validateInput(rawInput);
  const query = `${input.industry} in ${input.location}`;
  const newPlaces = new Map<string, ProviderBusinessResult>();
  const seenThisSearch = new Set<string>();
  let nextPageToken: string | undefined;

  do {
    const page = await fetchSearchPage({
      query,
      pageSize: GOOGLE_MAX_PAGE_SIZE,
      pageToken: nextPageToken,
    });

    for (const place of page.places ?? []) {
      if (newPlaces.size >= input.maxResults) break;
      const placeId = place.id?.trim();
      if (!placeId || seenThisSearch.has(placeId)) continue;
      seenThisSearch.add(placeId);

      // A new discovery search never returns a Google Place ID that TEQQI OS
      // has already returned in a previous discovery search.
      if (excludedPlaceIds.has(placeId)) continue;

      const normalized = toProviderResult(place, newPlaces.size + 1);
      if (normalized) newPlaces.set(normalized.externalId, normalized);
    }

    nextPageToken = page.nextPageToken;
  } while (nextPageToken && newPlaces.size < input.maxResults);

  const results = Array.from(newPlaces.values());
  return {
    query,
    provider: "GOOGLE_PLACES",
    requestedMaxResults: input.maxResults,
    returnedResults: results.length,
    results,
  };
}
