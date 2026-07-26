import type { ProviderBusinessResult } from "@/lib/business-discovery/types";
import type {
  AnalyzerCategory,
  AnalyzerFinding,
  ConfidenceLevel,
  RuleStatus,
} from "@/lib/website-analyzer/types";
import type { WebsiteOpportunityEngineResult } from "@/lib/website-opportunities/types";
import type {
  CriticalFailureTrigger,
  RuleScoreExclusionReason,
  RuleScoreResult,
  ScoringCategory,
  UnifiedWebsiteScoringResult,
} from "@/lib/website-scoring/types";

export type BusinessDetailLeadScore = {
  available: false;
  score: null;
  tier: null;
  reason: "BUSINESS_LEVEL_LEAD_MODEL_NOT_IMPLEMENTED";
};

export type BusinessDetailDiscoveryContext = {
  searchId: string;
  industry: string;
  location: string;
  resultPosition: number;
  discoveredAt: string;
} | null;

export type BusinessDetailScoringRun = {
  scoringRunId: string;
  websiteId: string | null;
  requestedUrl: string;
  finalUrl: string;
  analyzerVersion: string;
  scoringModelVersion: string;
  websiteScore: number | null;
  scoreAvailable: boolean;
  createdAt: string;
  analyzerFindings: AnalyzerFinding[] | null;
  scoring: UnifiedWebsiteScoringResult;
} | null;

export type BusinessDetailCategoryScore = {
  category: ScoringCategory;
  score: number | null;
  available: boolean;
  weight: number;
  weightedContribution: number | null;
  earnedPoints: number;
  availablePoints: number;
  configuredRuleCount: number;
  providedFindingCount: number;
  includedRuleCount: number;
  excludedRuleCount: number;
  ruleScores: RuleScoreResult[];
};

export type BusinessDetailScoreBreakdown = {
  available: boolean;
  unavailableReason: "NO_COMPLETED_SCORING_RUN" | "INSUFFICIENT_ELIGIBLE_EVIDENCE" | null;
  scoringModelVersion: string | null;
  websiteScore: number | null;
  uncappedWebsiteScore: number | null;
  capApplied: boolean;
  appliedCriticalCap: number | null;
  criticalFailureCount: number;
  criticalFailures: CriticalFailureTrigger[];
  measuredWeight: number;
  missingWeight: number;
  measuredWeightedTotal: number;
  unavailableCategories: ScoringCategory[];
  categories: BusinessDetailCategoryScore[];
  ruleCount: number;
  includedRuleCount: number;
  excludedRuleCount: number;
};

export type BusinessDetailFinding = {
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

export type BusinessDetailFindingGroup = {
  category: AnalyzerCategory;
  findingCount: number;
  passCount: number;
  warningCount: number;
  failCount: number;
  unknownCount: number;
  notApplicableCount: number;
  findings: BusinessDetailFinding[];
};

export type BusinessDetailAnalyzerFindings = {
  available: boolean;
  unavailableReason: "NO_COMPLETED_SCORING_RUN" | "LEGACY_SCORING_RUN_WITHOUT_ANALYZER_FINDINGS" | null;
  analyzerVersion: string | null;
  findingCount: number;
  groups: BusinessDetailFindingGroup[];
};

export type BusinessDetailOpportunityRun = {
  opportunityRunId: string;
  scoringRunId: string;
  websiteId: string | null;
  requestedUrl: string;
  finalUrl: string;
  analyzerVersion: string;
  scoringModelVersion: string;
  opportunityEngineVersion: string;
  createdAt: string;
  result: WebsiteOpportunityEngineResult;
} | null;

export type BusinessDetailSnapshot = {
  detailVersion: "1.0.0";
  externalId: string;
  business: ProviderBusinessResult;
  discovery: BusinessDetailDiscoveryContext;
  intelligence: {
    available: boolean;
    websiteUrl: string | null;
    scoringRun: BusinessDetailScoringRun;
    scoreBreakdown: BusinessDetailScoreBreakdown;
    analyzerFindings: BusinessDetailAnalyzerFindings;
    opportunityRun: BusinessDetailOpportunityRun;
  };
  leadScore: BusinessDetailLeadScore;
  dataNotes: {
    googlePlaceContentPersisted: false;
    googlePlaceDetailsRetrievedLive: true;
    intelligenceSource: "LATEST_COMPLETED_RUNS_FOR_CANONICAL_DOMAIN";
    leadScoreStatus: "UNAVAILABLE_UNTIL_BUSINESS_LEVEL_MODEL_EXISTS";
  };
};
