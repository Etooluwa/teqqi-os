import type {
  ScoringCategory,
  UnifiedWebsiteScoringResult,
  WeightedCategoryContribution,
} from "@/lib/website-scoring/types";
import type {
  BusinessDetailCategoryScore,
  BusinessDetailScoreBreakdown,
} from "./types";

const CATEGORY_ORDER: readonly ScoringCategory[] = [
  "TECHNICAL_HEALTH",
  "SEO",
  "PERFORMANCE",
  "ACCESSIBILITY",
  "CONVERSION_UX",
  "CONTENT_QUALITY",
] as const;

function round(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function unavailableReason(scoring: UnifiedWebsiteScoringResult | null): BusinessDetailScoreBreakdown["unavailableReason"] {
  if (!scoring) return "NO_COMPLETED_SCORING_RUN";
  if (!scoring.scoreAvailable || scoring.websiteScore === null) return "INSUFFICIENT_ELIGIBLE_EVIDENCE";
  return null;
}

function categoryBreakdown(
  scoring: UnifiedWebsiteScoringResult,
  category: ScoringCategory,
  weighted: WeightedCategoryContribution,
): BusinessDetailCategoryScore {
  const result = scoring.categoryScores.find((item) => item.category === category);
  if (!result) throw new Error(`Missing category scoring result for ${category}.`);
  if (weighted.category !== category) throw new Error(`Weighted category mismatch for ${category}.`);

  const includedEarnedPoints = round(
    result.ruleScores.filter((rule) => rule.included).reduce((sum, rule) => sum + rule.earnedPoints, 0),
  );
  const includedAvailablePoints = round(
    result.ruleScores.filter((rule) => rule.included).reduce((sum, rule) => sum + rule.maxPoints, 0),
  );

  if (Math.abs(includedEarnedPoints - round(result.earnedPoints)) > 0.01) {
    throw new Error(`${category} earned-point explanation does not reconcile.`);
  }
  if (Math.abs(includedAvailablePoints - round(result.availablePoints)) > 0.01) {
    throw new Error(`${category} available-point explanation does not reconcile.`);
  }

  return {
    category,
    score: result.score,
    available: result.available,
    weight: weighted.weight,
    weightedContribution: weighted.weightedContribution,
    earnedPoints: result.earnedPoints,
    availablePoints: result.availablePoints,
    configuredRuleCount: result.configuredRuleCount,
    providedFindingCount: result.providedFindingCount,
    includedRuleCount: result.includedRuleCount,
    excludedRuleCount: result.excludedRuleCount,
    ruleScores: result.ruleScores,
  };
}

export function buildBusinessDetailScoreBreakdown(
  scoring: UnifiedWebsiteScoringResult | null,
): BusinessDetailScoreBreakdown {
  if (!scoring) {
    return {
      available: false,
      unavailableReason: "NO_COMPLETED_SCORING_RUN",
      scoringModelVersion: null,
      websiteScore: null,
      uncappedWebsiteScore: null,
      capApplied: false,
      appliedCriticalCap: null,
      criticalFailureCount: 0,
      criticalFailures: [],
      measuredWeight: 0,
      missingWeight: 100,
      measuredWeightedTotal: 0,
      unavailableCategories: [...CATEGORY_ORDER],
      categories: [],
      ruleCount: 0,
      includedRuleCount: 0,
      excludedRuleCount: 0,
    };
  }

  const weightedByCategory = new Map(scoring.weightedCategories.map((item) => [item.category, item]));
  const categories = CATEGORY_ORDER.map((category) => {
    const weighted = weightedByCategory.get(category);
    if (!weighted) throw new Error(`Missing weighted category contribution for ${category}.`);
    return categoryBreakdown(scoring, category, weighted);
  });

  const ruleCount = categories.reduce((sum, category) => sum + category.ruleScores.length, 0);
  const includedRuleCount = categories.reduce((sum, category) => sum + category.includedRuleCount, 0);
  const excludedRuleCount = categories.reduce((sum, category) => sum + category.excludedRuleCount, 0);

  if (ruleCount !== scoring.ruleScores.length) {
    throw new Error("Business detail score breakdown does not reconcile with the unified rule-score count.");
  }
  if (includedRuleCount + excludedRuleCount !== ruleCount) {
    throw new Error("Included and excluded rule counts do not reconcile.");
  }

  const measuredWeight = round(categories.filter((category) => category.available).reduce((sum, category) => sum + category.weight, 0));
  const missingWeight = round(100 - measuredWeight);
  if (Math.abs(measuredWeight - round(scoring.measuredWeight)) > 0.01 || Math.abs(missingWeight - round(scoring.missingWeight)) > 0.01) {
    throw new Error("Measured and missing category weights do not reconcile.");
  }

  return {
    available: scoring.scoreAvailable && scoring.websiteScore !== null,
    unavailableReason: unavailableReason(scoring),
    scoringModelVersion: scoring.scoringModelVersion,
    websiteScore: scoring.websiteScore,
    uncappedWebsiteScore: scoring.uncappedWebsiteScore,
    capApplied: scoring.capApplied,
    appliedCriticalCap: scoring.appliedCriticalCap,
    criticalFailureCount: scoring.criticalFailureCount,
    criticalFailures: scoring.criticalFailures,
    measuredWeight: scoring.measuredWeight,
    missingWeight: scoring.missingWeight,
    measuredWeightedTotal: scoring.measuredWeightedTotal,
    unavailableCategories: scoring.unavailableCategories,
    categories,
    ruleCount,
    includedRuleCount,
    excludedRuleCount,
  };
}
