import { readFile } from "node:fs/promises";

const TARGET = process.env.TEQQI_APP_URL ?? "http://localhost:3000";
const assert = (condition, message) => { if (!condition) throw new Error(message); };

console.log("\nTEQQI OS Phase 11 — Manual Refresh Controls smoke test");
console.log(`Target app: ${TARGET}\n`);

const dashboardResponse = await fetch(`${TARGET}/api/dashboard`);
const dashboardBody = await dashboardResponse.json();
assert(dashboardResponse.ok && dashboardBody.ok === true, `Dashboard API failed: ${JSON.stringify(dashboardBody)}`);

const market = dashboardBody.dashboard.market;
assert(market?.id && market?.industry && market?.location, "A selected market is required.");

const searchDetailResponse = await fetch(`${TARGET}/api/businesses/search/${encodeURIComponent(market.id)}`);
const searchDetailBody = await searchDetailResponse.json();
assert(searchDetailResponse.ok && searchDetailBody.ok === true, `Search detail failed: ${JSON.stringify(searchDetailBody)}`);

const freshSearchResponse = await fetch(`${TARGET}/api/businesses/search`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    industry: searchDetailBody.search.industry,
    location: searchDetailBody.search.location,
    maxResults: searchDetailBody.search.requestedMaxResults,
    reuseRecent: true,
    forceRefresh: true,
  }),
});
const freshSearchBody = await freshSearchResponse.json();
assert(freshSearchResponse.ok && freshSearchBody.ok === true, `Forced business refresh failed: ${JSON.stringify(freshSearchBody)}`);
assert(freshSearchBody.searchId !== market.id, "Manual market refresh must create a new search execution instead of reusing the current cached search.");
assert(freshSearchBody.cache?.hit === false && freshSearchBody.cache?.forceRefresh === true, "Manual market refresh must explicitly bypass the search cache.");
console.log("✓ Refresh market bypasses cached search reuse and creates a new discovery execution");

const candidate = dashboardBody.dashboard.rankedBusinesses.find((row) => row.websiteUrl);
assert(candidate?.websiteUrl, "A business with a website is required.");

const firstAuditResponse = await fetch(`${TARGET}/api/websites/opportunities`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ url: candidate.websiteUrl }),
});
const firstAuditBody = await firstAuditResponse.json();
assert(firstAuditResponse.ok && firstAuditBody.ok === true, `Baseline audit request failed: ${JSON.stringify(firstAuditBody)}`);

const forcedAuditResponse = await fetch(`${TARGET}/api/websites/opportunities`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ url: candidate.websiteUrl, forceRefresh: true }),
});
const forcedAuditBody = await forcedAuditResponse.json();
assert(forcedAuditResponse.ok && forcedAuditBody.ok === true, `Forced audit refresh failed: ${JSON.stringify(forcedAuditBody)}`);
assert(forcedAuditBody.opportunityRunId !== firstAuditBody.opportunityRunId, "Manual website refresh must create a new opportunity run.");
assert(forcedAuditBody.scoringRunId !== firstAuditBody.scoringRunId, "Manual website refresh must create a new scoring run.");
assert(forcedAuditBody.cache?.hit === false && forcedAuditBody.cache?.forceRefresh === true, "Manual website refresh must explicitly bypass the audit cache.");
console.log("✓ Refresh analysis bypasses audit caching and creates a new immutable scoring/opportunity chain");

const marketRefreshSource = await readFile(new URL("../app/market-refresh-button.tsx", import.meta.url), "utf8");
const analysisRefreshSource = await readFile(new URL("../app/businesses/[externalId]/refresh-analysis-button.tsx", import.meta.url), "utf8");
const dashboardSource = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

assert(marketRefreshSource.includes("forceRefresh: true"), "Market refresh control must explicitly force a provider refresh.");
assert(marketRefreshSource.includes("aria-busy={refreshing}") && marketRefreshSource.includes("role=\"alert\""), "Market refresh control must expose accessible busy/error states.");
assert(analysisRefreshSource.includes("forceRefresh: true"), "Website refresh control must explicitly force a new audit.");
assert(dashboardSource.includes("<MarketRefreshButton searchId={dashboard.market.id} />"), "Dashboard must expose the market refresh control for the selected market.");
console.log("✓ Dashboard and business details expose explicit, accessible manual refresh controls");

console.log("\n✅ Phase 11 Manual Refresh Controls smoke test passed.\n");
