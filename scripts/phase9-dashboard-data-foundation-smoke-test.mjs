const target = process.env.TEQQI_APP_URL ?? "http://localhost:3000";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

console.log("\nTEQQI OS Phase 9 — Dashboard Data Foundation smoke test");
console.log(`Target app: ${target}\n`);

const response = await fetch(`${target}/api/dashboard`);
const body = await response.json();
assert(response.ok && body.ok === true, `Dashboard API failed: ${JSON.stringify(body.error ?? body)}`);

const dashboard = body.dashboard;
assert(dashboard.dashboardVersion === "1.0.0", "Expected versioned dashboard contract.");
assert(dashboard.market?.id, "Expected a selected market/search.");
assert(Array.isArray(dashboard.searchHistory) && dashboard.searchHistory.length > 0, "Expected search history.");
console.log("✓ Latest discovery search and search history are exposed through one dashboard contract");

assert(Array.isArray(dashboard.businesses), "Expected business rows array.");
assert(dashboard.summary.businessesFound === dashboard.businesses.length, "Businesses-found count must reconcile.");
assert(dashboard.summary.businessesWithLiveDetails === dashboard.businesses.filter((row) => row.detailsAvailable).length, "Live-details count must reconcile.");
assert(dashboard.summary.businessesWithWebsites === dashboard.businesses.filter((row) => Boolean(row.websiteUrl)).length, "Website count must reconcile.");
assert(dashboard.summary.businessesAnalyzed === dashboard.businesses.filter((row) => row.intelligenceAvailable).length, "Analyzed count must reconcile.");
console.log("✓ Market summary counts reconcile with live business rows");

for (const row of dashboard.businesses) {
  assert(row.leadScore?.available === false, "Lead Score must remain unavailable until a business-level model exists.");
  assert(row.leadScore?.score === null && row.leadScore?.tier === null, "Unavailable Lead Score must not fabricate a value or tier.");
  if (row.intelligenceAvailable) {
    assert(typeof row.opportunityRunId === "string" && row.opportunityRunId.length > 0, "Analyzed row must preserve opportunity-run linkage.");
    assert(typeof row.scoringRunId === "string" && row.scoringRunId.length > 0, "Analyzed row must preserve scoring-run linkage.");
    assert(row.opportunityCount >= 0, "Opportunity count must be non-negative.");
  }
}
console.log("✓ Website intelligence is linked without fabricating commercial Lead Scores");

const totalOpportunities = dashboard.businesses.reduce((sum, row) => sum + row.opportunityCount, 0);
assert(dashboard.summary.totalOpportunities === totalOpportunities, "Total opportunity count must reconcile.");
assert(Array.isArray(dashboard.summary.opportunityCountsByService), "Expected service-count summary.");
assert(dashboard.summary.leadScoringAvailable === false, "Dashboard must explicitly report Lead Scoring as unavailable.");
console.log("✓ Opportunity totals, service summaries, and Lead Score availability are explicit");

assert(dashboard.dataNotes?.googlePlaceContentPersisted === false, "Dashboard must preserve Google Places storage boundary.");
assert(dashboard.dataNotes?.googlePlaceDetailsRetrievedLive === true, "Dashboard must state that Google details are refreshed live.");
console.log("✓ Google Places content remains live-only while historical search metadata stays reusable");

console.log("\nPhase 9 Dashboard Data Foundation smoke test passed.\n");
