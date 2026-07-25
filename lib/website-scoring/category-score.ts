import { EXPECTED_RULE_COUNTS, SCORING_RULES } from "./config";
import { scoreFinding, WebsiteScoringError } from "./rule-score";
import type {
  CategoryScoreResult,
  ScorableFinding,
  ScoringCategory,
} from "./types";

function clampScore(value: number): number {
  return Math.min(100, Math.max(0, value));
}

export function scoreCategory(
  category: ScoringCategory,
  findings: readonly ScorableFinding[],
): CategoryScoreResult {
  const configuredRules = SCORING_RULES.filter((rule) => rule.category === category);
  const expectedCount = EXPECTED_RULE_COUNTS[category];

  if (configuredRules.length !== expectedCount) {
    throw new WebsiteScoringError(
      `${category} scoring configuration expected ${expectedCount} rules but found ${configuredRules.length}.`,
    );
  }

  const seen = new Set<string>();
  for (const finding of findings) {
    if (finding.category !== category) {
      throw new WebsiteScoringError(
        `${finding.ruleId} was supplied to ${category} scoring but belongs to ${finding.category}.`,
      );
    }
    if (seen.has(finding.ruleId)) {
      throw new WebsiteScoringError(
        `${category} scoring received duplicate finding ${finding.ruleId}.`,
      );
    }
    seen.add(finding.ruleId);
  }

  const ruleScores = findings.map((finding) => scoreFinding(finding));
  const included = ruleScores.filter((result) => result.included);
  const excluded = ruleScores.filter((result) => !result.included);
  const earnedPoints = included.reduce((sum, result) => sum + result.earnedPoints, 0);
  const availablePoints = included.reduce((sum, result) => sum + result.maxPoints, 0);
  const score = availablePoints === 0 ? null : clampScore((earnedPoints / availablePoints) * 100);

  return {
    category,
    score,
    available: score !== null,
    earnedPoints,
    availablePoints,
    configuredRuleCount: configuredRules.length,
    providedFindingCount: findings.length,
    includedRuleCount: included.length,
    excludedRuleCount: excluded.length,
    ruleScores,
  };
}
