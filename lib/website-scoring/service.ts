import { CATEGORY_WEIGHTS, SCORING_MODEL_VERSION } from "./config";
import { scoreCategory } from "./category-score";
import { applyCriticalFailureCaps } from "./critical-caps";
import { WebsiteScoringError } from "./rule-score";
import { calculateWebsiteScore } from "./website-score";
import type {
  CategoryScoreResult,
  RuleScoreResult,
  ScorableFinding,
  ScoringCategory,
  UnifiedWebsiteScoringResult,
} from "./types";

const SCORING_CATEGORIES = Object.keys(CATEGORY_WEIGHTS) as ScoringCategory[];

export type WebsiteScoringInput = Readonly<Record<ScoringCategory, readonly ScorableFinding[]>>;

export function scoreWebsite(input: WebsiteScoringInput): UnifiedWebsiteScoringResult {
  const inputKeys = Object.keys(input);
  const unsupportedKeys = inputKeys.filter(
    (key) => !SCORING_CATEGORIES.includes(key as ScoringCategory),
  );
  if (unsupportedKeys.length > 0) {
    throw new WebsiteScoringError(
      `Unsupported scoring input categories: ${unsupportedKeys.join(", ")}.`,
    );
  }

  const categoryScores: CategoryScoreResult[] = SCORING_CATEGORIES.map((category) => {
    const findings = input[category];
    if (!Array.isArray(findings)) {
      throw new WebsiteScoringError(`Missing findings array for ${category}.`);
    }
    return scoreCategory(category, findings);
  });

  const ruleScores: RuleScoreResult[] = categoryScores.flatMap(
    (categoryScore) => categoryScore.ruleScores,
  );
  const websiteScore = calculateWebsiteScore(categoryScores);
  const criticalCaps = applyCriticalFailureCaps(websiteScore, ruleScores);

  return {
    scoringModelVersion: SCORING_MODEL_VERSION,
    websiteScore: criticalCaps.finalWebsiteScore,
    scoreAvailable: criticalCaps.scoreAvailable,
    uncappedWebsiteScore: criticalCaps.uncappedWebsiteScore,
    appliedCriticalCap: criticalCaps.applicableCriticalCap,
    capApplied: criticalCaps.capApplied,
    criticalFailureCount: criticalCaps.criticalFailureCount,
    criticalFailures: criticalCaps.criticalFailures,
    categoryScores,
    weightedCategories: websiteScore.categories,
    unavailableCategories: websiteScore.unavailableCategories,
    measuredWeight: websiteScore.measuredWeight,
    missingWeight: websiteScore.missingWeight,
    measuredWeightedTotal: websiteScore.measuredWeightedTotal,
    ruleScores,
  };
}
