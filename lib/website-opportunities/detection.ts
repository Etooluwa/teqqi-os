import {
  ANALYZER_RULE_RANGES,
  CATEGORY_DEFAULT_OPPORTUNITY,
  MOBILE_EXPERIENCE_RULE_IDS,
  OPPORTUNITY_ENGINE_VERSION,
  SECURITY_CONFIGURATION_RULE_IDS,
} from "./config";
import type {
  OpportunityCandidate,
  OpportunityDetectionResult,
  OpportunityFindingInput,
  WebsiteOpportunityType,
} from "./types";

export class WebsiteOpportunityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WebsiteOpportunityError";
  }
}

function expectedRuleId(ruleId: string, category: OpportunityFindingInput["category"]): boolean {
  const range = ANALYZER_RULE_RANGES[category];
  const match = ruleId.match(/^([A-Z]+)-(\d{3})$/);
  if (!match || match[1] !== range.prefix) return false;
  const ordinal = Number(match[2]);
  return Number.isInteger(ordinal) && ordinal >= 1 && ordinal <= range.count;
}

function eligible(finding: OpportunityFindingInput): finding is OpportunityFindingInput & {
  status: "WARNING" | "FAIL";
  confidence: "HIGH" | "MEDIUM";
} {
  return (
    finding.applicable &&
    (finding.status === "WARNING" || finding.status === "FAIL") &&
    (finding.confidence === "HIGH" || finding.confidence === "MEDIUM")
  );
}

function opportunityTypeForFinding(finding: OpportunityFindingInput): WebsiteOpportunityType {
  if (finding.category === "TECHNICAL_HEALTH") {
    if (SECURITY_CONFIGURATION_RULE_IDS.has(finding.ruleId)) return "SECURITY_CONFIGURATION";
    if (MOBILE_EXPERIENCE_RULE_IDS.has(finding.ruleId)) return "MOBILE_EXPERIENCE";
    return "TECHNICAL_REMEDIATION";
  }

  const type = CATEGORY_DEFAULT_OPPORTUNITY[finding.category];
  if (!type) {
    throw new WebsiteOpportunityError(
      `No website opportunity mapping is configured for ${finding.category}.`,
    );
  }
  return type;
}

export function detectOpportunityCandidates(
  findings: readonly OpportunityFindingInput[],
): OpportunityDetectionResult {
  const seen = new Set<string>();
  const candidates: OpportunityCandidate[] = [];
  let eligibleFindingCount = 0;

  for (const finding of findings) {
    if (seen.has(finding.ruleId)) {
      throw new WebsiteOpportunityError(`Duplicate analyzer finding ${finding.ruleId}.`);
    }
    seen.add(finding.ruleId);

    if (!expectedRuleId(finding.ruleId, finding.category)) {
      throw new WebsiteOpportunityError(
        `${finding.ruleId} is not a valid configured rule ID for ${finding.category}.`,
      );
    }

    if (finding.status === "NOT_APPLICABLE" && finding.applicable) {
      throw new WebsiteOpportunityError(
        `${finding.ruleId} cannot be NOT_APPLICABLE while applicable is true.`,
      );
    }
    if (finding.status !== "NOT_APPLICABLE" && !finding.applicable) {
      throw new WebsiteOpportunityError(
        `${finding.ruleId} cannot be ${finding.status} while applicable is false.`,
      );
    }

    if (!eligible(finding)) continue;
    eligibleFindingCount += 1;

    const type = opportunityTypeForFinding(finding);
    candidates.push({
      candidateId: `CANDIDATE:${type}:${finding.ruleId}`,
      detectionRuleId: `DIRECT:${finding.ruleId}`,
      type,
      supportingFindingIds: [finding.ruleId],
      categories: [finding.category],
      sourceStatus: finding.status,
      sourceConfidence: finding.confidence,
    });
  }

  return {
    opportunityEngineVersion: OPPORTUNITY_ENGINE_VERSION,
    evaluatedFindingCount: findings.length,
    eligibleFindingCount,
    excludedFindingCount: findings.length - eligibleFindingCount,
    candidates,
  };
}
