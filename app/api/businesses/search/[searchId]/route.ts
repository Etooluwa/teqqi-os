import { NextResponse } from "next/server";

import {
  getGooglePlaceDetails,
  GooglePlacesError,
} from "@/lib/business-discovery/google-places";
import {
  getSearchExecution,
  getSearchPlaceReferences,
} from "@/lib/business-discovery/persistence";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ searchId: string }> },
) {
  const { searchId } = await context.params;
  const search = await getSearchExecution(searchId);

  if (!search) {
    return NextResponse.json(
      {
        ok: false,
        error: { code: "NOT_FOUND", message: "Search was not found." },
      },
      { status: 404 },
    );
  }

  const references = await getSearchPlaceReferences(searchId);

  const results = await Promise.all(
    references.map(async (reference) => {
      try {
        const details = await getGooglePlaceDetails(
          reference.external_id,
          reference.result_position,
        );

        return {
          provider: reference.provider,
          externalId: reference.external_id,
          resultPosition: reference.result_position,
          detailsAvailable: true,
          details,
        };
      } catch (error) {
        if (error instanceof GooglePlacesError) {
          console.warn("Could not refresh Google Place details", {
            searchId,
            externalId: reference.external_id,
            status: error.status,
          });
        }

        return {
          provider: reference.provider,
          externalId: reference.external_id,
          resultPosition: reference.result_position,
          detailsAvailable: false,
          details: null,
        };
      }
    }),
  );

  return NextResponse.json({
    ok: true,
    search: {
      id: search.id,
      query: search.query_text,
      industry: search.industry,
      location: search.location_text,
      requestedMaxResults: search.requested_max_results,
      source: search.source,
      status: search.status,
      resultCount: search.result_count,
      createdAt: search.created_at,
    },
    results,
    note: "Google Place details are retrieved live. Stored history contains Place IDs and search metadata, not persisted Google Places content.",
  });
}
