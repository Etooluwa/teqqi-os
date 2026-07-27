import "server-only";

import { supabaseRest } from "@/lib/supabase/server";

const MONITORING_WINDOW_MS = 24 * 60 * 60 * 1000;
const STALE_RUNNING_MS = 10 * 60 * 1000;

type SearchHealthRow = {
  id: string;
  status: "PENDING" | "RUNNING" | "COMPLETED" | "PARTIAL" | "FAILED";
  created_at: string;
};

type SearchHealthDetailRow = SearchHealthRow & {
  error_code: string | null;
};

type RunHealthRow = {
  id: string;
  status: "COMPLETED" | "FAILED";
  created_at: string;
};

function countStatuses<T extends { status: string }>(rows: T[]) {
  return rows.reduce<Record<string, number>>((counts, row) => {
    counts[row.status] = (counts[row.status] ?? 0) + 1;
    return counts;
  }, {});
}

async function loadSearchHealth(cutoff: string): Promise<{
  rows: SearchHealthRow[];
  detailRows: SearchHealthDetailRow[] | null;
  detailedSignalsAvailable: boolean;
}> {
  const baseQuery = `created_at=gte.${encodeURIComponent(cutoff)}&order=created_at.desc&limit=500`;

  try {
    const detailRows = await supabaseRest<SearchHealthDetailRow[]>(
      `/search_history?${baseQuery}&select=id,status,error_code,created_at`,
    );
    return { rows: detailRows, detailRows, detailedSignalsAvailable: true };
  } catch {
    const rows = await supabaseRest<SearchHealthRow[]>(
      `/search_history?${baseQuery}&select=id,status,created_at`,
    );
    return { rows, detailRows: null, detailedSignalsAvailable: false };
  }
}

export async function getOperationalMonitoringSnapshot() {
  const now = Date.now();
  const cutoff = new Date(now - MONITORING_WINDOW_MS).toISOString();
  const staleCutoff = now - STALE_RUNNING_MS;

  const [searchHealth, scoringRuns, opportunityRuns] = await Promise.all([
    loadSearchHealth(cutoff),
    supabaseRest<RunHealthRow[]>(
      `/website_scoring_runs?created_at=gte.${encodeURIComponent(cutoff)}&select=id,status,created_at&order=created_at.desc&limit=500`,
    ),
    supabaseRest<RunHealthRow[]>(
      `/website_opportunity_runs?created_at=gte.${encodeURIComponent(cutoff)}&select=id,status,created_at&order=created_at.desc&limit=500`,
    ),
  ]);

  const searches = searchHealth.rows;
  const staleRunningSearches = searches.filter((row) =>
    row.status === "RUNNING" && Date.parse(row.created_at) < staleCutoff,
  ).length;
  const rateLimitedSearches = searchHealth.detailRows
    ? searchHealth.detailRows.filter((row) => row.error_code === "GOOGLE_PLACES_RATE_LIMITED").length
    : null;
  const recoveredStaleSearches = searchHealth.detailRows
    ? searchHealth.detailRows.filter((row) => row.error_code === "STALE_EXECUTION_RECOVERED").length
    : null;
  const failedSearches = searches.filter((row) => row.status === "FAILED").length;
  const failedScoringRuns = scoringRuns.filter((row) => row.status === "FAILED").length;
  const failedOpportunityRuns = opportunityRuns.filter((row) => row.status === "FAILED").length;

  const degraded = staleRunningSearches > 0
    || (rateLimitedSearches ?? 0) > 0
    || !searchHealth.detailedSignalsAvailable;

  return {
    status: degraded ? "DEGRADED" as const : "HEALTHY" as const,
    generatedAt: new Date(now).toISOString(),
    windowMs: MONITORING_WINDOW_MS,
    telemetry: {
      searchErrorCodeSignalsAvailable: searchHealth.detailedSignalsAvailable,
    },
    signals: {
      staleRunningSearches,
      rateLimitedSearches,
      recoveredStaleSearches,
      failedSearches,
      failedScoringRuns,
      failedOpportunityRuns,
    },
    executions: {
      searches: { total: searches.length, byStatus: countStatuses(searches) },
      scoringRuns: { total: scoringRuns.length, byStatus: countStatuses(scoringRuns) },
      opportunityRuns: { total: opportunityRuns.length, byStatus: countStatuses(opportunityRuns) },
    },
    notes: [
      "Monitoring exposes aggregate operational counts only; business content and provider payloads are not included.",
      "DEGRADED means a stale active search, recent Google Places rate-limit event, or partial monitoring telemetry exists in the monitoring window.",
      ...(searchHealth.detailedSignalsAvailable
        ? []
        : ["Detailed search error-code telemetry is temporarily unavailable; status-level search monitoring remains active."]),
    ],
  };
}
