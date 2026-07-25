import {
  CRITICAL_CAP_THRESHOLDS,
  CRITICAL_FAILURE_RULE_ID_SET,
  SCORING_MODEL_VERSION,
  SCORING_RULE_BY_ID,
} from "./config";
import { WebsiteScoringError } from "./rule-score";
import type {
  CriticalCapResult,
  CriticalFailureTrigger,
  RuleScoreResult,
  WebsiteScoreResult,
} from "./types";

function findApplicableCap(criticalFailureCount: number): number | null {
  const threshold = CRITICAL_CAP_THRESHOLDS.find(
    (candidate) => criticalFailureCount >= candidate.minimumFailures,
  );
  return threshold?.maximumWebsiteScore ?? null;
}

function isParticipatingCriticalFailure(result: RuleScoreResult): boolean {
  return (
    CRITICAL_FAILURE_RULE_ID_SET.has(result.ruleId) &&
    result.included &&
    result.status === "FAIL" &&
    (result.confidence === "HIGH" || result.confidence === "MEDIUM")
  );
}

export function applyCriticalFailureCaps(
  websiteScore: WebsiteScoreResult,
  ruleScores: readonly RuleScoreResult[],
): CriticalCapResult {
  if (websiteScore.scoringModelVersion !== SCORING_MODEL_VERSION) {
    throw new WebsiteScoringError(
      `Website score model version ${websiteScore.scoringModelVersion} does not match active model ${SCORING_MODEL_VERSION}.`,
    );
  }

  if (websiteScore.available !== (websiteScore.score !== null)) {
    throw new WebsiteScoringError("Website score has inconsistent score/availability values.");
  }

  const seen = new Set<string>();
  for (const result of ruleScores) {
    if (seen.has(result.ruleId)) {
      throw new WebsiteScoringError(`Critical-cap evaluation received duplicate rule score ${result.ruleId}.`);
    }
    seen.add(result.ruleId);

    const config = SCORING_RULE_BY_ID.get(result.ruleId);
    if (!config) {
      throw new WebsiteScoringError(`No scoring configuration exists for ${result.ruleId}.`);
    }
    if (config.category !== result.category) {
      throw new WebsiteScoringError(
        `${result.ruleId} belongs to ${config.category}, not ${result.category}.`,
      );
    }
  }

  const criticalFailures: CriticalFailureTrigger[] = ruleScores
    .filter(isParticipatingCriticalFailure)
    .map((result) => ({
      ruleId: result.ruleId,
      category: result.category,
      status: "FAIL" as const,
      confidence: result.confidence as "HIGH" | "MEDIUM",
    }));

  const applicableCriticalCap = findApplicableCap(criticalFailures.length);
  const uncappedWebsiteScore = websiteScore.score;
  const finalWebsiteScore =
    uncappedWebsiteScore === null
      ? null
      : applicableCriticalCap === null
        ? uncappedWebsiteScore
        : Math.min(uncappedWebsiteScore, applicableCriticalCap);

  return {
    scoringModelVersion: SCORING_MODEL_VERSION,
    uncappedWebsiteScore,
    finalWebsiteScore,
    scoreAvailable: finalWebsiteScore !== null,
    criticalFailureCount: criticalFailures.length,
    criticalFailures,
    applicableCriticalCap,
    capApplied:
      uncappedWebsiteScore !== null &&
      finalWebsiteScore !== null &&
      finalWebsiteScore < uncappedWebsiteScore,
  };
}