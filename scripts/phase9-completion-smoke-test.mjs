const TARGET = process.env.TEQQI_APP_URL ?? "http://localhost:3000";
const assert = (condition, message) => { if (!condition) throw new Error(message); };

console.log("\nTEQQI OS Phase 9 — Opportunity Dashboard completion review");
console.log(`Target app: ${TARGET}\n`);

const response = await fetch(`${TARGET}/api/dashboard`);
const body = await response.json();
assert(response.ok && body.ok === true, `Dashboard API failed: ${JSON.stringify(body)}`);
const dashboard = body.dashboard;

assert(dashboard.dashboardVersion === "1.0.0", "Dashboard contract must remain versioned.");
assert(dashboard.market?.id && Array.isArray(dashboard.historyNavigation), "Dashboard must expose an active market and search history.");
assert(dashboard.historyNavigation.filter((entry) => entry.selected).length === 1, "Exactly one historical market must be selected.");
console.log("✓ Business Discovery history flows into one versioned active-market dashboard contract");

assert(dashboard.summary?.businessesFound === dashboard.businesses.length, "Market summary business count must reconcile with discovery rows.");
assert(dashboard.rankedBusinesses.length === dashboard.businesses.length, "Every discovered business must participate in deterministic ranking.");
assert(dashboard.tableView.totalRows === dashboard.rankedBusinesses.length, "Table total must reconcile with ranked businesses.");
assert(dashboard.rankedBusinesses.every((row, index) => row.rank === index + 1), "Ranked businesses must expose contiguous deterministic ranks.");
console.log("✓ Market summary, ranked businesses, and table totals reconcile end to end");

const analyzed = dashboard.businesses.filter((row) => row.intelligenceAvailable);
assert(analyzed.every((row) => row.scoringRunId && row.opportunityRunId), "Analyzed businesses must retain Phase 7 and Phase 8 run links.");
assert(analyzed.every((row) => row.websiteScore === null || (row.websiteScore >= 0 && row.websiteScore <= 100)), "Website Scores must remain bounded or explicitly unavailable.");
assert(dashboard.businesses.every((row) => row.leadScore?.available === false && row.leadScore?.score === null), "Phase 9 must not fabricate a commercial Lead Score.");
console.log("✓ Phase 7 Website Scores and Phase 8 opportunities remain traceable without fabricating Lead Scoring");

const filteredResponse = await fetch(`${TARGET}/api/dashboard?analysis=ANALYZED&sort=WEBSITE_SCORE_ASC`);
const filteredBody = await filteredResponse.json();
assert(filteredResponse.ok && filteredBody.ok === true, "Filtered dashboard request must succeed.");
assert(filteredBody.dashboard.tableView.rows.every((row) => row.intelligenceAvailable), "ANALYZED filter must contain only analyzed businesses.");
assert(filteredBody.dashboard.tableView.filters.sort === "WEBSITE_SCORE_ASC", "Sort selection must remain explicit.");
console.log("✓ Filtering and sorting operate on the same evidence-backed ranked business set");

const selectedHistory = dashboard.historyNavigation.find((entry) => !entry.selected) ?? dashboard.historyNavigation[0];
const historicalResponse = await fetch(`${TARGET}/api/dashboard?searchId=${encodeURIComponent(selectedHistory.id)}`);
const historicalBody = await historicalResponse.json();
assert(historicalResponse.ok && historicalBody.ok === true, "Historical dashboard request must succeed.");
assert(historicalBody.dashboard.market.id === selectedHistory.id, "Historical navigation must load the requested market.");
assert(historicalBody.dashboard.historyNavigation.filter((entry) => entry.selected).length === 1, "Historical dashboard must retain one selected market.");
console.log("✓ Historical-market navigation rebuilds the correct market intelligence snapshot");

assert(dashboard.dataNotes?.googlePlaceContentPersisted === false, "Google Place content must not be persisted by the dashboard.");
assert(dashboard.dataNotes?.googlePlaceDetailsRetrievedLive === true, "Google Place details must remain live-retrieved.");
assert(dashboard.dataNotes?.leadScoreStatus === "UNAVAILABLE_UNTIL_BUSINESS_LEVEL_MODEL_EXISTS", "Lead Score boundary must remain explicit.");
console.log("✓ Google Places storage boundaries and the deferred business-level Lead Score boundary remain explicit");

const pageResponse = await fetch(TARGET);
const html = await pageResponse.text();
assert(pageResponse.ok, `Dashboard page failed with ${pageResponse.status}.`);
assert(html.includes("TEQQI OS") && html.includes("Opportunity intelligence dashboard"), "Phase 9 dashboard shell must render.");
assert(!html.includes("Phase 5 · Business Discovery"), "Legacy Phase 5 presentation must not return as the main experience.");
console.log("✓ Final UI exposes the Phase 9 Opportunity Dashboard rather than the legacy discovery screen");

console.log("\nPhase 9 Opportunity Dashboard completion review passed.\n");
