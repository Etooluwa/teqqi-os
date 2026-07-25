const baseUrl = process.env.TEQQI_OS_BASE_URL ?? "http://localhost:3000";
const website = process.env.TEQQI_OS_PHASE8_TEST_URL ?? "https://www.google.com/";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function jsonResponse(response, label) {
  let body;
  try {
    body = await response.json();
  } catch {
    throw new Error(`${label} returned non-JSON HTTP ${response.status}.`);
  }
  assert(response.ok, `${label} failed: HTTP ${response.status} ${JSON.stringify(body)}`);
  return body;
}

console.log("\nTEQQI OS Phase 8 — Opportunity Engine completion review");
console.log(`Target app: ${baseUrl}`);
console.log(`Website: ${website}\n`);

const createResponse = await fetch(`${baseUrl}/api/websites/opportunities`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ url: website }),
});
const live = await jsonResponse(createResponse, "Opportunity request");
const result = live.opportunityResult;

assert(live.ok === true, "Expected successful Opportunity API response.");
assert(typeof live.opportunityRunId === "string" && live.opportunityRunId.length > 0, "Expected persisted opportunity run ID.");
assert(typeof live.scoringRunId === "string" && live.scoringRunId.length > 0, "Expected persisted scoring run ID.");
assert(typeof live.analyzerVersion === "string" && live.analyzerVersion.length > 0, "Expected analyzer version.");
assert(live.persistence?.stored === true, "Expected Opportunity API persistence.");
assert(live.persistence?.historicalResultImmutable === true, "Opportunity run must be immutable.");
assert(result?.evaluatedFindingCount === 140, `Expected 140 analyzer findings, received ${result?.evaluatedFindingCount}.`);
console.log("✓ Phase 6 analysis and Phase 7 scoring flow into a versioned Phase 8 opportunity run");

assert(result.eligibleFindingCount + result.excludedFindingCount === 140, "Eligible and excluded finding counts must total 140.");
assert(result.candidateCount === result.trace?.detection?.candidates?.length, "Candidate count does not reconcile with detection trace.");
assert(result.trace?.grouping?.candidateCount === result.candidateCount, "Grouping candidate count does not reconcile.");
assert(result.trace?.grouping?.groupCount === result.trace?.assessment?.groupCount, "Grouping and assessment counts do not reconcile.");
assert(result.opportunityCount === result.opportunities.length, "Final opportunity count does not reconcile.");
assert(result.opportunityCount === result.trace?.grouping?.groupCount, "Each final opportunity must reconcile to one grouped opportunity.");
console.log("✓ Detection, grouping, assessment, and final opportunity counts reconcile end to end");

const prohibited = new Set([
  "INTERNAL_TOOL",
  "CRM",
  "CUSTOMER_PORTAL",
  "AI_AUTOMATION",
  "MOBILE_APP",
  "BOOKING_SYSTEM",
  "ECOMMERCE",
]);
const opportunityIds = new Set();
for (const opportunity of result.opportunities) {
  assert(!opportunityIds.has(opportunity.opportunityId), `Duplicate final opportunity ${opportunity.opportunityId}.`);
  opportunityIds.add(opportunity.opportunityId);
  assert(!prohibited.has(opportunity.recommendedService), `Prohibited business-service inference emitted: ${opportunity.recommendedService}.`);
  assert(Array.isArray(opportunity.supportingFindingIds) && opportunity.supportingFindingIds.length > 0, `${opportunity.opportunityId} has no supporting findings.`);
  assert(new Set(opportunity.supportingFindingIds).size === opportunity.supportingFindingIds.length, `${opportunity.opportunityId} has duplicate supporting findings.`);
  assert(Array.isArray(opportunity.candidateIds) && opportunity.candidateIds.length > 0, `${opportunity.opportunityId} has no candidate trace.`);
  assert(Array.isArray(opportunity.detectionRuleIds) && opportunity.detectionRuleIds.length > 0, `${opportunity.opportunityId} has no detection-rule trace.`);
  assert(["CRITICAL", "HIGH", "MEDIUM", "LOW"].includes(opportunity.priority), `${opportunity.opportunityId} has invalid priority.`);
  assert(["HIGH", "MEDIUM", "LOW"].includes(opportunity.confidence), `${opportunity.opportunityId} has invalid recommendation confidence.`);
  assert(typeof opportunity.recommendation === "string" && opportunity.recommendation.length > 0, `${opportunity.opportunityId} is missing recommendation text.`);
  assert(typeof opportunity.explanation === "string" && opportunity.explanation.length > 0, `${opportunity.opportunityId} is missing explanation.`);
  assert(Array.isArray(opportunity.priorityReasons) && opportunity.priorityReasons.length > 0, `${opportunity.opportunityId} must explain priority.`);
  assert(Array.isArray(opportunity.confidenceReasons) && opportunity.confidenceReasons.length > 0, `${opportunity.opportunityId} must explain confidence.`);
  assert(opportunity.opportunityEngineVersion === result.opportunityEngineVersion, `${opportunity.opportunityId} opportunity-engine version mismatch.`);
  assert(opportunity.scoringModelVersion === result.scoringModelVersion, `${opportunity.opportunityId} scoring-model version mismatch.`);
}
console.log("✓ Every final opportunity is website-only, unique, evidence-backed, prioritized, and explainable");

