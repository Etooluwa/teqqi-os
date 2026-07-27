import "server-only";

import { supabaseRest } from "@/lib/supabase/server";
import { WEBSITE_ANALYZER_VERSION } from "@/lib/website-analyzer/version";
import { SCORING_MODEL_VERSION } from "@/lib/website-scoring/config";
import { OPPORTUNITY_ENGINE_VERSION } from "./config";
import type { WebsiteOpportunity, WebsiteOpportunityEngineResult } from "./types";

type PersistOpportunityRunInput = {
  scoringRunId: string;
  websiteId: string | null;
  requestedUrl: string;
  finalUrl: string;
  analyzerVersion: string;
  result: WebsiteOpportunityEngineResult;
};

export type OpportunityRunRow = {
  id: string;
  scoring_run_id: string;
  website_id: string | null;
  requested_url: string;
  final_url: string;
  analyzer_version: string;
  scoring_model_version: string;
  opportunity_engine_version: string;
  evaluated_finding_count: number;
  eligible_finding_count: number;
  excluded_finding_count: number;
  candidate_count: number;
  opportunity_count: number;
  result: WebsiteOpportunityEngineResult;
  status: "COMPLETED" | "FAILED";
  created_at: string;
};

type OpportunityRow = {
  id: string;
  opportunity_run_id: string;
  opportunity_key: string;
  opportunity_type: string;
  title: string;
  priority: string;
  confidence: string;
  recommended_service: string;
  supporting_finding_ids: unknown;
  candidate_ids: unknown;
  detection_rule_ids: unknown;
  categories: unknown;
  category_score: string | number | null;
  website_score: string | number | null;
  critical_failure_count: number;
  recommendation: string;
  explanation: string;
  priority_reasons: unknown;
  confidence_reasons: unknown;
  opportunity_engine_version: string;
  scoring_model_version: string;
  created_at: string;
};

function canonicalDomain(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

export async function findReusableWebsiteOpportunityRun(
  rawUrl: string,
  maxAgeMs: number,
): Promise<OpportunityRunRow | null> {
  const domain = canonicalDomain(rawUrl);
  if (!domain || !Number.isFinite(maxAgeMs) || maxAgeMs <= 0) return null;

  const cutoff = new Date(Date.now() - maxAgeMs).toISOString();
  const query = new URLSearchParams({
    status: "eq.COMPLETED",
    analyzer_version: `eq.${WEBSITE_ANALYZER_VERSION}`,
    scoring_model_version: `eq.${SCORING_MODEL_VERSION}`,
    opportunity_engine_version: `eq.${OPPORTUNITY_ENGINE_VERSION}`,
    created_at: `gte.${cutoff}`,
    select: "*",
    order: "created_at.desc",
    limit: "250",
  });
  const rows = await supabaseRest<OpportunityRunRow[]>(`/website_opportunity_runs?${query.toString()}`);

  return rows.find((row) => canonicalDomain(row.final_url) === domain) ?? null;
}

export async function findCompletedOpportunityRunForScoringRun(
  scoringRunId: string,
): Promise<OpportunityRunRow | null> {
  if (!scoringRunId.trim()) return null;
  const encoded = encodeURIComponent(scoringRunId);
  const rows = await supabaseRest<OpportunityRunRow[]>(
    `/website_opportunity_runs?scoring_run_id=eq.${encoded}&status=eq.COMPLETED&select=*&order=created_at.desc&limit=1`,
  );
  return rows[0] ?? null;
}

function opportunityPayload(runId: string, opportunity: WebsiteOpportunity) {
  return {
    opportunity_run_id: runId,
    opportunity_key: opportunity.opportunityId,
    opportunity_type: opportunity.type,
    title: opportunity.title,
    priority: opportunity.priority,
    confidence: opportunity.confidence,
    recommended_service: opportunity.recommendedService,
    supporting_finding_ids: opportunity.supportingFindingIds,
    candidate_ids: opportunity.candidateIds,
    detection_rule_ids: opportunity.detectionRuleIds,
    categories: opportunity.categories,
    category_score: opportunity.categoryScore,
    website_score: opportunity.websiteScore,
    critical_failure_count: opportunity.criticalFailureCount,
    recommendation: opportunity.recommendation,
    explanation: opportunity.explanation,
    priority_reasons: opportunity.priorityReasons,
    confidence_reasons: opportunity.confidenceReasons,
    opportunity_engine_version: opportunity.opportunityEngineVersion,
    scoring_model_version: opportunity.scoringModelVersion,
  };
}

export async function persistWebsiteOpportunityRun(
  input: PersistOpportunityRunInput,
): Promise<{ opportunityRunId: string }> {
  const [run] = await supabaseRest<OpportunityRunRow[]>("/website_opportunity_runs", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: {
      scoring_run_id: input.scoringRunId,
      website_id: input.websiteId,
      requested_url: input.requestedUrl,
      final_url: input.finalUrl,
      analyzer_version: input.analyzerVersion,
      scoring_model_version: input.result.scoringModelVersion,
      opportunity_engine_version: input.result.opportunityEngineVersion,
      evaluated_finding_count: input.result.evaluatedFindingCount,
      eligible_finding_count: input.result.eligibleFindingCount,
      excluded_finding_count: input.result.excludedFindingCount,
      candidate_count: input.result.candidateCount,
      opportunity_count: input.result.opportunityCount,
      result: input.result,
      status: "COMPLETED",
    },
  });

  if (!run) {
    throw new Error("Supabase did not return the persisted website opportunity run.");
  }

  try {
    if (input.result.opportunities.length > 0) {
      await supabaseRest<OpportunityRow[]>("/website_opportunities", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: input.result.opportunities.map((opportunity) =>
          opportunityPayload(run.id, opportunity),
        ),
      });
    }
  } catch (error) {
    await supabaseRest<void>(`/website_opportunity_runs?id=eq.${encodeURIComponent(run.id)}`, {
      method: "DELETE",
    });
    throw error;
  }

  return { opportunityRunId: run.id };
}

export async function getWebsiteOpportunityRun(opportunityRunId: string) {
  const encodedId = encodeURIComponent(opportunityRunId);
  const [run] = await supabaseRest<OpportunityRunRow[]>(
    `/website_opportunity_runs?id=eq.${encodedId}&select=*&limit=1`,
  );
  if (!run) return null;

  const opportunities = await supabaseRest<OpportunityRow[]>(
    `/website_opportunities?opportunity_run_id=eq.${encodedId}&select=*&order=created_at.asc`,
  );

  return { run, opportunities };
}
