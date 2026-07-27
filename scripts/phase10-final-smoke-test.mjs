import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { selectAnalyzableBusiness } from "./helpers/select-analyzable-business.mjs";

const TARGET = process.env.TEQQI_APP_URL ?? "http://localhost:3000";
const assert = (condition, message) => { if (!condition) throw new Error(message); };

function runScript(script) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script], {
      stdio: "inherit",
      env: { ...process.env, TEQQI_APP_URL: TARGET },
    });
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`${script} failed with exit code ${code}.`)));
  });
}

console.log("\nTEQQI OS Phase 10 — FINAL smoke test");
console.log(`Target app: ${TARGET}\n`);

const focusedTests = [
  "scripts/phase10-business-detail-foundation-smoke-test.mjs",
  "scripts/phase10-score-breakdown-smoke-test.mjs",
  "scripts/phase10-analyzer-findings-smoke-test.mjs",
  "scripts/phase10-recommendations-evidence-smoke-test.mjs",
  "scripts/phase10-business-detail-navigation-smoke-test.mjs",
];

for (const script of focusedTests) {
  await runScript(script);
}

console.log("\nPhase 10 UI, refresh, audit, and error-state checks\n");

const dashboardResponse = await fetch(`${TARGET}/api/dashboard`);
const dashboardBody = await dashboardResponse.json();
assert(dashboardResponse.ok && dashboardBody.ok === true, `Dashboard API failed: ${JSON.stringify(dashboardBody)}`);

const selection = await selectAnalyzableBusiness(TARGET, dashboardBody.dashboard.rankedBusinesses);
const { candidate, skipped, source } = selection;
if (skipped.length > 0) {
  console.log(`↪ Skipped ${skipped.length} live website(s) that could not be safely analyzed right now.`);
}

let detail;
let expectedScoringRunId = null;
let expectedOpportunityRunId = null;

if (source === "FRESH_LIVE_RUN") {
  const initialRunBody = selection.body;
  assert(initialRunBody?.opportunityRunId, "An analyzable business must produce an initial opportunity run.");

  const beforeResponse = await fetch(`${TARGET}/api/businesses/${encodeURIComponent(candidate.externalId)}`);
  const beforeBody = await beforeResponse.json();
  assert(beforeResponse.ok && beforeBody.ok === true, `Business detail API failed before refresh: ${JSON.stringify(beforeBody)}`);
  const beforeOpportunityRunId = beforeBody.detail.intelligence.opportunityRun?.opportunityRunId ?? null;

  const refreshResponse = await fetch(`${TARGET}/api/websites/opportunities`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: candidate.websiteUrl, forceRefresh: true }),
  });
  const refreshBody = await refreshResponse.json();
  assert(refreshResponse.ok && refreshBody.ok === true, `Refresh pipeline failed: ${JSON.stringify(refreshBody)}`);
  assert(refreshBody.scoringRunId && refreshBody.opportunityRunId, "Refresh must create persisted scoring and opportunity runs.");
  assert(refreshBody.cache?.hit === false && refreshBody.cache?.forceRefresh === true, "Manual refresh must bypass the Phase 11 audit cache.");

  const afterResponse = await fetch(`${TARGET}/api/businesses/${encodeURIComponent(candidate.externalId)}`);
  const afterBody = await afterResponse.json();
  assert(afterResponse.ok && afterBody.ok === true, `Business detail API failed after refresh: ${JSON.stringify(afterBody)}`);
  assert(afterBody.detail.intelligence.scoringRun?.scoringRunId === refreshBody.scoringRunId, "Business detail must expose the scoring run created by refresh.");
  assert(afterBody.detail.intelligence.opportunityRun?.opportunityRunId === refreshBody.opportunityRunId, "Business detail must expose the opportunity run created by refresh.");
  assert(afterBody.detail.intelligence.opportunityRun?.opportunityRunId !== beforeOpportunityRunId, "Refresh must produce a new immutable opportunity run.");

  detail = afterBody.detail;
  expectedScoringRunId = refreshBody.scoringRunId;
  expectedOpportunityRunId = refreshBody.opportunityRunId;
  console.log("✓ Refresh analysis creates a new immutable Analyze → Score → Opportunities run chain and business details immediately resolve to it");
} else if (source === "PERSISTED_INTELLIGENCE_FALLBACK") {
  detail = selection.detail;
  expectedScoringRunId = detail?.intelligence?.scoringRun?.scoringRunId ?? null;
  expectedOpportunityRunId = detail?.intelligence?.opportunityRun?.opportunityRunId ?? null;
  assert(expectedScoringRunId && expectedOpportunityRunId, "Persisted fallback must preserve scoring/opportunity run traceability.");
  console.log("↪ Live refresh integration skipped because every current business website hit an approved site-specific safety failure.");
  console.log("✓ Persisted immutable scoring/opportunity run traceability remains available while live-site conditions are unsuitable");
} else {
  detail = selection.detail;
  assert(detail?.intelligence?.scoringRun === null, "Unavailable intelligence must not fabricate a scoring run.");
  assert(detail?.intelligence?.opportunityRun === null, "Unavailable intelligence must not fabricate an opportunity run.");
  assert(detail?.intelligence?.analyzerFindings?.available === false, "Unavailable intelligence must keep analyzer findings explicit.");
  assert(detail?.intelligence?.recommendations?.available === false, "Unavailable intelligence must keep recommendations explicit.");
  console.log("↪ Live refresh integration skipped because the only current website hit an approved site-specific safety failure and no prior audit exists.");
  console.log("✓ Business details preserve an explicit no-intelligence state without fabricating audit data");
}

