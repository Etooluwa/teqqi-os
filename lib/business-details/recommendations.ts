import type { BusinessDetailAnalyzerFindings, BusinessDetailOpportunityRun } from "./types";
import type { WebsiteOpportunity } from "@/lib/website-opportunities/types";

export type BusinessDetailRecommendationEvidence = {
  ruleId: string;
  category: string;
  status: string;
  confidence: string;
  summary: string;
  evidence: Record<string, unknown>;
  detectorVersion: string;
};

export type BusinessDetailRecommendation = WebsiteOpportunity & {
  evidenceCount: number;
  evidence: BusinessDetailRecommendationEvidence[];
};

export type BusinessDetailRecommendations = {
  available: boolean;
  unavailableReason: "NO_COMPLETED_OPPORTUNITY_RUN" | null;
  opportunityEngineVersion: string | null;
  scoringModelVersion: string | null;
  opportunityCount: number;
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
      opportunityEngineVersion: null,
      scoringModelVersion: null,
      opportunityCount: 0,
      recommendations: [],
    };
  }

  const findingById = new Map(
    analyzerFindings.groups.flatMap((group) => group.findings).map((finding) => [finding.ruleId, finding] as const),
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
        summary: finding.summary,
        evidence: finding.evidence,
        detectorVersion: finding.detectorVersion,
      }];
    });

    return { ...opportunity, evidenceCount: evidence.length, evidence };
  });

  return {
    available: true,
    unavailableReason: null,
    opportunityEngineVersion: opportunityRun.opportunityEngineVersion,
    scoringModelVersion: opportunityRun.scoringModelVersion,
    opportunityCount: recommendations.length,
    recommendations,
  };
}
