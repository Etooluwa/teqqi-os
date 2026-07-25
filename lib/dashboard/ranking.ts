import type { DashboardBusinessRow } from "./types";

const PRIORITY_RANK = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 } as const;
const CONFIDENCE_RANK = { HIGH: 3, MEDIUM: 2, LOW: 1 } as const;

export type RankedDashboardBusinessRow = DashboardBusinessRow & {
  rank: number;
  rankingReason: string;
};

function compareRows(a: DashboardBusinessRow, b: DashboardBusinessRow): number {
  const aPriority = a.bestOpportunity ? PRIORITY_RANK[a.bestOpportunity.priority] : 0;
  const bPriority = b.bestOpportunity ? PRIORITY_RANK[b.bestOpportunity.priority] : 0;
  if (aPriority !== bPriority) return bPriority - aPriority;

  const aConfidence = a.bestOpportunity ? CONFIDENCE_RANK[a.bestOpportunity.confidence] : 0;
  const bConfidence = b.bestOpportunity ? CONFIDENCE_RANK[b.bestOpportunity.confidence] : 0;
  if (aConfidence !== bConfidence) return bConfidence - aConfidence;

  if (a.opportunityCount !== b.opportunityCount) return b.opportunityCount - a.opportunityCount;

  // A lower Website Score indicates more demonstrated website improvement need.
  const aScore = a.websiteScore ?? Number.POSITIVE_INFINITY;
  const bScore = b.websiteScore ?? Number.POSITIVE_INFINITY;
  if (aScore !== bScore) return aScore - bScore;

  if (a.intelligenceAvailable !== b.intelligenceAvailable) return a.intelligenceAvailable ? -1 : 1;
  if (a.detailsAvailable !== b.detailsAvailable) return a.detailsAvailable ? -1 : 1;
  if (a.resultPosition !== b.resultPosition) return a.resultPosition - b.resultPosition;
  return a.businessName.localeCompare(b.businessName);
}

function rankingReason(row: DashboardBusinessRow): string {
  if (!row.intelligenceAvailable) {
    return row.websiteUrl
      ? "Website discovered; Phase 7/8 intelligence is not available yet."
      : "No website is available for website-level opportunity analysis.";
  }
  if (!row.bestOpportunity) {
    return `Website Score ${row.websiteScore ?? "unavailable"}; no eligible website opportunity was detected.`;
  }
  return `${row.bestOpportunity.priority} priority / ${row.bestOpportunity.confidence} confidence; ${row.opportunityCount} website opportunit${row.opportunityCount === 1 ? "y" : "ies"}; Website Score ${row.websiteScore ?? "unavailable"}.`;
}

export function rankDashboardBusinesses(rows: readonly DashboardBusinessRow[]): RankedDashboardBusinessRow[] {
  const seen = new Set<string>();
  for (const row of rows) {
    if (seen.has(row.externalId)) throw new Error(`Duplicate dashboard business ${row.externalId}.`);
    seen.add(row.externalId);
  }

  return [...rows]
    .sort(compareRows)
    .map((row, index) => ({ ...row, rank: index + 1, rankingReason: rankingReason(row) }));
}
