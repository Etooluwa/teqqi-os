const TARGET = process.env.TEQQI_APP_URL ?? "http://localhost:3000";
const assert = (condition, message) => { if (!condition) throw new Error(message); };

console.log("\nTEQQI OS Phase 9 — Dashboard UI smoke test");
console.log(`Target app: ${TARGET}\n`);

const pageResponse = await fetch(TARGET);
const html = await pageResponse.text();
assert(pageResponse.ok, `Dashboard page failed with ${pageResponse.status}.`);
assert(html.includes("TEQQI OS"), "Dashboard shell must render TEQQI OS branding.");
assert(html.includes("Opportunity intelligence dashboard"), "Dashboard shell must identify the opportunity intelligence workspace.");
assert(!html.includes("Phase 5 · Business Discovery"), "The old Phase 5 main-page presentation must be removed.");
console.log("✓ Main page renders the Phase 9 dashboard shell instead of the old Phase 5 experience");

const apiResponse = await fetch(`${TARGET}/api/dashboard`);
const apiBody = await apiResponse.json();
assert(apiResponse.ok && apiBody.ok === true, `Dashboard API failed: ${JSON.stringify(apiBody)}`);
const dashboard = apiBody.dashboard;
assert(Array.isArray(dashboard.tableView?.rows), "Dashboard UI requires ranked table rows.");
assert(Array.isArray(dashboard.historyNavigation) && dashboard.historyNavigation.length > 0, "Dashboard UI requires history navigation.");
assert(dashboard.summary && typeof dashboard.summary.businessesFound === "number", "Dashboard UI requires market summary metrics.");
console.log("✓ UI data contract includes market summary, ranked table, filters/sorting view, and search history");

assert(dashboard.tableView.rows.every((row) => row.leadScore?.available === false), "UI data must not fabricate Lead Scores.");
assert(dashboard.dataNotes?.googlePlaceDetailsRetrievedLive === true, "UI must remain backed by live Google business details.");
console.log("✓ Website-evidence and Google Places boundaries remain explicit in the UI data");

const filteredResponse = await fetch(`${TARGET}/api/dashboard?analysis=ANALYZED&sort=WEBSITE_SCORE_ASC`);
const filteredBody = await filteredResponse.json();
assert(filteredResponse.ok && filteredBody.ok === true, "Dashboard controls must be accepted by the API.");
assert(filteredBody.dashboard.tableView.filters.analysis === "ANALYZED", "Analysis filter must round-trip to the UI contract.");
assert(filteredBody.dashboard.tableView.filters.sort === "WEBSITE_SCORE_ASC", "Sort selection must round-trip to the UI contract.");
console.log("✓ Responsive dashboard controls are backed by working filter and sorting semantics");

console.log("\nPhase 9 Dashboard UI smoke test passed.\n");