assert(result.opportunityEngineVersion === result.trace?.detection?.opportunityEngineVersion, "Detection version mismatch.");
assert(result.opportunityEngineVersion === result.trace?.grouping?.opportunityEngineVersion, "Grouping version mismatch.");
assert(result.opportunityEngineVersion === result.trace?.assessment?.opportunityEngineVersion, "Assessment version mismatch.");
assert(result.scoringModelVersion === result.trace?.assessment?.scoringModelVersion, "Assessment scoring-model version mismatch.");
assert(live.scoring?.scoringModelVersion === result.scoringModelVersion, "API scoring and opportunity scoring versions must match.");
console.log("✓ Analyzer, scoring, detection, grouping, assessment, and recommendation versions remain reproducible");

const scoringResponse = await fetch(`${baseUrl}/api/websites/score/${encodeURIComponent(live.scoringRunId)}`);
const scoringHistorical = await jsonResponse(scoringResponse, "Historical scoring lookup");
assert(scoringHistorical.ok === true, "Expected historical scoring response.");
assert(scoringHistorical.run?.id === live.scoringRunId, "Opportunity run points to a different historical scoring run.");
assert(scoringHistorical.run?.analyzer_version === live.analyzerVersion, "Analyzer version differs between scoring and opportunity history.");
assert(scoringHistorical.run?.scoring_model_version === result.scoringModelVersion, "Scoring-model version differs between scoring and opportunity history.");
assert(Array.isArray(scoringHistorical.run?.explanation?.ruleScores) && scoringHistorical.run.explanation.ruleScores.length === 140, "Historical scoring run must preserve all 140 rule scores.");
console.log("✓ Phase 8 is tied to the immutable Phase 7 scoring evidence that produced it");

const historicalResponse = await fetch(
  `${baseUrl}/api/websites/opportunities/${encodeURIComponent(live.opportunityRunId)}`,
);
const historical = await jsonResponse(historicalResponse, "Historical opportunity lookup");
assert(historical.ok === true, "Expected historical opportunity response.");
assert(historical.opportunityRunId === live.opportunityRunId, "Historical opportunity run ID mismatch.");
assert(historical.scoringRunId === live.scoringRunId, "Historical opportunity scoring run ID mismatch.");
assert(historical.analyzerVersion === live.analyzerVersion, "Historical analyzer version mismatch.");
assert(historical.opportunityEngineVersion === result.opportunityEngineVersion, "Historical opportunity-engine version mismatch.");
assert(historical.scoringModelVersion === result.scoringModelVersion, "Historical scoring-model version mismatch.");
assert(historical.opportunityResult?.evaluatedFindingCount === 140, "Historical result must preserve all 140 evaluated findings.");
assert(historical.opportunityResult?.opportunityCount === result.opportunityCount, "Historical opportunity count mismatch.");
assert(Array.isArray(historical.opportunities) && historical.opportunities.length === result.opportunityCount, "Persisted opportunity rows do not match final opportunity count.");
assert(historical.persistence?.historicalResultImmutable === true, "Historical opportunity endpoint must identify immutable results.");

const storedKeys = new Set(historical.opportunities.map((row) => row.opportunity_key));
for (const opportunity of result.opportunities) {
  assert(storedKeys.has(opportunity.opportunityId), `Persisted history is missing ${opportunity.opportunityId}.`);
}
console.log("✓ Immutable persistence preserves the complete structured Opportunity Engine result and evidence links");

console.log("\nPhase 8 Opportunity Engine completion review passed.\n");
