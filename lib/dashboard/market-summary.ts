import type {
  DashboardBusinessRow,
  DashboardMarketSummary,
  DashboardPriorityCount,
  DashboardScoreBand,
  DashboardServiceCount,
} from "./types";

const PRIORITY_ORDER = ["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const;

function percentage(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.round((part / whole) * 10000) / 100;
}

function scoreBand(score: number): DashboardScoreBand["band"] {
  if (score >= 80) return "STRONG";
  if (score >= 60) return "FAIR";
  if (score >= 40) return "WEAK";
  return "CRITICAL";
}

export function buildDashboardMarketSummary(
  rows: readonly DashboardBusinessRow[],
): DashboardMarketSummary {
  const analyzed = rows.filter((row) => row.intelligenceAvailable);
  const scores = analyzed
    .map((row) => row.websiteScore)
    .filter((score): score is number => typeof score === "number");

  const serviceCounts = new Map<string, number>();
  const priorityCounts = new Map<string, number>();
  const scoreBands = new Map<DashboardScoreBand["band"], number>([
    ["CRITICAL", 0],
    ["WEAK", 0],
    ["FAIR", 0],
    ["STRONG", 0],
  ]);

  let totalOpportunities = 0;
  let businessesWithOpportunities = 0;

  for (const row of analyzed) {
    totalOpportunities += row.opportunityCount;
    if (row.opportunityCount > 0) businessesWithOpportunities += 1;

    if (row.bestOpportunity) {
      const service = row.bestOpportunity.recommendedService;
      serviceCounts.set(service, (serviceCounts.get(service) ?? 0) + 1);
      const priority = row.bestOpportunity.priority;
      priorityCounts.set(priority, (priorityCounts.get(priority) ?? 0) + 1);
    }
  }

  for (const score of scores) {
    const band = scoreBand(score);
    scoreBands.set(band, (scoreBands.get(band) ?? 0) + 1);
  }

  const opportunityCountsByService: DashboardServiceCount[] = [...serviceCounts.entries()]
    .map(([service, count]) => ({ service: service as DashboardServiceCount["service"], count }))
    .sort((a, b) => b.count - a.count || a.service.localeCompare(b.service));

  const bestOpportunityCountsByPriority: DashboardPriorityCount[] = PRIORITY_ORDER.map((priority) => ({
    priority,
    count: priorityCounts.get(priority) ?? 0,
  }));

  const websiteScoreDistribution: DashboardScoreBand[] = ([
    ["CRITICAL", "0–39"],
    ["WEAK", "40–59"],
    ["FAIR", "60–79"],
    ["STRONG", "80–100"],
  ] as const).map(([band, label]) => ({ band, label, count: scoreBands.get(band) ?? 0 }));

  const businessesFound = rows.length;
  const businessesWithLiveDetails = rows.filter((row) => row.detailsAvailable).length;
  const businessesWithWebsites = rows.filter((row) => Boolean(row.websiteUrl)).length;
  const businessesAnalyzed = analyzed.length;

  return {
    businessesFound,
    businessesWithLiveDetails,
    businessesWithWebsites,
    businessesAnalyzed,
    businessesWithOpportunities,
    totalOpportunities,
    averageWebsiteScore:
      scores.length === 0
        ? null
        : Math.round((scores.reduce((sum, score) => sum + score, 0) / scores.length) * 100) / 100,
    lowestWebsiteScore: scores.length === 0 ? null : Math.min(...scores),
    highestWebsiteScore: scores.length === 0 ? null : Math.max(...scores),
    analysisCoveragePercent: percentage(businessesAnalyzed, businessesWithWebsites),
    websiteCoveragePercent: percentage(businessesWithWebsites, businessesFound),
    opportunityCoveragePercent: percentage(businessesWithOpportunities, businessesAnalyzed),
    opportunityCountsByService,
    bestOpportunityCountsByPriority,
    websiteScoreDistribution,
    topRecommendedService: opportunityCountsByService[0] ?? null,
    leadScoringAvailable: false,
  };
}
