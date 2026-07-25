import {
  OPPORTUNITY_ENGINE_VERSION,
  WEBSITE_SERVICE_BY_OPPORTUNITY,
} from "./config";
import { assessOpportunityGroups } from "./assessment";
import { detectOpportunityCandidates } from "./detection";
import { groupOpportunityCandidates } from "./grouping";
import type {
  OpportunityAssessment,
  GroupedOpportunityCandidate,
  WebsiteOpportunity,
  WebsiteOpportunityEngineInput,
  WebsiteOpportunityEngineResult,
  WebsiteOpportunityType,
} from "./types";

const TITLES: Readonly<Record<WebsiteOpportunityType, string>> = {
  WEBSITE_REDESIGN: "Website Redesign Opportunity",
  TECHNICAL_REMEDIATION: "Technical Website Remediation Opportunity",
  PERFORMANCE_OPTIMIZATION: "Performance Optimization Opportunity",
  MOBILE_EXPERIENCE: "Mobile Experience Improvement Opportunity",
  ACCESSIBILITY_REMEDIATION: "Accessibility Remediation Opportunity",
  CONVERSION_UX_IMPROVEMENT: "Conversion & UX Improvement Opportunity",
  CONTENT_IMPROVEMENT: "Content Improvement Opportunity",
  SEO_IMPROVEMENT: "SEO Improvement Opportunity",
  SECURITY_CONFIGURATION: "Website Security & Configuration Opportunity",
};

const RECOMMENDATIONS: Readonly<Record<WebsiteOpportunityType, string>> = {
  WEBSITE_REDESIGN: "Redesign or refresh the website where the documented website evidence supports a broader visual, structural, or experience improvement.",
  TECHNICAL_REMEDIATION: "Resolve the documented technical website issues to improve reliability, crawlability, compatibility, and maintainability.",
  PERFORMANCE_OPTIMIZATION: "Optimize the website performance issues identified by the analyzer, prioritizing the documented loading and runtime bottlenecks.",
  MOBILE_EXPERIENCE: "Improve the website's mobile experience based on the documented responsive-layout, navigation, content-visibility, or touch-target findings.",
  ACCESSIBILITY_REMEDIATION: "Remediate the documented accessibility issues so the website is more usable with assistive technologies and accessible interaction patterns.",
  CONVERSION_UX_IMPROVEMENT: "Improve the website's conversion and user experience using the documented CTA, form, navigation, trust, and usability findings.",
  CONTENT_IMPROVEMENT: "Improve the website content based on the documented clarity, completeness, structure, or quality findings.",
  SEO_IMPROVEMENT: "Address the documented SEO issues to improve search-engine discoverability, metadata quality, indexability, and on-page optimisation.",
  SECURITY_CONFIGURATION: "Resolve the documented HTTPS, TLS, mixed-content, or related website configuration issues.",
};

function buildExplanation(
  group: GroupedOpportunityCandidate,
  assessment: OpportunityAssessment,
): string {
  const categoryContext = assessment.categoryScore === null
    ? "No relevant category score was available, so scoring context did not strengthen the opportunity."
    : `The relevant category score was ${assessment.categoryScore}.`;

  return [
    `${group.supportingFindingIds.length} website finding(s) support this ${group.type} opportunity: ${group.supportingFindingIds.join(", ")}.`,
    `Evidence includes ${group.failCount} FAIL and ${group.warningCount} WARNING finding(s), with ${group.highConfidenceCount} HIGH-confidence and ${group.mediumConfidenceCount} MEDIUM-confidence finding(s).`,
    categoryContext,
    `Priority is ${assessment.priority}: ${assessment.priorityReasons.join(" ")}`,
    `Recommendation confidence is ${assessment.confidence}: ${assessment.confidenceReasons.join(" ")}`,
  ].join(" ");
}

function buildOpportunity(
  group: GroupedOpportunityCandidate,
  assessment: OpportunityAssessment,
  scoringModelVersion: string,
): WebsiteOpportunity {
  return {
    opportunityId: `OPPORTUNITY:${group.type}`,
    type: group.type,
    title: TITLES[group.type],
    candidateIds: [...group.candidateIds],
    detectionRuleIds: [...group.detectionRuleIds],
    supportingFindingIds: [...group.supportingFindingIds],
    categories: [...group.categories],
    priority: assessment.priority,
    confidence: assessment.confidence,
    categoryScore: assessment.categoryScore,
    websiteScore: assessment.websiteScore,
    criticalFailureCount: assessment.criticalFailureCount,
    recommendedService: WEBSITE_SERVICE_BY_OPPORTUNITY[group.type],
    recommendation: RECOMMENDATIONS[group.type],
    explanation: buildExplanation(group, assessment),
    priorityReasons: [...assessment.priorityReasons],
    confidenceReasons: [...assessment.confidenceReasons],
    opportunityEngineVersion: OPPORTUNITY_ENGINE_VERSION,
    scoringModelVersion,
  };
}

export function generateWebsiteOpportunities(
  input: WebsiteOpportunityEngineInput,
): WebsiteOpportunityEngineResult {
  const detection = detectOpportunityCandidates(input.findings);
  const grouping = groupOpportunityCandidates(detection.candidates);
  const assessment = assessOpportunityGroups(grouping.groups, input.scoring);

  const assessmentByGroupId = new Map(
    assessment.assessments.map((item) => [item.groupId, item] as const),
  );

  const opportunities = grouping.groups.map((group) => {
    const groupAssessment = assessmentByGroupId.get(group.groupId);
    if (!groupAssessment) {
      throw new Error(`Missing assessment for ${group.groupId}.`);
    }
    return buildOpportunity(group, groupAssessment, assessment.scoringModelVersion);
  });

  return {
    opportunityEngineVersion: OPPORTUNITY_ENGINE_VERSION,
    scoringModelVersion: assessment.scoringModelVersion,
    evaluatedFindingCount: detection.evaluatedFindingCount,
    eligibleFindingCount: detection.eligibleFindingCount,
    excludedFindingCount: detection.excludedFindingCount,
    candidateCount: detection.candidates.length,
    opportunityCount: opportunities.length,
    opportunities,
    trace: { detection, grouping, assessment },
  };
}
