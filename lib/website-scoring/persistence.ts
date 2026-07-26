import "server-only";

import { supabaseRest } from "@/lib/supabase/server";
import type { AnalyzerFinding } from "@/lib/website-analyzer/types";
import type {
  CategoryScoreResult,
  UnifiedWebsiteScoringResult,
  WeightedCategoryContribution,
} from "./types";

type PersistScoringRunInput = {
  requestedUrl: string;
  finalUrl: string;
  analyzerVersion: string;
  analyzerFindings: AnalyzerFinding[];
  scoring: UnifiedWebsiteScoringResult;
};

type ScoringRunRow = {
  id: string;
  website_id: string | null;
  audit_id: string | null;
  requested_url: string;
  final_url: string;
  analyzer_version: string;
  analyzer_findings: AnalyzerFinding[] | null;
  scoring_model_version: string;
  website_score: string | number | null;
  uncapped_website_score: string | number | null;
  applied_critical_cap: string | number | null;
  score_available: boolean;
  critical_failure_count: number;
  critical_failures: unknown;
  unavailable_categories: unknown;
  measured_weight: string | number;
  missing_weight: string | number;
  measured_weighted_total: string | number;
  explanation: UnifiedWebsiteScoringResult;
  status: "COMPLETED" | "FAILED";
  created_at: string;
};

type CategoryRow = {
  id: string;
  scoring_run_id: string;
  category: string;
  score: string | number | null;
  category_weight: string | number;
  weighted_contribution: string | number | null;
  earned_points: string | number;
  available_points: string | number;
  configured_rule_count: number;
  provided_finding_count: number;
  included_rule_count: number;
  excluded_rule_count: number;
  rule_scores: unknown;
  created_at: string;
};

function canonicalDomain(url: string): string {
  const hostname = new URL(url).hostname.toLowerCase();
  return hostname.replace(/^www\./, "");
}

async function resolveWebsiteId(finalUrl: string): Promise<string | null> {
  const domain = canonicalDomain(finalUrl);
  const encoded = encodeURIComponent(domain);
  const rows = await supabaseRest<Array<{ id: string }>>(
    `/websites?canonical_domain=eq.${encoded}&deleted_at=is.null&select=id&limit=1`,
  );
  return rows[0]?.id ?? null;
}

function categoryPayload(
  scoringRunId: string,
  category: CategoryScoreResult,
  weighted: WeightedCategoryContribution,
) {
  return {
    scoring_run_id: scoringRunId,
    category: category.category,
    score: category.score,
    category_weight: weighted.weight,
    weighted_contribution: weighted.weightedContribution,
    earned_points: category.earnedPoints,
    available_points: category.availablePoints,
    configured_rule_count: category.configuredRuleCount,
    provided_finding_count: category.providedFindingCount,
    included_rule_count: category.includedRuleCount,
    excluded_rule_count: category.excludedRuleCount,
    rule_scores: category.ruleScores,
  };
}

export async function persistWebsiteScoringRun(
  input: PersistScoringRunInput,
): Promise<{ scoringRunId: string; websiteId: string | null }> {
  const websiteId = await resolveWebsiteId(input.finalUrl);
  const [run] = await supabaseRest<ScoringRunRow[]>("/website_scoring_runs", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: {
      website_id: websiteId,
      requested_url: input.requestedUrl,
      final_url: input.finalUrl,
      analyzer_version: input.analyzerVersion,
      analyzer_findings: input.analyzerFindings,
      scoring_model_version: input.scoring.scoringModelVersion,
      website_score: input.scoring.websiteScore,
      uncapped_website_score: input.scoring.uncappedWebsiteScore,
      applied_critical_cap: input.scoring.appliedCriticalCap,
      score_available: input.scoring.scoreAvailable,
      critical_failure_count: input.scoring.criticalFailureCount,
      critical_failures: input.scoring.criticalFailures,
      unavailable_categories: input.scoring.unavailableCategories,
      measured_weight: input.scoring.measuredWeight,
      missing_weight: input.scoring.missingWeight,
      measured_weighted_total: input.scoring.measuredWeightedTotal,
      explanation: input.scoring,
      status: "COMPLETED",
    },
  });

  if (!run) {
    throw new Error("Supabase did not return the persisted website scoring run.");
  }

  try {
    const weightedByCategory = new Map(
      input.scoring.weightedCategories.map((item) => [item.category, item]),
    );
    const rows = input.scoring.categoryScores.map((category) => {
      const weighted = weightedByCategory.get(category.category);
      if (!weighted) {
        throw new Error(`Missing weighted contribution for ${category.category}.`);
      }
      return categoryPayload(run.id, category, weighted);
    });

    await supabaseRest<CategoryRow[]>("/website_scoring_category_results", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: rows,
    });
  } catch (error) {
    await supabaseRest<void>(`/website_scoring_runs?id=eq.${encodeURIComponent(run.id)}`, {
      method: "DELETE",
    });
    throw error;
  }

  return { scoringRunId: run.id, websiteId };
}

export async function getWebsiteScoringRun(scoringRunId: string) {
  const encodedId = encodeURIComponent(scoringRunId);
  const [run] = await supabaseRest<ScoringRunRow[]>(
    `/website_scoring_runs?id=eq.${encodedId}&select=*&limit=1`,
  );
  if (!run) return null;

  const categories = await supabaseRest<CategoryRow[]>(
    `/website_scoring_category_results?scoring_run_id=eq.${encodedId}&select=*&order=category.asc`,
  );

  return { run, categories };
}
