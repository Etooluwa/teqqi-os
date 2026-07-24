import { NextResponse } from "next/server";

import { listSearchExecutions } from "@/lib/business-discovery/persistence";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const requestedLimit = Number(searchParams.get("limit") ?? "25");
    const limit = Number.isFinite(requestedLimit) ? requestedLimit : 25;
    const searches = await listSearchExecutions(limit);

    return NextResponse.json({
      ok: true,
      searches: searches.map((search) => ({
        id: search.id,
        query: search.query_text,
        industry: search.industry,
        location: search.location_text,
        requestedMaxResults: search.requested_max_results,
        source: search.source,
        status: search.status,
        resultCount: search.result_count ?? 0,
        createdAt: search.created_at,
      })),
    });
  } catch (error) {
    console.error("Could not load business discovery history", error);
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "SEARCH_HISTORY_ERROR",
          message: "Could not load search history.",
        },
      },
      { status: 500 },
    );
  }
}
