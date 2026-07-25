import {
  CONFIDENCE_PARTICIPATION,
  SCORING_RULE_BY_ID,
  STATUS_MULTIPLIERS,
} from "./config";
import type {
  RuleScoreExclusionReason,
  RuleScoreResult,
  ScorableFinding,
} from "./types";

export class WebsiteScoringError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WebsiteScoringError";
  }
}

function excludedResult(
  finding: ScorableFinding,
  maxPoints: number,
  exclusionReason: RuleScoreExclusionReason,
): RuleScoreResult {
  return {
    ruleId: finding.ruleId,
    category: finding.category,
    status: finding.status,
    confidence: finding.confidence,
    maxPoints,
    multiplier: null,
    earnedPoints: 0,
    included: false,
    exclusionReason,
  };
}

export function scoreFinding(finding: ScorableFinding): RuleScoreResult {
  const config = SCORING_RULE_BY_ID.get(finding.ruleId);
  if (!config) {
    throw new WebsiteScoringError(`No scoring configuration exists for ${finding.ruleId}.`);
  }

  if (config.category !== finding.category) {
    throw new WebsiteScoringError(
      `${finding.ruleId} belongs to ${config.category}, not ${finding.category}.`,
    );
  }

  if (finding.status === "NOT_APPLICABLE") {
    if (finding.applicable) {
      throw new WebsiteScoringError(
        `${finding.ruleId} has inconsistent applicable/status values.`,
      );
    }
    return excludedResult(finding, config.maxPoints, "NOT_APPLICABLE");
  }

  if (!finding.applicable) {
    throw new WebsiteScoringError(
      `${finding.ruleId} has inconsistent applicable/status values.`,
    );
  }

  if (finding.status === "UNKNOWN") {
    return excludedResult(finding, config.maxPoints, "UNKNOWN");
  }

  if (!CONFIDENCE_PARTICIPATION[finding.confidence]) {
    return excludedResult(finding, config.maxPoints, "LOW_CONFIDENCE");
  }

  const multiplier = STATUS_MULTIPLIERS[finding.status];
  return {
    ruleId: finding.ruleId,
    category: finding.category,
    status: finding.status,
    confidence: finding.confidence,
    maxPoints: config.maxPoints,
    multiplier,
    earnedPoints: config.maxPoints * multiplier,
    included: true,
    exclusionReason: null,
  };
}
