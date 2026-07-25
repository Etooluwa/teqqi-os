import { OPPORTUNITY_ENGINE_VERSION } from "./config";
import { WebsiteOpportunityError } from "./detection";
import type {
  GroupedOpportunityCandidate,
  OpportunityAssessment,
  OpportunityAssessmentResult,
  OpportunityPriority,
  OpportunityScoringContext,
  RecommendationConfidence,
} from "./types";

function validateScore(value: number | null | undefined, label: string): number | null {
  if (value === null || value === undefined) return null;
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    throw new WebsiteOpportunityError(`${label} must be between 0 and 100 when available.`);
  }
  return value;
}

function relevantCategoryScore(
  group: GroupedOpportunityCandidate,
  scoring: OpportunityScoringContext,
): number | null {
  const scores = group.categories
    .map((category) => validateScore(scoring.categoryScores[category], `${category} score`))
    .filter((score): score is number => score !== null);

  return scores.length > 0 ? Math.min(...scores) : null;
}

function assessPriority(
  group: GroupedOpportunityCandidate,
  categoryScore: number | null,
): { priority: OpportunityPriority; reasons: string[] } {
  const reasons: string[] = [];

  if (group.failCount >= 3) {
    reasons.push("Three or more confirmed failing findings support this opportunity.");
  }
  if (group.failCount >= 1 && categoryScore !== null && categoryScore <= 40) {
    reasons.push("At least one failing finding is reinforced by a category score of 40 or below.");
  }
  if (reasons.length > 0) return { priority: "CRITICAL", reasons };

  if (group.failCount >= 2) {
    reasons.push("Two confirmed failing findings support this opportunity.");
  }
  if (group.candidateCount >= 4) {
    reasons.push("Four or more eligible findings are concentrated in this opportunity.");
  }
  if (categoryScore !== null && categoryScore <= 60) {
    reasons.push("The relevant category score is 60 or below.");
  }
  if (reasons.length > 0) return { priority: "HIGH", reasons };

  if (group.failCount >= 1) {
    reasons.push("At least one confirmed failing finding supports this opportunity.");
  }
  if (group.warningCount >= 2) {
    reasons.push("Multiple warning findings support this opportunity.");
  }
  if (categoryScore !== null && categoryScore <= 80) {
    reasons.push("The relevant category score is 80 or below.");
  }
  if (reasons.length > 0) return { priority: "MEDIUM", reasons };

  return {
    priority: "LOW",
    reasons: ["The opportunity is supported, but current evidence does not meet higher priority thresholds."],
  };
}

function assessConfidence(
  group: GroupedOpportunityCandidate,
): { confidence: RecommendationConfidence; reasons: string[] } {
  if (
    group.highConfidenceCount >= 2 &&
    group.highConfidenceCount >= group.mediumConfidenceCount
  ) {
    return {
      confidence: "HIGH",
      reasons: ["Multiple HIGH-confidence findings consistently support this opportunity."],
    };
  }

  if (group.highConfidenceCount >= 1) {
    return {
      confidence: "MEDIUM",
      reasons: ["At least one HIGH-confidence finding supports this opportunity."],
    };
  }

  if (group.mediumConfidenceCount >= 2) {
    return {
      confidence: "MEDIUM",
      reasons: ["Multiple MEDIUM-confidence findings consistently support this opportunity."],
    };
  }

  return {
    confidence: "LOW",
    reasons: ["The opportunity depends on a single MEDIUM-confidence finding."],
  };
}

export function assessOpportunityGroups(
  groups: readonly GroupedOpportunityCandidate[],
  scoring: OpportunityScoringContext,
): OpportunityAssessmentResult {
  if (!scoring.scoringModelVersion || scoring.scoringModelVersion.trim() === "") {
    throw new WebsiteOpportunityError("A scoring model version is required for opportunity assessment.");
  }
  validateScore(scoring.websiteScore, "Website Score");
  if (!Number.isInteger(scoring.criticalFailureCount) || scoring.criticalFailureCount < 0) {
    throw new WebsiteOpportunityError("criticalFailureCount must be a non-negative integer.");
  }

  const seenGroups = new Set<string>();
  const assessments: OpportunityAssessment[] = groups.map((group) => {
    if (seenGroups.has(group.groupId)) {
      throw new WebsiteOpportunityError(`Duplicate opportunity group ${group.groupId}.`);
    }
    seenGroups.add(group.groupId);

    if (group.candidateCount <= 0 || group.supportingFindingIds.length === 0) {
      throw new WebsiteOpportunityError(`${group.groupId} must contain supporting evidence.`);
    }
    if (group.failCount + group.warningCount !== group.candidateCount) {
      throw new WebsiteOpportunityError(`${group.groupId} status counts do not reconcile.`);
    }
    if (group.highConfidenceCount + group.mediumConfidenceCount !== group.candidateCount) {
      throw new WebsiteOpportunityError(`${group.groupId} confidence counts do not reconcile.`);
    }

    const categoryScore = relevantCategoryScore(group, scoring);
    const priority = assessPriority(group, categoryScore);
    const confidence = assessConfidence(group);

    return {
      groupId: group.groupId,
      type: group.type,
      priority: priority.priority,
      confidence: confidence.confidence,
      categoryScore,
      websiteScore: scoring.websiteScore,
      criticalFailureCount: scoring.criticalFailureCount,
      evidenceStrength: {
        candidateCount: group.candidateCount,
        failCount: group.failCount,
        warningCount: group.warningCount,
        highConfidenceCount: group.highConfidenceCount,
        mediumConfidenceCount: group.mediumConfidenceCount,
      },
      priorityReasons: priority.reasons,
      confidenceReasons: confidence.reasons,
    };
  });

  return {
    opportunityEngineVersion: OPPORTUNITY_ENGINE_VERSION,
    scoringModelVersion: scoring.scoringModelVersion,
    groupCount: assessments.length,
    assessments,
  };
}
