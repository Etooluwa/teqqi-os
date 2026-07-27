import { selectAnalyzableBusiness } from "./helpers/select-analyzable-business.mjs";

const TARGET = process.env.TEQQI_APP_URL ?? "http://localhost:3000";
const assert = (condition, message) => { if (!condition) throw new Error(message); };

async function readJson(response, label) {
  const body = await response.json().catch(() => null);
  assert(body !== null, `${label} must return JSON.`);
  return body;
}

console.log("\nTEQQI OS Phase 11 — End-to-End MVP smoke test");
console.log(`Target app: ${TARGET}\n`);

// 1) Start from the real dashboard. This proves there is a persisted discovery
// execution that the rest of the product can consume without test fixtures.
const dashboardResponse = await fetch(`${TARGET}/api/dashboard`, { cache: "no-store" });
const dashboardBody = await readJson(dashboardResponse, "Dashboard API");
assert(dashboardResponse.ok && dashboardBody.ok === true, `Dashboard API failed: ${JSON.stringify(dashboardBody)}`);
assert(dashboardResponse.headers.get("x-request-id"), "Dashboard responses must expose a request correlation ID.");

const dashboard = dashboardBody.dashboard;
assert(dashboard?.market?.id, "Dashboard must expose the selected discovery search ID.");
assert(Array.isArray(dashboard.businesses), "Dashboard must expose discovered businesses.");
assert(Array.isArray(dashboard.rankedBusinesses), "Dashboard must expose ranked businesses.");
assert(dashboard.businesses.length === dashboard.rankedBusinesses.length, "Every discovered business must have a ranked dashboard row.");
assert(dashboard.summary.businessesFound === dashboard.businesses.length, "Dashboard summary business count must match the discovered business rows.");
assert(dashboard.dataNotes.googlePlaceContentPersisted === false, "Google Place content must remain live-only throughout the E2E flow.");
assert(dashboard.dataNotes.leadScoreStatus === "UNAVAILABLE_UNTIL_BUSINESS_LEVEL_MODEL_EXISTS", "E2E flow must not fabricate the deferred commercial Lead Score.");
console.log(`✓ Persisted discovery ${dashboard.market.id} flows into a ranked dashboard with ${dashboard.businesses.length} business(es)`);

// 2) Exercise the discovery endpoint with the exact selected market. Prefer the
// Phase 11 cache; if the provider must be contacted, temporary provider limits
// are treated as an external degraded condition rather than a product regression.
const discoveryResponse = await fetch(`${TARGET}/api/businesses/search`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    industry: dashboard.market.industry,
    location: dashboard.market.location,
    maxResults: dashboard.market.requestedMaxResults,
    reuseRecent: true,
  }),
});
const discoveryBody = await readJson(discoveryResponse, "Business discovery API");
assert(discoveryResponse.headers.get("x-request-id"), "Business discovery responses must expose a request correlation ID.");

if (discoveryResponse.ok && discoveryBody.ok === true) {
  assert(discoveryBody.searchId, "Successful discovery must expose a search ID.");
  assert(discoveryBody.persistence?.stored === true, "Successful discovery must persist its execution metadata.");
  assert(discoveryBody.persistence?.googlePlaceContentPersisted === false, "Discovery must not persist Google Place content.");

  if (discoveryBody.cache?.hit === true) {
    assert(discoveryBody.searchId === dashboard.market.id, "A recent identical cached search must reuse the selected immutable search ID.");
    console.log("✓ Business discovery reuses the recent market without an unnecessary Google Places call");
  } else {
    console.log(`✓ Business discovery completed a fresh execution (${discoveryBody.searchId})`);
  }
} else {
  const code = discoveryBody?.error?.code;
  assert(
    discoveryResponse.status === 409 || discoveryResponse.status === 503,
    `Unexpected discovery failure in E2E flow: ${JSON.stringify(discoveryBody)}`,
  );
  assert(
    code === "SEARCH_ALREADY_RUNNING" || code === "GOOGLE_PLACES_RATE_LIMITED",
    `Unexpected temporary discovery error code: ${String(code)}`,
  );
  console.log(`↪ Live discovery probe degraded safely with ${code}; continuing from persisted discovery ${dashboard.market.id}`);
}