const pageResponse = await fetch(`${TARGET}/businesses/${encodeURIComponent(candidate.externalId)}`);
const pageHtml = await pageResponse.text();
assert(pageResponse.ok, `Business detail page failed with ${pageResponse.status}.`);
for (const requiredText of [
  "Website Score",
  "Audit metadata",
  "Refresh analysis",
  "Score breakdown",
  "Analyzer findings",
  "Recommendations",
]) {
  assert(pageHtml.includes(requiredText), `Business detail page must render ${requiredText}.`);
}
if (expectedScoringRunId && expectedOpportunityRunId) {
  assert(pageHtml.includes("Last analyzed"), "Audited business detail page must render Last analyzed metadata.");
  assert(pageHtml.includes(expectedScoringRunId), "Rendered audit metadata must show the selected scoring run ID.");
  assert(pageHtml.includes(expectedOpportunityRunId), "Rendered audit metadata must show the selected opportunity run ID.");
  console.log("✓ Server-rendered business page exposes score, findings, recommendations, audit metadata, refresh control, and run traceability");
} else {
  assert(!pageHtml.includes("Tied to exact scoring run"), "Unaudited business page must not imply an immutable run chain exists.");
  console.log("✓ Server-rendered business page exposes the audit sections and refresh control without fabricating run metadata");
}

const missingPageResponse = await fetch(`${TARGET}/businesses/not-a-real-teqqi-place-id`, { redirect: "manual" });
const missingPageHtml = await missingPageResponse.text();
assert(missingPageResponse.status === 404, `Unknown business page must return 404; received ${missingPageResponse.status}.`);
assert(
  missingPageHtml.includes("Business unavailable") && missingPageHtml.includes("We couldn’t load this business."),
  "Unknown business page must render the controlled Phase 10 not-found state.",
);
console.log("✓ Unknown business pages return the controlled Phase 10 not-found experience");

const refreshSource = await readFile(new URL("../app/businesses/[externalId]/refresh-analysis-button.tsx", import.meta.url), "utf8");
assert(refreshSource.includes("disabled={!websiteUrl || isRefreshing}"), "Refresh control must disable itself without a website or while running.");
assert(refreshSource.includes("aria-busy={isRefreshing}"), "Refresh control must expose its busy state accessibly.");
assert(refreshSource.includes("forceRefresh: true"), "Manual refresh must explicitly bypass the Phase 11 website audit cache.");
assert(refreshSource.includes("w-full") && refreshSource.includes("sm:w-auto"), "Refresh control must support narrow and wider layouts.");
assert(refreshSource.includes("role=\"alert\""), "Refresh failures must be announced through an alert state.");

const errorSource = await readFile(new URL("../app/businesses/[externalId]/error.tsx", import.meta.url), "utf8");
const notFoundSource = await readFile(new URL("../app/businesses/[externalId]/not-found.tsx", import.meta.url), "utf8");
assert(errorSource.includes("Try again") && errorSource.includes("Back to dashboard"), "Page error state must offer recovery actions.");
assert(
  notFoundSource.includes("Business unavailable") && notFoundSource.includes("Back to dashboard"),
  "Not-found state must explain the problem and offer dashboard navigation.",
);
console.log("✓ Refresh, responsive, accessibility, error, and recovery states are present in the Phase 10 UI");

assert(detail.leadScore.available === false && detail.leadScore.score === null, "Phase 10 final gate must not fabricate commercial Lead Score.");
console.log("✓ Deferred business-level Lead Score remains an explicit product boundary");

console.log("\n✅ Phase 10 FINAL smoke test passed. Business Details exit criteria are satisfied.\n");
