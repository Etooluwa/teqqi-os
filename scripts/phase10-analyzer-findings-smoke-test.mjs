import { selectAnalyzableBusiness } from "./helpers/select-analyzable-business.mjs";

const TARGET = process.env.TEQQI_APP_URL ?? "http://localhost:3000";
const assert = (condition, message) => { if (!condition) throw new Error(message); };

console.log("\nTEQQI OS Phase 10 — Analyzer Findings smoke test");
console.log(`Target app: ${TARGET}\n`);

const dashboardResponse = await fetch(`${TARGET}/api/dashboard`);
const dashboardBody = await dashboardResponse.json();
assert(dashboardResponse.ok && dashboardBody.ok === true, `Dashboard API failed: ${JSON.stringify(dashboardBody)}`);

const selection = await selectAnalyzableBusiness(TARGET, dashboardBody.dashboard.rankedBusinesses);
const { candidate, skipped, source } = selection;
if (skipped.length > 0) {
  console.log(`↪ Skipped ${skipped.length} live website(s) that could not be safely analyzed right now.`);
}
if (source === "PERSISTED_INTELLIGENCE_FALLBACK") {
  console.log("↪ No live business website was analyzable; validating the latest persisted immutable intelligence instead.");
}
if (source === "NO_INTELLIGENCE_AVAILABLE") {
  console.log("↪ No live or persisted analyzer intelligence is available; validating the explicit unavailable state.");
}

let detail = selection.detail;
if (!detail) {
  assert(selection.body?.ok === true, `Fresh website intelligence run failed: ${JSON.stringify(selection.body)}`);
  const response = await fetch(`${TARGET}/api/businesses/${encodeURIComponent(candidate.externalId)}`);
  const body = await response.json();
  assert(response.ok && body.ok === true, `Business detail API failed: ${JSON.stringify(body)}`);
  detail = body.detail;
}

const findings = detail.intelligence.analyzerFindings;

if (source === "NO_INTELLIGENCE_AVAILABLE") {
  assert(findings.available === false, "Analyzer findings must remain explicitly unavailable when no audit exists.");
  assert(typeof findings.unavailableReason === "string" && findings.unavailableReason.length > 0, "Unavailable analyzer findings must explain why they are unavailable.");
  assert(findings.findingCount === 0, "Unavailable analyzer findings must not fabricate finding counts.");
  assert(Array.isArray(findings.groups) && findings.groups.length === 0, "Unavailable analyzer findings must not fabricate finding groups.");
  assert(detail.intelligence.scoringRun === null, "No scoring run should be fabricated when analyzer intelligence is unavailable.");
  assert(detail.leadScore.available === false, "Missing analyzer findings must not create a commercial Lead Score.");
  console.log("✓ Missing analyzer intelligence is explicit and does not fabricate findings, scoring, or Lead Score");
} else {
  assert(findings.available === true, `Analyzer findings should be available; reason: ${findings.unavailableReason}`);
  assert(findings.findingCount === 140, `Expected 140 persisted analyzer findings; received ${findings.findingCount}.`);
  assert(findings.groups.length === 6, `Expected six analyzer finding groups; received ${findings.groups.length}.`);
  console.log("✓ Phase 6 analyzer evidence is persisted immutably and exposed through business details");

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
}

console.log("\nPhase 10 Analyzer Findings smoke test passed.\n");
