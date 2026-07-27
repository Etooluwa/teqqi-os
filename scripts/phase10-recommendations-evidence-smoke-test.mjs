import { selectAnalyzableBusiness } from "./helpers/select-analyzable-business.mjs";

const TARGET = process.env.TEQQI_APP_URL ?? "http://localhost:3000";
const assert = (condition, message) => { if (!condition) throw new Error(message); };

console.log("\nTEQQI OS Phase 10 — Recommendations & Evidence smoke test");
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
  console.log("↪ No live business website was analyzable; validating the latest persisted immutable recommendation chain instead.");
}

let detail = selection.detail;
let runBody = selection.body;
if (!detail) {
  assert(runBody?.ok === true, `Fresh opportunity run failed: ${JSON.stringify(runBody)}`);
  const response = await fetch(`${TARGET}/api/businesses/${encodeURIComponent(candidate.externalId)}`);
  const body = await response.json();
  assert(response.ok && body.ok === true, `Business detail API failed: ${JSON.stringify(body)}`);
  detail = body.detail;
} else {
  runBody = {
    opportunityRunId: detail.intelligence.opportunityRun?.opportunityRunId,
    scoringRunId: detail.intelligence.scoringRun?.scoringRunId,
  };
}

const recommendations = detail.intelligence.recommendations;
assert(recommendations.available === true, "Recommendations must be available from the selected immutable opportunity run.");
assert(recommendations.opportunityRunId === runBody.opportunityRunId, "Recommendations must identify the exact opportunity run.");
assert(recommendations.scoringRunId === runBody.scoringRunId, "Recommendations must identify the exact scoring run used by Phase 8.");
assert(recommendations.opportunityRunId === detail.intelligence.opportunityRun?.opportunityRunId, "Recommendations must match the business-detail opportunity run.");
assert(recommendations.scoringRunId === detail.intelligence.scoringRun?.scoringRunId, "Recommendations must use the matching business-detail scoring run.");
console.log("✓ Recommendations remain tied to the exact immutable scoring/opportunity run chain");

assert(recommendations.opportunityCount === recommendations.recommendations.length, "Recommendation count must reconcile.");
assert(recommendations.opportunityCount === detail.intelligence.opportunityRun.result.opportunityCount, "Recommendation count must match the Phase 8 result.");
console.log("✓ Every Phase 8 opportunity is represented exactly once in business details");

for (const item of recommendations.recommendations) {
  assert(item.opportunityId && item.title && item.recommendedService, "Recommendation identity and service are required.");
  assert(["CRITICAL", "HIGH", "MEDIUM", "LOW"].includes(item.priority), "Priority must use the approved scale.");
  assert(["HIGH", "MEDIUM", "LOW"].includes(item.confidence), "Confidence must use the approved scale.");
  assert(typeof item.recommendation === "string" && item.recommendation.length > 0, "Recommendation action must remain explicit.");
  assert(typeof item.explanation === "string" && item.explanation.length > 0, "Recommendation explanation must remain explicit.");
  assert(Array.isArray(item.priorityReasons) && item.priorityReasons.length > 0, "Priority reasoning must remain explicit.");
  assert(Array.isArray(item.confidenceReasons) && item.confidenceReasons.length > 0, "Confidence reasoning must remain explicit.");
}
console.log("✓ Approved service mapping, priority, confidence, action, and reasoning remain transparent");

assert(recommendations.evidenceAvailable === true, `Recommendation evidence should be complete; reason: ${recommendations.evidenceUnavailableReason}`);
assert(recommendations.recommendationCountWithCompleteEvidence === recommendations.opportunityCount, "Every recommendation must have complete evidence.");
const analyzerFindingIds = new Set(detail.intelligence.analyzerFindings.groups.flatMap((group) => group.findings.map((finding) => finding.ruleId)));
for (const item of recommendations.recommendations) {
  assert(item.evidenceAvailable === true, `${item.opportunityId} must expose complete supporting evidence.`);
  assert(item.evidenceCount === item.expectedEvidenceCount, `${item.opportunityId} evidence totals must reconcile.`);
  assert(item.evidenceCount === item.supportingFindingIds.length, `${item.opportunityId} evidence must match supporting finding IDs.`);
  assert(item.missingEvidenceFindingIds.length === 0, `${item.opportunityId} must not lose supporting finding IDs.`);
  assert(new Set(item.evidence.map((evidence) => evidence.ruleId)).size === item.evidence.length, `${item.opportunityId} evidence must be unique.`);
  for (const evidence of item.evidence) {
    assert(item.supportingFindingIds.includes(evidence.ruleId), "Evidence must come only from supporting analyzer findings.");
    assert(analyzerFindingIds.has(evidence.ruleId), `${evidence.ruleId} must originate in the persisted Phase 6 run.`);
    assert(evidence.summary && evidence.detectorVersion, `${evidence.ruleId} must preserve summary and detector version.`);
    assert(evidence.evidence && typeof evidence.evidence === "object", `${evidence.ruleId} must preserve structured detector evidence.`);
    assert(evidence.result && typeof evidence.result === "object", `${evidence.ruleId} must preserve structured detector result data.`);
    assert(typeof evidence.applicable === "boolean", `${evidence.ruleId} must preserve analyzer applicability.`);
    assert(typeof evidence.scoring?.matched === "boolean" && typeof evidence.scoring?.included === "boolean", `${evidence.ruleId} must preserve Phase 7 scoring traceability.`);
  }
}
console.log("✓ Supporting Phase 6 findings and Phase 7 scoring participation remain complete and traceable for every recommendation");

assert(recommendations.opportunityEngineVersion === detail.intelligence.opportunityRun.opportunityEngineVersion, "Opportunity Engine version must reconcile.");
assert(recommendations.scoringModelVersion === detail.intelligence.scoringRun.scoringModelVersion, "Scoring model version must reconcile.");
assert(detail.leadScore.available === false && detail.leadScore.score === null, "Recommendations must not create commercial Lead Scoring.");
console.log("✓ Engine versions remain reproducible and website recommendations stay separate from deferred Lead Scoring");

console.log("\nPhase 10 Recommendations & Evidence smoke test passed.\n");