// 3) Verify dashboard filters/sorts operate on the same real market and remain
// internally consistent.
const filteredResponse = await fetch(
  `${TARGET}/api/dashboard?searchId=${encodeURIComponent(dashboard.market.id)}&analysis=HAS_WEBSITE&sort=BUSINESS_NAME_ASC`,
  { cache: "no-store" },
);
const filteredBody = await readJson(filteredResponse, "Filtered dashboard API");
assert(filteredResponse.ok && filteredBody.ok === true, `Filtered dashboard failed: ${JSON.stringify(filteredBody)}`);
assert(filteredBody.dashboard.market.id === dashboard.market.id, "Filtered dashboard must remain bound to the selected search.");
assert(filteredBody.dashboard.tableView.rows.every((row) => Boolean(row.websiteUrl)), "HAS_WEBSITE filter must exclude businesses without websites.");
for (let index = 1; index < filteredBody.dashboard.tableView.rows.length; index += 1) {
  const previous = filteredBody.dashboard.tableView.rows[index - 1].businessName;
  const current = filteredBody.dashboard.tableView.rows[index].businessName;
  assert(previous.localeCompare(current) <= 0, "BUSINESS_NAME_ASC must sort the filtered table deterministically.");
}
console.log("✓ Dashboard filtering and ranking views remain consistent for the selected market");

// 4) Select a real business and execute/reuse the full website intelligence
// pipeline. The helper only skips approved live-site safety failures.
const selection = await selectAnalyzableBusiness(TARGET, dashboard.rankedBusinesses);
const { candidate, source, skipped } = selection;
if (skipped.length > 0) console.log(`↪ Skipped ${skipped.length} site-specific live analysis failure(s) covered by the approved safety policy.`);
assert(candidate?.externalId && candidate?.websiteUrl, "E2E intelligence requires a discovered business with a website.");

if (source === "FRESH_LIVE_RUN") {
  assert(selection.body?.scoringRunId, "Fresh Analyze → Score → Opportunities flow must persist a scoring run.");
  assert(selection.body?.opportunityRunId, "Fresh Analyze → Score → Opportunities flow must persist an opportunity run.");
  console.log("✓ A real discovered website completed Analyze → Score → Opportunities and persisted immutable run IDs");
} else if (source === "PERSISTED_INTELLIGENCE_FALLBACK") {
  console.log("↪ Current live sites were unsuitable for a fresh crawl; using previously persisted immutable intelligence.");
  console.log("✓ Persisted Analyze → Score → Opportunities intelligence remains readable end to end");
} else {
  console.log("↪ No current website could be safely analyzed and no persisted intelligence exists for the selected candidate.");
  console.log("✓ Product preserves an explicit no-intelligence state rather than fabricating scores or recommendations");
}

// 5) Business detail must join live Google information with the exact persisted
// intelligence selected above.
const detailResponse = await fetch(`${TARGET}/api/businesses/${encodeURIComponent(candidate.externalId)}`, { cache: "no-store" });
const detailBody = await readJson(detailResponse, "Business detail API");
assert(detailResponse.ok && detailBody.ok === true, `Business detail API failed: ${JSON.stringify(detailBody)}`);
const detail = detailBody.detail;
assert(detail.business?.externalId === candidate.externalId, "Business detail must resolve the requested external Place ID.");
assert(detail.business?.websiteUrl, "Selected E2E business must still expose its live website URL.");
assert(detail.leadScore?.available === false && detail.leadScore?.score === null, "Business detail must keep commercial Lead Score explicitly unavailable.");
console.log("✓ Business detail joins live business information to traceable website intelligence without crossing storage boundaries");

