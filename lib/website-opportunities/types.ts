import type { AnalyzerCategory, ConfidenceLevel, RuleStatus } from "@/lib/website-analyzer/types";

export type WebsiteOpportunityType =
  | "WEBSITE_REDESIGN"
  | "TECHNICAL_REMEDIATION"
  | "PERFORMANCE_OPTIMIZATION"
  | "MOBILE_EXPERIENCE"
  | "ACCESSIBILITY_REMEDIATION"
  | "CONVERSION_UX_IMPROVEMENT"
  | "CONTENT_IMPROVEMENT"
  | "SEO_IMPROVEMENT"
  | "SECURITY_CONFIGURATION";

export type WebsiteServiceId =
  | "WEBSITE_REDESIGN"
  | "TECHNICAL_WEBSITE_REMEDIATION"
  | "PERFORMANCE_OPTIMIZATION"
  | "MOBILE_OPTIMIZATION"
  | "ACCESSIBILITY_REMEDIATION"
  | "CONVERSION_UX_OPTIMIZATION"
  | "CONTENT_OPTIMIZATION"
  | "SEO_OPTIMIZATION"
  | "WEBSITE_SECURITY_CONFIGURATION";

export type OpportunityPriority = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
export type RecommendationConfidence = "HIGH" | "MEDIUM" | "LOW";

export type OpportunityFindingInput = {
  ruleId: string;
  category: AnalyzerCategory;
  status: RuleStatus;
  confidence: ConfidenceLevel;
  applicable: boolean;
};

export type OpportunityScoringContext = {
  websiteScore: number | null;
  categoryScores: Readonly<Partial<Record<AnalyzerCategory, number | null>>>;
  criticalFailureCount: number;
  scoringModelVersion: string;
};

export type WebsiteOpportunityEngineInput = {
  findings: readonly OpportunityFindingInput[];
  scoring: OpportunityScoringContext;
};

export type OpportunityCandidate = {
  candidateId: string;
  detectionRuleId: string;
  type: WebsiteOpportunityType;
  supportingFindingIds: string[];
  categories: AnalyzerCategory[];
  sourceStatus: Extract<RuleStatus, "WARNING" | "FAIL">;
  sourceConfidence: Extract<ConfidenceLevel, "HIGH" | "MEDIUM">;
};

export type OpportunityDetectionResult = {
  opportunityEngineVersion: string;
  evaluatedFindingCount: number;
  eligibleFindingCount: number;
  excludedFindingCount: number;
  candidates: OpportunityCandidate[];
};

export type GroupedOpportunityCandidate = {
  groupId: string;
  type: WebsiteOpportunityType;
  candidateIds: string[];
  detectionRuleIds: string[];
  supportingFindingIds: string[];
  categories: AnalyzerCategory[];
  candidateCount: number;
  failCount: number;
  warningCount: number;
  highConfidenceCount: number;
  mediumConfidenceCount: number;
};

export type OpportunityGroupingResult = {
  opportunityEngineVersion: string;
  candidateCount: number;
  groupCount: number;
  duplicateCandidateCount: number;
  groups: GroupedOpportunityCandidate[];
};

export type OpportunityAssessment = {
  groupId: string;
  type: WebsiteOpportunityType;
  priority: OpportunityPriority;
  confidence: RecommendationConfidence;
  categoryScore: number | null;
  websiteScore: number | null;
  criticalFailureCount: number;
  evidenceStrength: {
    candidateCount: number;
    failCount: number;
    warningCount: number;
    highConfidenceCount: number;
    mediumConfidenceCount: number;
  };
  priorityReasons: string[];
  confidenceReasons: string[];
};

export type OpportunityAssessmentResult = {
  opportunityEngineVersion: string;
  scoringModelVersion: string;
  groupCount: number;
  assessments: OpportunityAssessment[];
};

export type WebsiteOpportunity = {
  opportunityId: string;
  type: WebsiteOpportunityType;
  title: string;
  supportingFindingIds: string[];
  categories: AnalyzerCategory[];
  priority: OpportunityPriority;
  confidence: RecommendationConfidence;
  recommendedService: WebsiteServiceId;
  recommendation: string;
  explanation: string;
  opportunityEngineVersion: string;
};
