import {
  CATEGORY_WEIGHTS,
  SCORING_MODEL_VERSION,
} from "./config";
import { WebsiteScoringError } from "./rule-score";
import type {
  CategoryScoreResult,
  ScoringCategory,
  WebsiteScoreResult,
  WeightedCategoryContribution,
} from "./types";

const SCORING_CATEGORIES = Object.keys(CATEGORY_WEIGHTS) as ScoringCategory[];

function clampScore(value: number): number {
  return Math.min(100, Math.max(0, value));
}

export function calculateWebsiteScore(
  categoryScores: readonly CategoryScoreResult[],
): WebsiteScoreResult {
  const seen = new Set<ScoringCategory>();
  const byCategory = new Map<ScoringCategory, CategoryScoreResult>();

  for (const categoryScore of categoryScores) {
    if (!SCORING_CATEGORIES.includes(categoryScore.category)) {
      throw new WebsiteScoringError(`Unsupported scoring category ${categoryScore.category}.`);
    }
    if (seen.has(categoryScore.category)) {
      throw new WebsiteScoringError(
        `Duplicate category score supplied for ${categoryScore.category}.`,
      );
    }
    seen.add(categoryScore.category);
    byCategory.set(categoryScore.category, categoryScore);
  }

  for (const category of SCORING_CATEGORIES) {
    if (!byCategory.has(category)) {
      throw new WebsiteScoringError(`Missing category score for ${category}.`);
    }
  }

  const categories: WeightedCategoryContribution[] = SCORING_CATEGORIES.map((category) => {
    const result = byCategory.get(category)!;
    const weight = CATEGORY_WEIGHTS[category];

    if (result.available !== (result.score !== null)) {
      throw new WebsiteScoringError(
        `${category} has inconsistent score/availability values.`,
      );
    }

    if (result.score !== null && (!Number.isFinite(result.score) || result.score < 0 || result.score > 100)) {
      throw new WebsiteScoringError(`${category} score must be between 0 and 100.`);
    }

    return {
      category,
      score: result.score,
      available: result.available,
      weight,
      weightedContribution: result.score === null ? null : (result.score * weight),
    };
  });

  const unavailableCategories = categories
    .filter((category) => !category.available)
    .map((category) => category.category);

  const measuredWeight = categories
    .filter((category) => category.available)
    .reduce((sum, category) => sum + category.weight, 0);

  const measuredWeightedTotal = categories.reduce(
    (sum, category) => sum + (category.weightedContribution ?? 0),
    0,
  );

  const complete = unavailableCategories.length === 0;
  const score = complete ? clampScore(measuredWeightedTotal) : null;

  return {
    scoringModelVersion: SCORING_MODEL_VERSION,
    score,
    available: complete,
    measuredWeight,
    missingWeight: 1 - measuredWeight,
    measuredWeightedTotal,
    categories,
    unavailableCategories,
  };
}
