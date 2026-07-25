import { OPPORTUNITY_ENGINE_VERSION, WEBSITE_OPPORTUNITY_TYPES } from "./config";
import { WebsiteOpportunityError } from "./detection";
import type {
  GroupedOpportunityCandidate,
  OpportunityCandidate,
  OpportunityGroupingResult,
  WebsiteOpportunityType,
} from "./types";

const TYPE_ORDER = new Map<WebsiteOpportunityType, number>(
  WEBSITE_OPPORTUNITY_TYPES.map((type, index) => [type, index]),
);

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

export function groupOpportunityCandidates(
  candidates: readonly OpportunityCandidate[],
): OpportunityGroupingResult {
  const seenCandidateIds = new Set<string>();
  const uniqueCandidates: OpportunityCandidate[] = [];
  let duplicateCandidateCount = 0;

  for (const candidate of candidates) {
    if (!TYPE_ORDER.has(candidate.type)) {
      throw new WebsiteOpportunityError(`Unsupported website opportunity type ${candidate.type}.`);
    }
    if (!candidate.candidateId || !candidate.detectionRuleId) {
      throw new WebsiteOpportunityError("Opportunity candidates require candidate and detection rule IDs.");
    }
    if (candidate.supportingFindingIds.length === 0) {
      throw new WebsiteOpportunityError(`${candidate.candidateId} has no supporting findings.`);
    }
    if (candidate.categories.length === 0) {
      throw new WebsiteOpportunityError(`${candidate.candidateId} has no website categories.`);
    }
    if (candidate.sourceStatus !== "FAIL" && candidate.sourceStatus !== "WARNING") {
      throw new WebsiteOpportunityError(`${candidate.candidateId} has an unsupported source status.`);
    }
    if (candidate.sourceConfidence !== "HIGH" && candidate.sourceConfidence !== "MEDIUM") {
      throw new WebsiteOpportunityError(`${candidate.candidateId} has an unsupported source confidence.`);
    }

    if (seenCandidateIds.has(candidate.candidateId)) {
      duplicateCandidateCount += 1;
      continue;
    }
    seenCandidateIds.add(candidate.candidateId);
    uniqueCandidates.push(candidate);
  }

  const byType = new Map<WebsiteOpportunityType, OpportunityCandidate[]>();
  for (const candidate of uniqueCandidates) {
    const group = byType.get(candidate.type) ?? [];
    group.push(candidate);
    byType.set(candidate.type, group);
  }

  const groups: GroupedOpportunityCandidate[] = [...byType.entries()]
    .sort(([a], [b]) => (TYPE_ORDER.get(a) ?? 999) - (TYPE_ORDER.get(b) ?? 999))
    .map(([type, members]) => {
      const supportingFindingIds = uniqueSorted(
        members.flatMap((member) => member.supportingFindingIds),
      );
      const categories = uniqueSorted(members.flatMap((member) => member.categories)) as GroupedOpportunityCandidate["categories"];
      const candidateIds = uniqueSorted(members.map((member) => member.candidateId));
      const detectionRuleIds = uniqueSorted(members.map((member) => member.detectionRuleId));

      return {
        groupId: `OPPORTUNITY_GROUP:${type}`,
        type,
        candidateIds,
        detectionRuleIds,
        supportingFindingIds,
        categories,
        candidateCount: members.length,
        failCount: members.filter((member) => member.sourceStatus === "FAIL").length,
        warningCount: members.filter((member) => member.sourceStatus === "WARNING").length,
        highConfidenceCount: members.filter((member) => member.sourceConfidence === "HIGH").length,
        mediumConfidenceCount: members.filter((member) => member.sourceConfidence === "MEDIUM").length,
      };
    });

  return {
    opportunityEngineVersion: OPPORTUNITY_ENGINE_VERSION,
    candidateCount: uniqueCandidates.length,
    groupCount: groups.length,
    duplicateCandidateCount,
    groups,
  };
}
