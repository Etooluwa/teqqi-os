import "server-only";

import {
  getSearchExecution,
  getSearchPlaceReferences,
  listSearchExecutions,
} from "@/lib/business-discovery/persistence";
import { getGooglePlaceDetails } from "@/lib/business-discovery/google-places";
import { supabaseRest } from "@/lib/supabase/server";
import type { WebsiteOpportunityEngineResult } from "@/lib/website-opportunities/types";
import type {
  DashboardBestOpportunity,
  DashboardBusinessRow,
  DashboardMarketSummary,
  DashboardSearchSummary,
  OpportunityDashboardSnapshot,
} from "./types";

const DASHBOARD_VERSION = "1.0.0" as const;

const PRIORITY_RANK = {
  CRITICAL: 4,
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
} as const;

const CONFIDENCE_RANK = {
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
} as const;

type OpportunityRunRow = {
  id: string;
  scoring_run_id: string;
  final_url: string;
  result: WebsiteOpportunityEngineResult;
  status: "COMPLETED" | "FAILED";
  created_at: string;
};

type ScoringRunRow = {
  id: string;
  website_score: string | number | null;
};

export class DashboardDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DashboardDataError";
  }
}

function canonicalDomain(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

function numericScore(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const score = Number(value);
  return Number.isFinite(score) ? score : null;
}

function toSearchSummary(search: {
  id: string;
  query_text: string | null;
  industry: string;
  location_text: string;
  status: string;
  result_count: number | null;
  created_at: string;
}): DashboardSearchSummary {
  return {
    id: search.id,
    query: search.query_text,
    industry: search.industry,
    location: search.location_text,
    status: search.status,
    resultCount: search.result_count ?? 0,
    createdAt: search.created_at,
  };
}

function bestOpportunity(result: WebsiteOpportunityEngineResult): DashboardBestOpportunity {
  const sorted = [...result.opportunities].sort((a, b) => {
    const priorityDelta = PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority];
    if (priorityDelta !== 0) return priorityDelta;
    const confidenceDelta = CONFIDENCE_RANK[b.confidence] - CONFIDENCE_RANK[a.confidence];
    if (confidenceDelta !== 0) return confidenceDelta;
    return a.opportunityId.localeCompare(b.opportunityId);
  });

  const opportunity = sorted[0];
  if (!opportunity) return null;

  return {
    opportunityId: opportunity.opportunityId,
    title: opportunity.title,
    priority: opportunity.priority,
    confidence: opportunity.confidence,
    recommendedService: opportunity.recommendedService,
  };
}

async function loadLatestOpportunityRuns(): Promise<Map<string, OpportunityRunRow>> {
  const rows = await supabaseRest<OpportunityRunRow[]>(
    "/website_opportunity_runs?status=eq.COMPLETED&select=id,scoring_run_id,final_url,result,status,created_at&order=created_at.desc&limit=1000",
  );

  const byDomain = new Map<string, OpportunityRunRow>();
  for (const row of rows) {
    const domain = canonicalDomain(row.final_url);
    if (domain && !byDomain.has(domain)) byDomain.set(domain, row);
  }
  return byDomain;
}

async function loadScoringRuns(): Promise<Map<string, number | null>> {
  const rows = await supabaseRest<ScoringRunRow[]>(
    "/website_scoring_runs?status=eq.COMPLETED&select=id,website_score&order=created_at.desc&limit=1000",
  );
  return new Map(rows.map((row) => [row.id, numericScore(row.website_score)]));
}

function buildSummary(
  rows: readonly DashboardBusinessRow[],
  resultByOpportunityRunId: ReadonlyMap<string, WebsiteOpportunityEngineResult>,
): DashboardMarketSummary {
  const analyzed = rows.filter((row) => row.intelligenceAvailable);
  const scores = analyzed
    .map((row) => row.websiteScore)
    .filter((score): score is number => typeof score === "number");

  const serviceCounts = new Map<DashboardMarketSummary["opportunityCountsByService"][number]["service"], number>();
  let totalOpportunities = 0;

  for (const row of analyzed) {
    totalOpportunities += row.opportunityCount;
    const result = row.opportunityRunId
      ? resultByOpportunityRunId.get(row.opportunityRunId)
      : undefined;
    for (const opportunity of result?.opportunities ?? []) {
      serviceCounts.set(
        opportunity.recommendedService,
        (serviceCounts.get(opportunity.recommendedService) ?? 0) + 1,
      );
    }
  }

  return {
    businessesFound: rows.length,
    businessesWithLiveDetails: rows.filter((row) => row.detailsAvailable).length,
    businessesWithWebsites: rows.filter((row) => Boolean(row.websiteUrl)).length,
    businessesAnalyzed: analyzed.length,
    totalOpportunities,
    averageWebsiteScore:
      scores.length === 0
        ? null
        : Math.round((scores.reduce((sum, score) => sum + score, 0) / scores.length) * 100) / 100,
    opportunityCountsByService: [...serviceCounts.entries()]
      .map(([service, count]) => ({ service, count }))
      .sort((a, b) => b.count - a.count || a.service.localeCompare(b.service)),
    leadScoringAvailable: false,
  };
}

