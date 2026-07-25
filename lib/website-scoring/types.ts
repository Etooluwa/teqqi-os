export type ScoringCategory =
  | "TECHNICAL_HEALTH"
  | "SEO"
  | "PERFORMANCE"
  | "ACCESSIBILITY"
  | "CONVERSION_UX"
  | "CONTENT_QUALITY";

export type ScoringRuleStatus = "PASS" | "WARNING" | "FAIL" | "UNKNOWN" | "NOT_APPLICABLE";
export type ScoringConfidence = "HIGH" | "MEDIUM" | "LOW";

export type ScoringRuleConfig = {
  ruleId: string;
  category: ScoringCategory;
  maxPoints: number;
};

export type ScorableFinding = {
  ruleId: string;
  category: ScoringCategory;
  status: ScoringRuleStatus;
  confidence: ScoringConfidence;
  applicable: boolean;
};

export type RuleScoreExclusionReason =
  | "NOT_APPLICABLE"
  | "UNKNOWN"
  | "LOW_CONFIDENCE";

export type RuleScoreResult = {
  ruleId: string;
  category: ScoringCategory;
  status: ScoringRuleStatus;
  confidence: ScoringConfidence;
  maxPoints: number;
  multiplier: number | null;
  earnedPoints: number;
  included: boolean;
  exclusionReason: RuleScoreExclusionReason | null;
};

export type CategoryScoreResult = {
  category: ScoringCategory;
  score: number | null;
  available: boolean;
  earnedPoints: number;
  availablePoints: number;
  configuredRuleCount: number;
  providedFindingCount: number;
  includedRuleCount: number;
  excludedRuleCount: number;
  ruleScores: RuleScoreResult[];
};

export type WeightedCategoryContribution = {
  category: ScoringCategory;
  score: number | null;
  available: boolean;
  weight: number;
  weightedContribution: number | null;
};

export type WebsiteScoreResult = {
  scoringModelVersion: string;
  score: number | null;
  available: boolean;
  measuredWeight: number;
  missingWeight: number;
  measuredWeightedTotal: number;
  categories: WeightedCategoryContribution[];
  unavailableCategories: ScoringCategory[];
};

export type CriticalCapThreshold = {
  minimumFailures: number;
  maximumWebsiteScore: number;
};

export type CriticalFailureTrigger = {
  ruleId: string;
  category: ScoringCategory;
  status: "FAIL";
  confidence: Extract<ScoringConfidence, "HIGH" | "MEDIUM">;
};

export type CriticalCapResult = {
  scoringModelVersion: string;
  uncappedWebsiteScore: number | null;
  finalWebsiteScore: number | null;
  scoreAvailable: boolean;
  criticalFailureCount: number;
  criticalFailures: CriticalFailureTrigger[];
  applicableCriticalCap: number | null;
  capApplied: boolean;
};