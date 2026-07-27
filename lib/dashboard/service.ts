import "server-only";

import { getSearchExecution, getSearchPlaceReferences, listSearchExecutions } from "@/lib/business-discovery/persistence";
import { getGooglePlaceDetails } from "@/lib/business-discovery/google-places";
import { supabaseRest } from "@/lib/supabase/server";
import type { WebsiteOpportunityEngineResult } from "@/lib/website-opportunities/types";
import { buildDashboardMarketSummary } from "./market-summary";
import { rankDashboardBusinesses } from "./ranking";
import { buildDashboardHistoryEntries } from "./search-history";
import type { DashboardBestOpportunity, DashboardBusinessRow, DashboardSearchSummary, OpportunityDashboardSnapshot } from "./types";

const DASHBOARD_VERSION = "1.0.0" as const;
const GOOGLE_PLACE_DETAIL_CONCURRENCY = 5;
const PRIORITY_RANK = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 } as const;
const CONFIDENCE_RANK = { HIGH: 3, MEDIUM: 2, LOW: 1 } as const;

type OpportunityRunRow = { id: string; scoring_run_id: string; final_url: string; result: WebsiteOpportunityEngineResult; status: "COMPLETED" | "FAILED"; created_at: string };
type ScoringRunRow = { id: string; website_score: string | number | null };

export class DashboardDataError extends Error {
  constructor(message: string) { super(message); this.name = "DashboardDataError"; }
}

function canonicalDomain(url: string | null): string | null {
  if (!url) return null;
  try { return new URL(url).hostname.toLowerCase().replace(/^www\./, ""); } catch { return null; }
}

function numericScore(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const score = Number(value);
  return Number.isFinite(score) ? score : null;
}

function toSearchSummary(search: { id: string; query_text: string | null; industry: string; location_text: string; requested_max_results: number; status: string; result_count: number | null; created_at: string }): DashboardSearchSummary {
  return {
    id: search.id,
    query: search.query_text,
    industry: search.industry,
    location: search.location_text,
    status: search.status,
    requestedMaxResults: search.requested_max_results,
    resultCount: search.result_count ?? 0,
    createdAt: search.created_at,
  };
}

