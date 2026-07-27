import "server-only";

import { supabaseRest } from "@/lib/supabase/server";

const MONITORING_WINDOW_MS = 24 * 60 * 60 * 1000;
const STALE_RUNNING_MS = 10 * 60 * 1000;

type SearchHealthRow = {
  id: string;
  status: "PENDING" | "RUNNING" | "COMPLETED" | "PARTIAL" | "FAILED";
  error_code: string | null;
  created_at: string;
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

export async function getOperationalMonitoringSnapshot() {
  const now = Date.now();
  const cutoff = new Date(now - MONITORING_WINDOW_MS).toISOString();
  const staleCutoff = now - STALE_RUNNING_MS;

  const [searches, scoringRuns, opportunityRuns] = await Promise.all([
    supabaseRest<SearchHealthRow[]>(
      `/search_history?created_at=gte.${encodeURIComponent(cutoff)}&select=id,status,error_code,created_at&order=created_at.desc&limit=500`,
    ),
    supabaseRest<RunHealthRow[]>(
      `/website_scoring_runs?created_at=gte.${encodeURIComponent(cutoff)}&select=id,status,created_at&order=created_at.desc&limit=500`,
    ),
    supabaseRest<RunHealthRow[]>(
      `/website_opportunity_runs?created_at=gte.${encodeURIComponent(cutoff)}&select=id,status,created_at&order=created_at.desc&limit=500`,
    ),
  ]);

  const staleRunningSearches = searches.filter((row) =>
    row.status === "RUNNING" && Date.parse(row.created_at) < staleCutoff,
  ).length;
  const rateLimitedSearches = searches.filter((row) => row.error_code === "GOOGLE_PLACES_RATE_LIMITED").length;
  const recoveredStaleSearches = searches.filter((row) => row.error_code === "STALE_EXECUTION_RECOVERED").length;
  const failedSearches = searches.filter((row) => row.status === "FAILED").length;
  const failedScoringRuns = scoringRuns.filter((row) => row.status === "FAILED").length;
  const failedOpportunityRuns = opportunityRuns.filter((row) => row.status === "FAILED").length;

  const degraded = staleRunningSearches > 0 || rateLimitedSearches > 0;

  return {
    status: degraded ? "DEGRADED" as const : "HEALTHY" as const,
    generatedAt: new Date(now).toISOString(),
    windowMs: MONITORING_WINDOW_MS,
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
      "DEGRADED means a stale active search or a recent Google Places rate-limit event exists in the monitoring window.",
    ],
  };
}
