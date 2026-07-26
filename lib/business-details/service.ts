import "server-only";

import { getGooglePlaceDetails } from "@/lib/business-discovery/google-places";
import { supabaseRest } from "@/lib/supabase/server";
import type { AnalyzerFinding } from "@/lib/website-analyzer/types";
import type { WebsiteOpportunityEngineResult } from "@/lib/website-opportunities/types";
import type { UnifiedWebsiteScoringResult } from "@/lib/website-scoring/types";
import { buildBusinessDetailAnalyzerFindings } from "./analyzer-findings";
import { buildBusinessDetailRecommendations } from "./recommendations";
import { buildBusinessDetailScoreBreakdown } from "./score-breakdown";
import type { BusinessDetailSnapshot } from "./types";

const DETAIL_VERSION = "1.0.0" as const;

type SearchPlaceRow = { search_id: string; result_position: number };
type SearchHistoryRow = { id: string; industry: string; location_text: string; created_at: string };
type ScoringRunRow = {
  id: string; website_id: string | null; requested_url: string; final_url: string;
  analyzer_version: string; analyzer_findings: AnalyzerFinding[] | null; scoring_model_version: string;
  website_score: string | number | null; score_available: boolean; explanation: UnifiedWebsiteScoringResult; created_at: string;
};
type OpportunityRunRow = {
  id: string; scoring_run_id: string; website_id: string | null; requested_url: string; final_url: string;
  analyzer_version: string; scoring_model_version: string; opportunity_engine_version: string;
  result: WebsiteOpportunityEngineResult; created_at: string;
};

export class BusinessDetailError extends Error {
  constructor(message: string, public readonly code: "BUSINESS_NOT_FOUND" | "BUSINESS_DETAIL_ERROR" = "BUSINESS_DETAIL_ERROR") {
    super(message); this.name = "BusinessDetailError";
  }
}

function canonicalDomain(url: string | null): string | null {
  if (!url) return null;
  try { return new URL(url).hostname.toLowerCase().replace(/^www\./, ""); } catch { return null; }
}
function numeric(value: string | number | null): number | null {
  if (value === null) return null; const parsed = Number(value); return Number.isFinite(parsed) ? parsed : null;
}

async function loadDiscoveryContext(externalId: string) {
  const encodedExternalId = encodeURIComponent(externalId);
  const references = await supabaseRest<SearchPlaceRow[]>(`/search_place_results?provider=eq.GOOGLE_PLACES&external_id=eq.${encodedExternalId}&select=search_id,result_position&limit=1`);
  const reference = references[0]; if (!reference) return null;
  const searchId = encodeURIComponent(reference.search_id);
  const searches = await supabaseRest<SearchHistoryRow[]>(`/search_history?id=eq.${searchId}&select=id,industry,location_text,created_at&limit=1`);
  const search = searches[0]; if (!search) return null;
  return { searchId: search.id, industry: search.industry, location: search.location_text, resultPosition: reference.result_position, discoveredAt: search.created_at };
}
async function loadLatestScoringRun(domain: string): Promise<ScoringRunRow | null> {
  const rows = await supabaseRest<ScoringRunRow[]>("/website_scoring_runs?status=eq.COMPLETED&select=id,website_id,requested_url,final_url,analyzer_version,analyzer_findings,scoring_model_version,website_score,score_available,explanation,created_at&order=created_at.desc&limit=1000");
  return rows.find((row) => canonicalDomain(row.final_url) === domain) ?? null;
}
async function loadLatestOpportunityRun(domain: string): Promise<OpportunityRunRow | null> {
  const rows = await supabaseRest<OpportunityRunRow[]>("/website_opportunity_runs?status=eq.COMPLETED&select=id,scoring_run_id,website_id,requested_url,final_url,analyzer_version,scoring_model_version,opportunity_engine_version,result,created_at&order=created_at.desc&limit=1000");
  return rows.find((row) => canonicalDomain(row.final_url) === domain) ?? null;
}

export async function buildBusinessDetailSnapshot(externalId: string): Promise<BusinessDetailSnapshot> {
  const placeId = externalId.trim();
  if (!placeId) throw new BusinessDetailError("A Google Place ID is required.", "BUSINESS_NOT_FOUND");
  const discovery = await loadDiscoveryContext(placeId);
  if (!discovery) throw new BusinessDetailError("This business has not been discovered by TEQQI OS.", "BUSINESS_NOT_FOUND");
  let business;
  try { business = await getGooglePlaceDetails(placeId, discovery.resultPosition); }
  catch (error) { throw new BusinessDetailError(error instanceof Error ? `Live business details could not be loaded: ${error.message}` : "Live business details could not be loaded."); }
  const domain = canonicalDomain(business.websiteUrl);
  const [scoringRow, opportunityRow] = domain ? await Promise.all([loadLatestScoringRun(domain), loadLatestOpportunityRun(domain)]) : [null, null];
  const scoringRun = scoringRow ? {
    scoringRunId: scoringRow.id, websiteId: scoringRow.website_id, requestedUrl: scoringRow.requested_url, finalUrl: scoringRow.final_url,
    analyzerVersion: scoringRow.analyzer_version, scoringModelVersion: scoringRow.scoring_model_version, websiteScore: numeric(scoringRow.website_score),
    scoreAvailable: scoringRow.score_available, createdAt: scoringRow.created_at, analyzerFindings: scoringRow.analyzer_findings, scoring: scoringRow.explanation,
  } : null;
  const opportunityRun = opportunityRow ? {
    opportunityRunId: opportunityRow.id, scoringRunId: opportunityRow.scoring_run_id, websiteId: opportunityRow.website_id,
    requestedUrl: opportunityRow.requested_url, finalUrl: opportunityRow.final_url, analyzerVersion: opportunityRow.analyzer_version,
    scoringModelVersion: opportunityRow.scoring_model_version, opportunityEngineVersion: opportunityRow.opportunity_engine_version,
    createdAt: opportunityRow.created_at, result: opportunityRow.result,
  } : null;
  const scoreBreakdown = buildBusinessDetailScoreBreakdown(scoringRun?.scoring ?? null);
  const analyzerFindings = buildBusinessDetailAnalyzerFindings({
    analyzerVersion: scoringRun?.analyzerVersion ?? null, findings: scoringRun?.analyzerFindings ?? null,
    ruleScores: scoringRun?.scoring.ruleScores ?? null, hasScoringRun: Boolean(scoringRun),
  });
  const recommendations = buildBusinessDetailRecommendations(opportunityRun, analyzerFindings);
  return {
    detailVersion: DETAIL_VERSION, externalId: placeId, business, discovery,
    intelligence: { available: Boolean(scoringRun || opportunityRun), websiteUrl: business.websiteUrl, scoringRun, scoreBreakdown, analyzerFindings, opportunityRun, recommendations },
    leadScore: { available: false, score: null, tier: null, reason: "BUSINESS_LEVEL_LEAD_MODEL_NOT_IMPLEMENTED" },
    dataNotes: { googlePlaceContentPersisted: false, googlePlaceDetailsRetrievedLive: true, intelligenceSource: "LATEST_COMPLETED_RUNS_FOR_CANONICAL_DOMAIN", leadScoreStatus: "UNAVAILABLE_UNTIL_BUSINESS_LEVEL_MODEL_EXISTS" },
  };
}