function bestOpportunity(result: WebsiteOpportunityEngineResult): DashboardBestOpportunity {
  let best: WebsiteOpportunityEngineResult["opportunities"][number] | null = null;
  for (const opportunity of result.opportunities) {
    if (!best) {
      best = opportunity;
      continue;
    }
    const priorityDelta = PRIORITY_RANK[opportunity.priority] - PRIORITY_RANK[best.priority];
    const confidenceDelta = CONFIDENCE_RANK[opportunity.confidence] - CONFIDENCE_RANK[best.confidence];
    if (
      priorityDelta > 0
      || (priorityDelta === 0 && confidenceDelta > 0)
      || (priorityDelta === 0 && confidenceDelta === 0 && opportunity.opportunityId.localeCompare(best.opportunityId) < 0)
    ) {
      best = opportunity;
    }
  }
  return best ? { opportunityId: best.opportunityId, title: best.title, priority: best.priority, confidence: best.confidence, recommendedService: best.recommendedService } : null;
}

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  if (items.length === 0) return [];
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(Math.max(1, concurrency), items.length) }, async () => {
    while (true) {
      const index = nextIndex++;
      if (index >= items.length) return;
      results[index] = await worker(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

async function loadLatestOpportunityRuns(): Promise<Map<string, OpportunityRunRow>> {
  const rows = await supabaseRest<OpportunityRunRow[]>("/website_opportunity_runs?status=eq.COMPLETED&select=id,scoring_run_id,final_url,result,status,created_at&order=created_at.desc&limit=1000");
  const byDomain = new Map<string, OpportunityRunRow>();
  for (const row of rows) { const domain = canonicalDomain(row.final_url); if (domain && !byDomain.has(domain)) byDomain.set(domain, row); }
  return byDomain;
}

async function loadScoringRuns(scoringRunIds: string[]): Promise<Map<string, number | null>> {
  const uniqueIds = [...new Set(scoringRunIds.filter(Boolean))];
  if (uniqueIds.length === 0) return new Map();
  const rows = await supabaseRest<ScoringRunRow[]>(
    `/website_scoring_runs?id=in.(${uniqueIds.join(",")})&status=eq.COMPLETED&select=id,website_score`,
  );
  return new Map(rows.map((row) => [row.id, numericScore(row.website_score)]));
}

export async function buildOpportunityDashboardSnapshot(
  requestedSearchId?: string,
  currentParams: URLSearchParams = new URLSearchParams(),
): Promise<OpportunityDashboardSnapshot> {
  const searchHistoryRows = await listSearchExecutions(25);
  if (searchHistoryRows.length === 0) throw new DashboardDataError("No business discovery searches are available yet.");
  const selectedSearch = requestedSearchId ? await getSearchExecution(requestedSearchId) : searchHistoryRows[0];
  if (!selectedSearch) throw new DashboardDataError("The requested business discovery search was not found.");

  const [references, latestOpportunityRuns] = await Promise.all([
    getSearchPlaceReferences(selectedSearch.id),
    loadLatestOpportunityRuns(),
  ]);
  const scoringRuns = await loadScoringRuns([...latestOpportunityRuns.values()].map((run) => run.scoring_run_id));
  const resultByOpportunityRunId = new Map([...latestOpportunityRuns.values()].map((run) => [run.id, run.result] as const));

  const businesses: DashboardBusinessRow[] = await mapWithConcurrency(
    references,
    GOOGLE_PLACE_DETAIL_CONCURRENCY,
    async (reference) => {
      try {
        const details = await getGooglePlaceDetails(reference.external_id, reference.result_position);
        const domain = canonicalDomain(details.websiteUrl);
        const run = domain ? latestOpportunityRuns.get(domain) ?? null : null;
        const result = run?.result ?? null;
        return {
          externalId: reference.external_id, resultPosition: reference.result_position, businessName: details.name, websiteUrl: details.websiteUrl,
          phone: details.phone, formattedAddress: details.formattedAddress, rating: details.rating, detailsAvailable: true,
          intelligenceAvailable: Boolean(result), opportunityRunId: run?.id ?? null, scoringRunId: run?.scoring_run_id ?? null,
          websiteScore: run ? scoringRuns.get(run.scoring_run_id) ?? null : null, bestOpportunity: result ? bestOpportunity(result) : null,
          opportunityCount: result?.opportunityCount ?? 0,
          leadScore: { available: false, score: null, tier: null, reason: "BUSINESS_LEVEL_LEAD_MODEL_NOT_IMPLEMENTED" },
        } satisfies DashboardBusinessRow;
      } catch {
        return {
          externalId: reference.external_id, resultPosition: reference.result_position, businessName: "Business details unavailable", websiteUrl: null,
          phone: null, formattedAddress: null, rating: null, detailsAvailable: false, intelligenceAvailable: false, opportunityRunId: null,
          scoringRunId: null, websiteScore: null, bestOpportunity: null, opportunityCount: 0,
          leadScore: { available: false, score: null, tier: null, reason: "BUSINESS_LEVEL_LEAD_MODEL_NOT_IMPLEMENTED" },
        } satisfies DashboardBusinessRow;
      }
    },
  );

  const orderedBusinesses = businesses.sort((a, b) => a.resultPosition - b.resultPosition);
  const searchHistory = searchHistoryRows.map(toSearchSummary);
  return {
    dashboardVersion: DASHBOARD_VERSION,
    market: toSearchSummary(selectedSearch),
    summary: buildDashboardMarketSummary(orderedBusinesses, resultByOpportunityRunId),
    businesses: orderedBusinesses,
    rankedBusinesses: rankDashboardBusinesses(orderedBusinesses),
    searchHistory,
    historyNavigation: buildDashboardHistoryEntries(searchHistory, selectedSearch.id, currentParams),
    dataNotes: { googlePlaceContentPersisted: false, googlePlaceDetailsRetrievedLive: true, leadScoreStatus: "UNAVAILABLE_UNTIL_BUSINESS_LEVEL_MODEL_EXISTS" },
  };
}
