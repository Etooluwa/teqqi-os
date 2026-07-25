const target = process.env.TEQQI_APP_URL ?? "http://localhost:3000";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function approxEqual(a, b, tolerance = 0.01) {
  return Math.abs(a - b) <= tolerance;
}

console.log("\nTEQQI OS Phase 9 — Market Summary smoke test");
console.log(`Target app: ${target}\n`);

const response = await fetch(`${target}/api/dashboard`, { cache: "no-store" });
const body = await response.json();
assert(response.ok && body.ok === true, `Dashboard API failed: ${JSON.stringify(body.error ?? body)}`);

const { businesses, summary } = body.dashboard;
assert(Array.isArray(businesses), "Expected dashboard businesses array.");
assert(summary.businessesFound === businesses.length, "Businesses-found count must reconcile with dashboard rows.");
assert(summary.businessesWithLiveDetails === businesses.filter((row) => row.detailsAvailable).length, "Live-detail count must reconcile.");
assert(summary.businessesWithWebsites === businesses.filter((row) => Boolean(row.websiteUrl)).length, "Website count must reconcile.");
assert(summary.businessesAnalyzed === businesses.filter((row) => row.intelligenceAvailable).length, "Analyzed count must reconcile.");
assert(summary.businessesWithOpportunities === businesses.filter((row) => row.intelligenceAvailable && row.opportunityCount > 0).length, "Opportunity-business count must reconcile.");
assert(summary.totalOpportunities === businesses.reduce((sum, row) => sum + row.opportunityCount, 0), "Opportunity total must reconcile.");
console.log("✓ Core market summary counts reconcile with business rows");

const websiteCoverage = businesses.length === 0 ? 0 : Math.round((summary.businessesWithWebsites / businesses.length) * 10000) / 100;
const analysisCoverage = summary.businessesWithWebsites === 0 ? 0 : Math.round((summary.businessesAnalyzed / summary.businessesWithWebsites) * 10000) / 100;
const opportunityCoverage = summary.businessesAnalyzed === 0 ? 0 : Math.round((summary.businessesWithOpportunities / summary.businessesAnalyzed) * 10000) / 100;
assert(approxEqual(summary.websiteCoveragePercent, websiteCoverage), "Website coverage percent must reconcile.");
assert(approxEqual(summary.analysisCoveragePercent, analysisCoverage), "Analysis coverage percent must reconcile.");
assert(approxEqual(summary.opportunityCoveragePercent, opportunityCoverage), "Opportunity coverage percent must reconcile.");
console.log("✓ Website, analysis, and opportunity coverage metrics reconcile");

const scores = businesses.map((row) => row.websiteScore).filter((score) => typeof score === "number");
if (scores.length === 0) {
  assert(summary.averageWebsiteScore === null, "Average score must be null without scoring evidence.");
  assert(summary.lowestWebsiteScore === null && summary.highestWebsiteScore === null, "Score range must remain null without evidence.");
} else {
  const average = Math.round((scores.reduce((sum, score) => sum + score, 0) / scores.length) * 100) / 100;
  assert(approxEqual(summary.averageWebsiteScore, average), "Average Website Score must reconcile.");
  assert(summary.lowestWebsiteScore === Math.min(...scores), "Lowest Website Score must reconcile.");
  assert(summary.highestWebsiteScore === Math.max(...scores), "Highest Website Score must reconcile.");
}
assert(Array.isArray(summary.websiteScoreDistribution) && summary.websiteScoreDistribution.length === 4, "Expected four Website Score bands.");
assert(summary.websiteScoreDistribution.reduce((sum, band) => sum + band.count, 0) === scores.length, "Website Score distribution must reconcile.");
console.log("✓ Website Score average, range, and distribution remain evidence-backed");

assert(Array.isArray(summary.opportunityCountsByService), "Expected service opportunity breakdown.");
assert(summary.opportunityCountsByService.reduce((sum, item) => sum + item.count, 0) === summary.totalOpportunities, "Service counts must include every final opportunity exactly once.");
if (summary.opportunityCountsByService.length === 0) {
  assert(summary.topRecommendedService === null, "Top service must be null when no opportunities exist.");
} else {
  assert(summary.topRecommendedService?.service === summary.opportunityCountsByService[0].service, "Top service must match the ranked service breakdown.");
  assert(summary.topRecommendedService?.count === summary.opportunityCountsByService[0].count, "Top service count must match the ranked service breakdown.");
}
console.log("✓ Service opportunity counts and top recommended service reconcile");

assert(Array.isArray(summary.bestOpportunityCountsByPriority) && summary.bestOpportunityCountsByPriority.length === 4, "Expected all four priority tiers.");
const expectedPriorityBusinesses = businesses.filter((row) => row.bestOpportunity).length;
assert(summary.bestOpportunityCountsByPriority.reduce((sum, item) => sum + item.count, 0) === expectedPriorityBusinesses, "Priority distribution must reconcile with best opportunities.");
console.log("✓ Best-opportunity priority distribution is explicit and complete");

assert(summary.leadScoringAvailable === false, "Commercial Lead Score must remain unavailable.");
assert(body.dashboard.dataNotes?.leadScoreStatus === "UNAVAILABLE_UNTIL_BUSINESS_LEVEL_MODEL_EXISTS", "Lead Score limitation must remain explicit.");
console.log("✓ Market summary does not fabricate commercial Lead Scoring");

console.log("\nPhase 9 Market Summary smoke test passed.\n");
