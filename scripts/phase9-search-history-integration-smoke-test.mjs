const TARGET = process.env.TEQQI_APP_URL ?? "http://localhost:3000";
const assert = (condition, message) => { if (!condition) throw new Error(message); };

console.log("\nTEQQI OS Phase 9 — Search History Integration smoke test");
console.log(`Target app: ${TARGET}\n`);

const initialParams = new URLSearchParams({ sort: "OPPORTUNITY_COUNT_DESC", analysis: "HAS_WEBSITE" });
const initialResponse = await fetch(`${TARGET}/api/dashboard?${initialParams.toString()}`);
const initialBody = await initialResponse.json();
assert(initialResponse.ok && initialBody.ok === true, `Dashboard API failed: ${JSON.stringify(initialBody)}`);
const dashboard = initialBody.dashboard;

assert(Array.isArray(dashboard.historyNavigation) && dashboard.historyNavigation.length === dashboard.searchHistory.length, "History navigation must cover every exposed search-history entry.");
assert(dashboard.historyNavigation.filter((entry) => entry.selected).length === 1, "Exactly one historical market must be selected.");
assert(dashboard.historyNavigation.find((entry) => entry.selected)?.id === dashboard.market.id, "Selected history entry must match the active market.");
console.log("✓ Search history exposes one explicit active market and deterministic navigation entries");

for (const entry of dashboard.historyNavigation) {
  const url = new URL(entry.dashboardPath, TARGET);
  assert(url.searchParams.get("searchId") === entry.id, "History navigation must target the correct search ID.");
  assert(url.searchParams.get("sort") === "OPPORTUNITY_COUNT_DESC", "History navigation must preserve active sorting.");
  assert(url.searchParams.get("analysis") === "HAS_WEBSITE", "History navigation must preserve active filters.");
}
console.log("✓ Historical-market navigation preserves the active filter and sorting context");

const targetEntry = dashboard.historyNavigation.find((entry) => !entry.selected) ?? dashboard.historyNavigation[0];
assert(targetEntry, "At least one historical search is required for the dashboard.");
const historicalResponse = await fetch(new URL(targetEntry.dashboardPath, TARGET));
const historicalBody = await historicalResponse.json();
assert(historicalResponse.ok && historicalBody.ok === true, `Historical dashboard load failed: ${JSON.stringify(historicalBody)}`);
const historical = historicalBody.dashboard;
assert(historical.market.id === targetEntry.id, "Historical navigation must reload the requested market.");
assert(historical.historyNavigation.find((entry) => entry.selected)?.id === targetEntry.id, "Reloaded historical market must become the selected history entry.");
assert(historical.summary.businessesFound === historical.businesses.length, "Historical market summary must reconcile with its own business rows.");
assert(historical.rankedBusinesses.length === historical.businesses.length, "Historical market must rebuild ranked businesses for that search.");
assert(historical.tableView.filters.sort === "OPPORTUNITY_COUNT_DESC" && historical.tableView.filters.analysis === "HAS_WEBSITE", "Historical reload must preserve table controls.");
console.log("✓ Selecting a historical search rebuilds its market summary, ranked businesses, and table view");

assert(historical.businesses.every((row) => row.leadScore?.available === false), "Historical reload must not fabricate Lead Scores.");
assert(historical.dataNotes.googlePlaceContentPersisted === false && historical.dataNotes.googlePlaceDetailsRetrievedLive === true, "Historical dashboard must preserve Google Places storage boundaries.");
console.log("✓ Historical markets preserve website-evidence and Google Places data boundaries");

const missingResponse = await fetch(`${TARGET}/api/dashboard?searchId=00000000-0000-0000-0000-000000000000`);
const missingBody = await missingResponse.json();
assert(missingResponse.status === 404 && missingBody.error?.code === "DASHBOARD_SEARCH_NOT_FOUND", "Unknown historical search IDs must fail with a controlled 404.");
console.log("✓ Unknown historical markets fail safely without falling back to a different search");

console.log("\nPhase 9 Search History Integration smoke test passed.\n");
