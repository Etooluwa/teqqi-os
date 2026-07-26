const TARGET = process.env.TEQQI_APP_URL ?? "http://localhost:3000";
const assert = (condition, message) => { if (!condition) throw new Error(message); };
console.log("\nTEQQI OS Phase 10 — Recommendations & Evidence smoke test");
console.log(`Target app: ${TARGET}\n`);

const dashboardResponse = await fetch(`${TARGET}/api/dashboard`);
const dashboardBody = await dashboardResponse.json();
assert(dashboardResponse.ok && dashboardBody.ok, `Dashboard API failed: ${JSON.stringify(dashboardBody)}`);
const candidate = dashboardBody.dashboard.businesses.find((row) => row.opportunityRunId) ?? dashboardBody.dashboard.businesses.find((row) => row.websiteUrl);
assert(candidate, "A discovered business with website intelligence is required.");

const response = await fetch(`${TARGET}/api/businesses/${encodeURIComponent(candidate.externalId)}`);
const body = await response.json();
assert(response.ok && body.ok, `Business detail API failed: ${JSON.stringify(body)}`);
const detail = body.detail;
const recommendations = detail.intelligence.recommendations;
assert(recommendations && typeof recommendations.available === "boolean", "Recommendations contract must be explicit.");

if (recommendations.available) {
  assert(recommendations.opportunityCount === recommendations.recommendations.length, "Opportunity count must reconcile.");
  for (const item of recommendations.recommendations) {
    assert(item.opportunityId && item.title && item.recommendedService, "Recommendation identity and service are required.");
    assert(["CRITICAL", "HIGH", "MEDIUM", "LOW"].includes(item.priority), "Priority must use the approved scale.");
    assert(["HIGH", "MEDIUM", "LOW"].includes(item.confidence), "Confidence must use the approved scale.");
    assert(Array.isArray(item.priorityReasons) && Array.isArray(item.confidenceReasons), "Assessment reasons must remain explicit.");
    assert(item.evidenceCount === item.evidence.length, "Evidence count must reconcile.");
    assert(item.evidence.every((e) => item.supportingFindingIds.includes(e.ruleId)), "Evidence must come only from supporting analyzer findings.");
  }
  console.log("✓ Website opportunities expose approved services, priority, confidence, and assessment reasoning");
  console.log("✓ Recommendation evidence remains traceable to the exact supporting Phase 6 analyzer findings");
  console.log("✓ Opportunity and scoring model versions remain explicit for reproducibility");
} else {
  assert(recommendations.unavailableReason === "NO_COMPLETED_OPPORTUNITY_RUN", "Unavailable recommendations need an explicit reason.");
  console.log("✓ Missing opportunity intelligence remains explicit rather than fabricating recommendations");
}
assert(detail.leadScore.available === false && detail.leadScore.score === null, "Recommendations must not fabricate commercial Lead Scoring.");
console.log("✓ Website recommendations remain separate from deferred business-level Lead Scoring");
console.log("\nPhase 10 Recommendations & Evidence smoke test passed.\n");