export async function buildOpportunityDashboardSnapshot(
  requestedSearchId?: string,
): Promise<OpportunityDashboardSnapshot> {
  const searchHistoryRows = await listSearchExecutions(25);
  if (searchHistoryRows.length === 0) {
    throw new DashboardDataError("No business discovery searches are available yet.");
  }

  const selectedSearch = requestedSearchId
    ? await getSearchExecution(requestedSearchId)
    : searchHistoryRows[0];

  if (!selectedSearch) {
    throw new DashboardDataError("The requested business discovery search was not found.");
  }

  const [references, latestOpportunityRuns, scoringRuns] = await Promise.all([
    getSearchPlaceReferences(selectedSearch.id),
    loadLatestOpportunityRuns(),
    loadScoringRuns(),
  ]);

  const resultByOpportunityRunId = new Map(
    [...latestOpportunityRuns.values()].map((run) => [run.id, run.result] as const),
  );

  const businesses: DashboardBusinessRow[] = await Promise.all(
    references.map(async (reference) => {
      try {
        const details = await getGooglePlaceDetails(reference.external_id, reference.result_position);
        const domain = canonicalDomain(details.websiteUrl);
        const run = domain ? latestOpportunityRuns.get(domain) ?? null : null;
        const result = run?.result ?? null;

        return {
          externalId: reference.external_id,
          resultPosition: reference.result_position,
          businessName: details.name,
          websiteUrl: details.websiteUrl,
          phone: details.phone,
          formattedAddress: details.formattedAddress,
          rating: details.rating,
          detailsAvailable: true,
          intelligenceAvailable: Boolean(result),
          opportunityRunId: run?.id ?? null,
          scoringRunId: run?.scoring_run_id ?? null,
          websiteScore: run ? scoringRuns.get(run.scoring_run_id) ?? null : null,
          bestOpportunity: result ? bestOpportunity(result) : null,
          opportunityCount: result?.opportunityCount ?? 0,
          leadScore: {
            available: false,
            score: null,
            tier: null,
            reason: "BUSINESS_LEVEL_LEAD_MODEL_NOT_IMPLEMENTED",
          },
        } satisfies DashboardBusinessRow;
      } catch {
        return {
          externalId: reference.external_id,
          resultPosition: reference.result_position,
          businessName: "Business details unavailable",
          websiteUrl: null,
          phone: null,
          formattedAddress: null,
          rating: null,
          detailsAvailable: false,
          intelligenceAvailable: false,
          opportunityRunId: null,
          scoringRunId: null,
          websiteScore: null,
          bestOpportunity: null,
          opportunityCount: 0,
          leadScore: {
            available: false,
            score: null,
            tier: null,
            reason: "BUSINESS_LEVEL_LEAD_MODEL_NOT_IMPLEMENTED",
          },
        } satisfies DashboardBusinessRow;
      }
    }),
  );

  const orderedBusinesses = businesses.sort((a, b) => a.resultPosition - b.resultPosition);

  return {
    dashboardVersion: DASHBOARD_VERSION,
    market: toSearchSummary(selectedSearch),
    summary: buildSummary(orderedBusinesses, resultByOpportunityRunId),
    businesses: orderedBusinesses,
    searchHistory: searchHistoryRows.map(toSearchSummary),
    dataNotes: {
      googlePlaceContentPersisted: false,
      googlePlaceDetailsRetrievedLive: true,
      leadScoreStatus: "UNAVAILABLE_UNTIL_BUSINESS_LEVEL_MODEL_EXISTS",
    },
  };
}
