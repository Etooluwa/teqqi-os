import type {
  CriticalCapThreshold,
  ScoringCategory,
  ScoringConfidence,
  ScoringRuleConfig,
  ScoringRuleStatus,
} from "./types";

export const SCORING_MODEL_VERSION = "1.0.0" as const;

export const CATEGORY_WEIGHTS: Readonly<Record<ScoringCategory, number>> = {
  TECHNICAL_HEALTH: 0.25,
  SEO: 0.1,
  PERFORMANCE: 0.18,
  ACCESSIBILITY: 0.18,
  CONVERSION_UX: 0.19,
  CONTENT_QUALITY: 0.1,
};

export const EXPECTED_RULE_COUNTS: Readonly<Record<ScoringCategory, number>> = {
  TECHNICAL_HEALTH: 38,
  SEO: 24,
  PERFORMANCE: 16,
  ACCESSIBILITY: 22,
  CONVERSION_UX: 22,
  CONTENT_QUALITY: 18,
};

export const STATUS_MULTIPLIERS: Readonly<
  Record<Extract<ScoringRuleStatus, "PASS" | "WARNING" | "FAIL">, number>
> = {
  PASS: 1,
  WARNING: 0.5,
  FAIL: 0,
};

export const CONFIDENCE_PARTICIPATION: Readonly<Record<ScoringConfidence, boolean>> = {
  HIGH: true,
  MEDIUM: true,
  LOW: false,
};

export const CRITICAL_CAP_THRESHOLDS: readonly CriticalCapThreshold[] = [
  { minimumFailures: 3, maximumWebsiteScore: 40 },
  { minimumFailures: 2, maximumWebsiteScore: 60 },
  { minimumFailures: 1, maximumWebsiteScore: 80 },
] as const;

function buildRuleConfigs(
  prefix: string,
  category: ScoringCategory,
  points: readonly number[],
): ScoringRuleConfig[] {
  return points.map((maxPoints, index) => ({
    ruleId: `${prefix}-${String(index + 1).padStart(3, "0")}`,
    category,
    maxPoints,
  }));
}

const technicalHealthPoints = [
  5, 5, 5, 5, 4, 5, 4, 5, 2, 4, 2, 5, 2, 3, 2, 2, 5, 2, 3,
  5, 4, 2, 2, 3, 4, 5, 5, 4, 3, 1, 3, 5, 4, 1, 1, 2, 4, 4,
] as const;

const seoPoints = [
  4, 3, 3, 3, 2, 2, 4, 3, 2, 3, 4, 4, 5, 5, 2, 1, 2, 3, 4, 3, 1, 2, 2, 3,
] as const;

const performancePoints = [
  5, 4, 5, 3, 4, 3, 4, 2, 4, 3, 3, 3, 2, 2, 3, 4,
] as const;

const accessibilityPoints = [
  4, 4, 5, 3, 4, 5, 4, 4, 5, 5, 4, 5, 5, 3, 2, 3, 3, 2, 3, 3, 3, 2,
] as const;

const conversionUxPoints = [
  4, 4, 5, 5, 3, 5, 2, 5, 4, 3, 5, 4, 4, 5, 2, 2, 5, 2, 3, 5, 4, 5,
] as const;

const contentQualityPoints = [
  5, 3, 3, 4, 5, 4, 4, 3, 4, 3, 3, 2, 2, 1, 3, 1, 2, 3,
] as const;

export const SCORING_RULES: readonly ScoringRuleConfig[] = [
  ...buildRuleConfigs("TECH", "TECHNICAL_HEALTH", technicalHealthPoints),
  ...buildRuleConfigs("SEO", "SEO", seoPoints),
  ...buildRuleConfigs("PERF", "PERFORMANCE", performancePoints),
  ...buildRuleConfigs("A11Y", "ACCESSIBILITY", accessibilityPoints),
  ...buildRuleConfigs("CUX", "CONVERSION_UX", conversionUxPoints),
  ...buildRuleConfigs("CONTENT", "CONTENT_QUALITY", contentQualityPoints),
] as const;

export const SCORING_RULE_BY_ID: ReadonlyMap<string, ScoringRuleConfig> = new Map(
  SCORING_RULES.map((rule) => [rule.ruleId, rule]),
);

export const CATEGORY_RAW_POINT_TOTALS: Readonly<Record<ScoringCategory, number>> =
  SCORING_RULES.reduce(
    (totals, rule) => {
      totals[rule.category] += rule.maxPoints;
      return totals;
    },
    {
      TECHNICAL_HEALTH: 0,
      SEO: 0,
      PERFORMANCE: 0,
      ACCESSIBILITY: 0,
      CONVERSION_UX: 0,
      CONTENT_QUALITY: 0,
    } satisfies Record<ScoringCategory, number>,
  );

export function validateScoringConfiguration(): void {
  if (SCORING_RULES.length !== 140) {
    throw new Error(`Scoring configuration must contain 140 rules; found ${SCORING_RULES.length}.`);
  }

  const ids = SCORING_RULES.map((rule) => rule.ruleId);
  if (new Set(ids).size !== ids.length) {
    throw new Error("Scoring configuration contains duplicate rule IDs.");
  }

  for (const rule of SCORING_RULES) {
    if (!Number.isFinite(rule.maxPoints) || rule.maxPoints <= 0) {
      throw new Error(`${rule.ruleId} has an invalid maximum point value.`);
    }
  }

  for (const [category, expectedCount] of Object.entries(EXPECTED_RULE_COUNTS) as Array<
    [ScoringCategory, number]
  >) {
    const actualCount = SCORING_RULES.filter((rule) => rule.category === category).length;
    if (actualCount !== expectedCount) {
      throw new Error(`${category} must contain ${expectedCount} rules; found ${actualCount}.`);
    }
  }

  const totalWeight = Object.values(CATEGORY_WEIGHTS).reduce((sum, weight) => sum + weight, 0);
  if (Math.abs(totalWeight - 1) > Number.EPSILON * 10) {
    throw new Error(`Category weights must total 1.0; found ${totalWeight}.`);
  }
}

validateScoringConfiguration();