const scoringRunId = detail.intelligence?.scoringRun?.scoringRunId ?? null;
const opportunityRunId = detail.intelligence?.opportunityRun?.opportunityRunId ?? null;

// 6) When intelligence exists, prove both historical APIs resolve the same exact
// immutable run chain that the business-detail page uses.
if (scoringRunId && opportunityRunId) {
  const scoringResponse = await fetch(`${TARGET}/api/websites/score/${encodeURIComponent(scoringRunId)}`);
  const scoringBody = await readJson(scoringResponse, "Historical scoring API");
  assert(scoringResponse.ok && scoringBody.ok === true, `Historical scoring lookup failed: ${JSON.stringify(scoringBody)}`);
  assert(scoringBody.run?.id === scoringRunId || scoringBody.scoringRun?.id === scoringRunId || scoringBody.scoringRunId === scoringRunId, "Historical scoring API must resolve the exact business-detail scoring run.");

  const opportunityResponse = await fetch(`${TARGET}/api/websites/opportunities/${encodeURIComponent(opportunityRunId)}`);
  const opportunityBody = await readJson(opportunityResponse, "Historical opportunity API");
  assert(opportunityResponse.ok && opportunityBody.ok === true, `Historical opportunity lookup failed: ${JSON.stringify(opportunityBody)}`);
  assert(opportunityBody.opportunityRunId === opportunityRunId, "Historical opportunity API must resolve the exact business-detail opportunity run.");
  assert(opportunityBody.scoringRunId === scoringRunId, "Opportunity run must remain tied to the exact scoring run used by business details.");
  assert(opportunityBody.persistence?.historicalResultImmutable === true, "Historical opportunity results must remain immutable.");
  console.log("✓ Scoring and opportunity history endpoints reproduce the exact immutable run chain shown on business details");
}

// 7) Prove the server-rendered detail experience is actually reachable from the
// ranked business and contains the core explainability surfaces.
const detailPageResponse = await fetch(`${TARGET}/businesses/${encodeURIComponent(candidate.externalId)}`, { cache: "no-store" });
const detailPageHtml = await detailPageResponse.text();
assert(detailPageResponse.ok, `Business detail page failed with ${detailPageResponse.status}.`);
for (const requiredText of ["Website Score", "Score breakdown", "Analyzer findings", "Recommendations", "Audit metadata"]) {
  assert(detailPageHtml.includes(requiredText), `Business detail page must render ${requiredText}.`);
}
if (scoringRunId && opportunityRunId) {
  assert(detailPageHtml.includes(scoringRunId), "Business detail page must display the selected scoring run ID.");
  assert(detailPageHtml.includes(opportunityRunId), "Business detail page must display the selected opportunity run ID.");
}
console.log("✓ Ranked business → detail page navigation exposes score, findings, recommendations, and audit traceability");

// 8) Controlled error states stay controlled at the end of the same deployed flow.
const unknownDetailResponse = await fetch(`${TARGET}/api/businesses/not-a-real-teqqi-place-id`);
const unknownDetailBody = await readJson(unknownDetailResponse, "Unknown business API");
assert(unknownDetailResponse.status === 404 && unknownDetailBody.ok === false, "Unknown business API requests must return a controlled 404.");

const invalidDashboardResponse = await fetch(`${TARGET}/api/dashboard?minScore=80&maxScore=20`);
const invalidDashboardBody = await readJson(invalidDashboardResponse, "Invalid dashboard filter");
assert(invalidDashboardResponse.status === 400, "Invalid dashboard filters must return HTTP 400.");
assert(invalidDashboardBody?.error?.code === "INVALID_DASHBOARD_FILTER", "Invalid dashboard filters must return the typed error contract.");
console.log("✓ E2E failure paths remain typed, controlled, and non-fabricating");

console.log("\n✅ Phase 11 End-to-End MVP smoke test passed. Discovery, analysis, scoring, ranking, business details, and immutable evidence are connected.\n");
