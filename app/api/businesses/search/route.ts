import { NextResponse } from "next/server";

import {
  GooglePlacesError,
  searchGooglePlaces,
} from "@/lib/business-discovery/google-places";
import type { BusinessSearchInput } from "@/lib/business-discovery/types";

export const runtime = "nodejs";

type SearchRequestBody = Partial<BusinessSearchInput>;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as SearchRequestBody;

    const result = await searchGooglePlaces({
      industry: typeof body.industry === "string" ? body.industry : "",
      location: typeof body.location === "string" ? body.location : "",
      maxResults:
        typeof body.maxResults === "number" ? body.maxResults : Number.NaN,
    });

    return NextResponse.json({
      ok: true,
      ...result,
    });
  } catch (error) {
    if (error instanceof GooglePlacesError) {
      console.error("Google Places search failed", {
        status: error.status,
        responseBody: error.responseBody,
      });

      return NextResponse.json(
        {
          ok: false,
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
        error: {
          code: "VALIDATION_ERROR",
          message,
        },
      },
      { status: 400 },
    );
  }
}
