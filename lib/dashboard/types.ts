import type { OpportunityPriority, RecommendationConfidence, WebsiteServiceId } from "@/lib/website-opportunities/types";

export type DashboardLeadScore = {
  available: false;
  score: null;
  tier: null;
  reason: "BUSINESS_LEVEL_LEAD_MODEL_NOT_IMPLEMENTED";
};

export type DashboardBestOpportunity = {
  opportunityId: string;
  title: string;
  priority: OpportunityPriority;
  confidence: RecommendationConfidence;
  recommendedService: WebsiteServiceId;
} | null;

export type DashboardBusinessRow = {
  externalId: string;
  resultPosition: number;
  businessName: string;
  websiteUrl: string | null;
  phone: string | null;
  formattedAddress: string | null;
  rating: number | null;
  detailsAvailable: boolean;
  intelligenceAvailable: boolean;
  opportunityRunId: string | null;
  scoringRunId: string | null;
  websiteScore: number | null;
  bestOpportunity: DashboardBestOpportunity;
  opportunityCount: number;
  leadScore: DashboardLeadScore;
};

export type DashboardRankedBusinessRow = DashboardBusinessRow & {
  rank: number;
  rankingReason: string;
};

export type DashboardServiceCount = { service: WebsiteServiceId; count: number };
export type DashboardPriorityCount = { priority: OpportunityPriority; count: number };
export type DashboardScoreBand = {
  band: "CRITICAL" | "WEAK" | "FAIR" | "STRONG";
  label: "0–39" | "40–59" | "60–79" | "80–100";
  count: number;
};

export type DashboardMarketSummary = {
  businessesFound: number;
  businessesWithLiveDetails: number;
  businessesWithWebsites: number;
  businessesAnalyzed: number;
  businessesWithOpportunities: number;
  totalOpportunities: number;
  averageWebsiteScore: number | null;
  lowestWebsiteScore: number | null;
  highestWebsiteScore: number | null;
  analysisCoveragePercent: number;
  websiteCoveragePercent: number;
  opportunityCoveragePercent: number;
  opportunityCountsByService: DashboardServiceCount[];
  bestOpportunityCountsByPriority: DashboardPriorityCount[];
  websiteScoreDistribution: DashboardScoreBand[];
  topRecommendedService: DashboardServiceCount | null;
  leadScoringAvailable: false;
};

export type DashboardSearchSummary = {
  id: string;
  query: string | null;
  industry: string;
  location: string;
  status: string;
  resultCount: number;
  createdAt: string;
};

export type DashboardHistoryEntry = DashboardSearchSummary & {
  selected: boolean;
  dashboardPath: string;
};

export type OpportunityDashboardSnapshot = {
  dashboardVersion: "1.0.0";
  market: DashboardSearchSummary;
  summary: DashboardMarketSummary;
  businesses: DashboardBusinessRow[];
  rankedBusinesses: DashboardRankedBusinessRow[];
  searchHistory: DashboardSearchSummary[];
  historyNavigation: DashboardHistoryEntry[];
  dataNotes: {
    googlePlaceContentPersisted: false;
    googlePlaceDetailsRetrievedLive: true;
    leadScoreStatus: "UNAVAILABLE_UNTIL_BUSINESS_LEVEL_MODEL_EXISTS";
  };
};
