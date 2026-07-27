import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";

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
const candidate = dashboardBody.dashboard.rankedBusinesses.find((row) => row.websiteUrl);
assert(candidate?.externalId && candidate?.websiteUrl, "A discovered business with a website is required for the final Phase 10 test.");

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
console.log("✓ Refresh analysis creates a new immutable Analyze → Score → Opportunities run chain and business details immediately resolve to it");

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
  "Last analyzed",
]) {
  assert(pageHtml.includes(requiredText), `Business detail page must render ${requiredText}.`);
}
assert(pageHtml.includes(refreshBody.scoringRunId), "Rendered audit metadata must show the latest scoring run ID.");
assert(pageHtml.includes(refreshBody.opportunityRunId), "Rendered audit metadata must show the latest opportunity run ID.");
console.log("✓ Server-rendered business page exposes score, findings, recommendations, audit metadata, refresh control, and latest run traceability");

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

assert(afterBody.detail.leadScore.available === false && afterBody.detail.leadScore.score === null, "Phase 10 final gate must not fabricate commercial Lead Score.");
console.log("✓ Deferred business-level Lead Score remains an explicit product boundary");

console.log("\n✅ Phase 10 FINAL smoke test passed. Business Details exit criteria are satisfied.\n");
