import "server-only";

import { supabaseRest } from "@/lib/supabase/server";
import type { BusinessSearchInput, ProviderBusinessResult } from "@/lib/business-discovery/types";

type SearchHistoryRow = {
  id: string;
  query_text: string | null;
  industry: string;
  location_text: string;
  normalized_industry: string;
  normalized_location: string;
  requested_max_results: number;
  source: string;
  status: "PENDING" | "RUNNING" | "COMPLETED" | "PARTIAL" | "FAILED";
  result_count: number | null;
  created_at: string;
};

type SearchPlaceResultRow = {
  search_id: string;
  provider: "GOOGLE_PLACES";
  external_id: string;
  result_position: number;
};

function normalizeSearchValue(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

export async function createSearchExecution(
  input: BusinessSearchInput,
  query: string,
): Promise<string> {
  const rows = await supabaseRest<SearchHistoryRow[]>(
    "/search_history?select=id",
    {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: {
        query_text: query,
        industry: input.industry,
        location_text: input.location,
        normalized_industry: normalizeSearchValue(input.industry),
        normalized_location: normalizeSearchValue(input.location),
        requested_max_results: input.maxResults,
        source: "GOOGLE_PLACES",
        status: "RUNNING",
        discovery_version: "1.0.0",
      },
    },
  );

  const searchId = rows[0]?.id;
  if (!searchId) {
    throw new Error("Failed to create search history record.");
  }

  return searchId;
}

export async function storeSearchPlaceReferences(
  searchId: string,
  results: ProviderBusinessResult[],
): Promise<void> {
  if (results.length === 0) return;

  const body: SearchPlaceResultRow[] = results.map((result) => ({
    search_id: searchId,
    provider: result.provider,
    external_id: result.externalId,
    result_position: result.resultPosition,
  }));

  await supabaseRest<SearchPlaceResultRow[]>(
    "/search_place_results?select=search_id,provider,external_id,result_position",
    {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body,
    },
  );
}

export async function finalizeSearchExecution(params: {
  searchId: string;
  status: "COMPLETED" | "PARTIAL" | "FAILED";
  resultCount: number;
  errorCode?: string;
  errorMessage?: string;
}): Promise<void> {
  const query = new URLSearchParams({
    id: `eq.${params.searchId}`,
    select: "id",
  });

  await supabaseRest<SearchHistoryRow[]>(`/search_history?${query.toString()}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: {
      status: params.status,
      result_count: params.resultCount,
      completed_at: new Date().toISOString(),
      error_code: params.errorCode ?? null,
      error_message: params.errorMessage ?? null,
    },
  });
}

export async function getSearchExecution(searchId: string): Promise<SearchHistoryRow | null> {
  const query = new URLSearchParams({
    id: `eq.${searchId}`,
    select:
      "id,query_text,industry,location_text,normalized_industry,normalized_location,requested_max_results,source,status,result_count,created_at",
    limit: "1",
  });

  const rows = await supabaseRest<SearchHistoryRow[]>(
    `/search_history?${query.toString()}`,
  );

  return rows[0] ?? null;
}

export async function getSearchPlaceReferences(
  searchId: string,
): Promise<SearchPlaceResultRow[]> {
  const query = new URLSearchParams({
    search_id: `eq.${searchId}`,
    select: "search_id,provider,external_id,result_position",
    order: "result_position.asc",
  });

  return supabaseRest<SearchPlaceResultRow[]>(
    `/search_place_results?${query.toString()}`,
  );
}
