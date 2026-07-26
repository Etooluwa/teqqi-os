import type { AnalyzerCategory, ConfidenceLevel, RuleStatus } from "@/lib/website-analyzer/types";
import type { WebsiteOpportunity } from "@/lib/website-opportunities/types";
import type { RuleScoreExclusionReason } from "@/lib/website-scoring/types";
import type { BusinessDetailAnalyzerFindings, BusinessDetailOpportunityRun } from "./types";

export type BusinessDetailRecommendationEvidence = {
  ruleId: string;
  category: AnalyzerCategory;
  status: RuleStatus;
  confidence: ConfidenceLevel;
  applicable: boolean;
  summary: string;
  result: Record<string, unknown>;
  evidence: Record<string, unknown>;
  detectorVersion: string;
  scoring: {
    matched: boolean;
    included: boolean;
    exclusionReason: RuleScoreExclusionReason | null;
    earnedPoints: number | null;
    maxPoints: number | null;
  };
};

export type BusinessDetailRecommendation = WebsiteOpportunity & {
  evidenceAvailable: boolean;
  evidenceCount: number;
  expectedEvidenceCount: number;
  missingEvidenceFindingIds: string[];
  evidence: BusinessDetailRecommendationEvidence[];
};

export type BusinessDetailRecommendations = {
  available: boolean;
  unavailableReason: "NO_COMPLETED_OPPORTUNITY_RUN" | null;
  evidenceAvailable: boolean;
  evidenceUnavailableReason:
    | "NO_ANALYZER_FINDINGS_FOR_SCORING_RUN"
    | "INCOMPLETE_SUPPORTING_EVIDENCE"
    | null;
  opportunityRunId: string | null;
  scoringRunId: string | null;
  opportunityEngineVersion: string | null;
  scoringModelVersion: string | null;
  opportunityCount: number;
  recommendationCountWithCompleteEvidence: number;
  recommendations: BusinessDetailRecommendation[];
};

export function buildBusinessDetailRecommendations(
  opportunityRun: BusinessDetailOpportunityRun,
  analyzerFindings: BusinessDetailAnalyzerFindings,
): BusinessDetailRecommendations {
  if (!opportunityRun) {
    return {
      available: false,
      unavailableReason: "NO_COMPLETED_OPPORTUNITY_RUN",
      evidenceAvailable: false,
      evidenceUnavailableReason: analyzerFindings.available ? null : "NO_ANALYZER_FINDINGS_FOR_SCORING_RUN",
      opportunityRunId: null,
      scoringRunId: null,
      opportunityEngineVersion: null,
      scoringModelVersion: null,
      opportunityCount: 0,
      recommendationCountWithCompleteEvidence: 0,
      recommendations: [],
    };
  }

  const findingById = new Map(
    analyzerFindings.groups
      .flatMap((group) => group.findings)
      .map((finding) => [finding.ruleId, finding] as const),
  );

  const recommendations = opportunityRun.result.opportunities.map((opportunity) => {
    const evidence = opportunity.supportingFindingIds.flatMap((ruleId) => {
      const finding = findingById.get(ruleId);
      if (!finding) return [];
      return [{
        ruleId: finding.ruleId,
        category: finding.category,
        status: finding.status,
        confidence: finding.confidence,
        applicable: finding.applicable,
        summary: finding.summary,
        result: finding.result,
        evidence: finding.evidence,
        detectorVersion: finding.detectorVersion,
        scoring: finding.scoring,
      }];
    });

    const evidenceIds = new Set(evidence.map((item) => item.ruleId));
    const missingEvidenceFindingIds = opportunity.supportingFindingIds.filter(
      (ruleId) => !evidenceIds.has(ruleId),
    );

    return {
      ...opportunity,
      evidenceAvailable: missingEvidenceFindingIds.length === 0,
      evidenceCount: evidence.length,
      expectedEvidenceCount: opportunity.supportingFindingIds.length,
      missingEvidenceFindingIds,
      evidence,
    };
  });

  const recommendationCountWithCompleteEvidence = recommendations.filter(
    (recommendation) => recommendation.evidenceAvailable,
  ).length;
  const evidenceAvailable =
    analyzerFindings.available &&
    recommendationCountWithCompleteEvidence === recommendations.length;

  return {
    available: true,
    unavailableReason: null,
    evidenceAvailable,
    evidenceUnavailableReason: evidenceAvailable
      ? null
      : analyzerFindings.available
        ? "INCOMPLETE_SUPPORTING_EVIDENCE"
        : "NO_ANALYZER_FINDINGS_FOR_SCORING_RUN",
    opportunityRunId: opportunityRun.opportunityRunId,
    scoringRunId: opportunityRun.scoringRunId,
    opportunityEngineVersion: opportunityRun.opportunityEngineVersion,
    scoringModelVersion: opportunityRun.scoringModelVersion,
    opportunityCount: recommendations.length,
    recommendationCountWithCompleteEvidence,
    recommendations,
  };
}
