import { WEBSITE_SERVICE_BY_OPPORTUNITY } from "@/lib/website-opportunities/config";
import type { OpportunityPriority, RecommendationConfidence, WebsiteServiceId } from "@/lib/website-opportunities/types";
import type { DashboardRankedBusinessRow } from "./types";

export type DashboardAnalysisFilter = "ALL" | "ANALYZED" | "NOT_ANALYZED" | "HAS_WEBSITE" | "NO_WEBSITE";
export type DashboardSort = "RANK" | "WEBSITE_SCORE_ASC" | "WEBSITE_SCORE_DESC" | "OPPORTUNITY_COUNT_DESC" | "BUSINESS_NAME_ASC" | "GOOGLE_RATING_DESC";

export type DashboardTableViewInput = {
  priority?: OpportunityPriority;
  confidence?: RecommendationConfidence;
  service?: WebsiteServiceId;
  analysis?: DashboardAnalysisFilter;
  minScore?: number;
  maxScore?: number;
  sort?: DashboardSort;
};

export type DashboardTableView = {
  rows: DashboardRankedBusinessRow[];
  totalRows: number;
  filteredRows: number;
  filters: Required<Pick<DashboardTableViewInput, "analysis" | "sort">> & Omit<DashboardTableViewInput, "analysis" | "sort">;
};

const priorities = new Set(["CRITICAL", "HIGH", "MEDIUM", "LOW"]);
const confidences = new Set(["HIGH", "MEDIUM", "LOW"]);
const services = new Set<string>(Object.values(WEBSITE_SERVICE_BY_OPPORTUNITY));
const analysisFilters = new Set(["ALL", "ANALYZED", "NOT_ANALYZED", "HAS_WEBSITE", "NO_WEBSITE"]);
const sorts = new Set(["RANK", "WEBSITE_SCORE_ASC", "WEBSITE_SCORE_DESC", "OPPORTUNITY_COUNT_DESC", "BUSINESS_NAME_ASC", "GOOGLE_RATING_DESC"]);

function validateScore(name: string, value: number | undefined) {
  if (value === undefined) return;
  if (!Number.isFinite(value) || value < 0 || value > 100) throw new Error(`${name} must be between 0 and 100.`);
}

export function parseDashboardTableView(searchParams: URLSearchParams): DashboardTableViewInput {
  const priority = searchParams.get("priority")?.trim().toUpperCase() || undefined;
  const confidence = searchParams.get("confidence")?.trim().toUpperCase() || undefined;
  const service = searchParams.get("service")?.trim().toUpperCase() || undefined;
  const analysis = searchParams.get("analysis")?.trim().toUpperCase() || undefined;
  const sort = searchParams.get("sort")?.trim().toUpperCase() || undefined;
  const minScoreRaw = searchParams.get("minScore");
  const maxScoreRaw = searchParams.get("maxScore");
  const minScore = minScoreRaw === null ? undefined : Number(minScoreRaw);
  const maxScore = maxScoreRaw === null ? undefined : Number(maxScoreRaw);

  if (priority && !priorities.has(priority)) throw new Error("Invalid priority filter.");
  if (confidence && !confidences.has(confidence)) throw new Error("Invalid confidence filter.");
  if (service && !services.has(service)) throw new Error("Invalid service filter.");
  if (analysis && !analysisFilters.has(analysis)) throw new Error("Invalid analysis filter.");
  if (sort && !sorts.has(sort)) throw new Error("Invalid dashboard sort.");
  validateScore("minScore", minScore);
  validateScore("maxScore", maxScore);
  if (minScore !== undefined && maxScore !== undefined && minScore > maxScore) throw new Error("minScore cannot exceed maxScore.");

  return {
    priority: priority as OpportunityPriority | undefined,
    confidence: confidence as RecommendationConfidence | undefined,
    service: service as WebsiteServiceId | undefined,
    analysis: analysis as DashboardAnalysisFilter | undefined,
    minScore,
    maxScore,
    sort: sort as DashboardSort | undefined,
  };
}

function scoreValue(row: DashboardRankedBusinessRow, fallback: number): number {
  return row.websiteScore ?? fallback;
}

export function buildDashboardTableView(rows: readonly DashboardRankedBusinessRow[], input: DashboardTableViewInput = {}): DashboardTableView {
  const analysis = input.analysis ?? "ALL";
  const sort = input.sort ?? "RANK";

  const filtered = rows.filter((row) => {
    if (input.priority && row.bestOpportunity?.priority !== input.priority) return false;
    if (input.confidence && row.bestOpportunity?.confidence !== input.confidence) return false;
    if (input.service && row.bestOpportunity?.recommendedService !== input.service) return false;
    if (input.minScore !== undefined && (row.websiteScore === null || row.websiteScore < input.minScore)) return false;
    if (input.maxScore !== undefined && (row.websiteScore === null || row.websiteScore > input.maxScore)) return false;
    if (analysis === "ANALYZED" && !row.intelligenceAvailable) return false;
    if (analysis === "NOT_ANALYZED" && row.intelligenceAvailable) return false;
    if (analysis === "HAS_WEBSITE" && !row.websiteUrl) return false;
    if (analysis === "NO_WEBSITE" && row.websiteUrl) return false;
    return true;
  });

  const ordered = [...filtered].sort((a, b) => {
    switch (sort) {
      case "WEBSITE_SCORE_ASC": return scoreValue(a, Number.POSITIVE_INFINITY) - scoreValue(b, Number.POSITIVE_INFINITY) || a.rank - b.rank;
      case "WEBSITE_SCORE_DESC": return scoreValue(b, Number.NEGATIVE_INFINITY) - scoreValue(a, Number.NEGATIVE_INFINITY) || a.rank - b.rank;
      case "OPPORTUNITY_COUNT_DESC": return b.opportunityCount - a.opportunityCount || a.rank - b.rank;
      case "BUSINESS_NAME_ASC": return a.businessName.localeCompare(b.businessName) || a.rank - b.rank;
      case "GOOGLE_RATING_DESC": return (b.rating ?? Number.NEGATIVE_INFINITY) - (a.rating ?? Number.NEGATIVE_INFINITY) || a.rank - b.rank;
      case "RANK": default: return a.rank - b.rank;
    }
  });

  return {
    rows: ordered,
    totalRows: rows.length,
    filteredRows: ordered.length,
    filters: { ...input, analysis, sort },
  };
}
