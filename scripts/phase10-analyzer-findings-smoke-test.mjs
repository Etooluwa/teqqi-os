const TARGET = process.env.TEQQI_APP_URL ?? "http://localhost:3000";
const assert = (condition, message) => { if (!condition) throw new Error(message); };

console.log("\nTEQQI OS Phase 10 — Analyzer Findings smoke test");
console.log(`Target app: ${TARGET}\n`);

const dashboardResponse = await fetch(`${TARGET}/api/dashboard`);
const dashboardBody = await dashboardResponse.json();
assert(dashboardResponse.ok && dashboardBody.ok === true, `Dashboard API failed: ${JSON.stringify(dashboardBody)}`);

const candidate = dashboardBody.dashboard.rankedBusinesses.find((row) => row.websiteUrl);
assert(candidate?.externalId && candidate?.websiteUrl, "A discovered business with a website is required for the Phase 10 analyzer findings test.");

// Create a fresh immutable scoring/opportunity run so the persisted Phase 6 findings
// are guaranteed to exist even when older Phase 7 runs predate Phase 10 finding persistence.
const analyzeResponse = await fetch(`${TARGET}/api/websites/opportunities`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ url: candidate.websiteUrl, forceRefresh: true }),
});
const analyzeBody = await analyzeResponse.json();
assert(analyzeResponse.ok && analyzeBody.ok === true, `Fresh website intelligence run failed: ${JSON.stringify(analyzeBody)}`);

const response = await fetch(`${TARGET}/api/businesses/${encodeURIComponent(candidate.externalId)}`);
const body = await response.json();
assert(response.ok && body.ok === true, `Business detail API failed: ${JSON.stringify(body)}`);
const detail = body.detail;
const findings = detail.intelligence.analyzerFindings;

assert(findings.available === true, `Analyzer findings should be available after a fresh run; reason: ${findings.unavailableReason}`);
assert(findings.findingCount === 140, `Expected 140 persisted analyzer findings; received ${findings.findingCount}.`);
assert(findings.groups.length === 6, `Expected six analyzer finding groups; received ${findings.groups.length}.`);
console.log("✓ Fresh Phase 6 analyzer evidence is persisted immutably and exposed through business details");

const expectedCounts = new Map([
  ["TECHNICAL_HEALTH", 38],
  ["SEO", 24],
  ["PERFORMANCE", 16],
  ["CONVERSION_UX", 22],
  ["ACCESSIBILITY", 22],
  ["CONTENT_QUALITY", 18],
]);
for (const group of findings.groups) {
  assert(group.findingCount === expectedCounts.get(group.category), `${group.category} finding count does not match Phase 6.`);
  assert(group.findings.length === group.findingCount, `${group.category} grouped findings must reconcile.`);
  assert(
    group.passCount + group.warningCount + group.failCount + group.unknownCount + group.notApplicableCount === group.findingCount,
    `${group.category} status totals must reconcile.`,
  );
}
console.log("✓ All six categories preserve the approved 38 / 24 / 16 / 22 / 22 / 18 finding counts");

const allFindings = findings.groups.flatMap((group) => group.findings);
assert(new Set(allFindings.map((finding) => finding.ruleId)).size === 140, "All 140 analyzer rule IDs must remain globally unique.");
assert(allFindings.every((finding) => typeof finding.summary === "string" && finding.summary.length > 0), "Every finding must preserve its analyzer summary.");
assert(allFindings.every((finding) => finding.evidence && typeof finding.evidence === "object"), "Every finding must preserve structured evidence.");
assert(allFindings.every((finding) => finding.result && typeof finding.result === "object"), "Every finding must preserve structured detector result data.");
assert(allFindings.every((finding) => typeof finding.detectorVersion === "string" && finding.detectorVersion.length > 0), "Every finding must preserve detector version traceability.");
console.log("✓ Findings preserve status, confidence, applicability, summaries, evidence, result data, and detector versions");

assert(allFindings.every((finding) => finding.scoring.matched === true), "Every persisted analyzer finding must match a Phase 7 rule contribution.");
assert(allFindings.every((finding) => typeof finding.scoring.included === "boolean"), "Every finding must expose scoring participation.");
assert(
  allFindings.every((finding) => finding.scoring.included || ["NOT_APPLICABLE", "UNKNOWN", "LOW_CONFIDENCE"].includes(finding.scoring.exclusionReason)),
  "Excluded findings must preserve the approved Phase 7 exclusion reason.",
);
console.log("✓ Every analyzer finding remains traceable into its Phase 7 scoring participation or exclusion reason");

assert(detail.intelligence.scoringRun?.analyzerVersion === findings.analyzerVersion, "Analyzer finding version must match the scoring run that persisted it.");
assert(detail.leadScore.available === false, "Analyzer findings must not create a commercial Lead Score.");
console.log("✓ Findings remain tied to their immutable analyzer/scoring run and do not infer business-level Lead Scoring");

console.log("\nPhase 10 Analyzer Findings smoke test passed.\n");
