const target = process.env.TEQQI_APP_URL ?? "http://localhost:3000";
const website = process.env.TEQQI_TEST_WEBSITE ?? "https://www.google.com/";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

console.log("\nTEQQI OS Phase 8 — API & Persistence smoke test");
console.log(`Target app: ${target}`);
console.log(`Website: ${website}\n`);

const response = await fetch(`${target}/api/websites/opportunities`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ url: website }),
});
const body = await response.json();
assert(response.ok && body.ok === true, `Opportunity API failed: ${JSON.stringify(body.error ?? body)}`);
assert(typeof body.opportunityRunId === "string" && body.opportunityRunId.length > 0, "Expected opportunityRunId.");
assert(typeof body.scoringRunId === "string" && body.scoringRunId.length > 0, "Expected scoringRunId.");
assert(body.opportunityResult?.evaluatedFindingCount === 140, "Expected all 140 analyzer findings to reach Phase 8.");
assert(Array.isArray(body.opportunityResult?.opportunities), "Expected structured opportunities array.");
console.log("✓ Website analysis and scoring flow into the Phase 8 Opportunity API");

const result = body.opportunityResult;
assert(result.candidateCount === result.trace.detection.candidates.length, "Detection candidate count must reconcile.");
assert(result.opportunityCount === result.opportunities.length, "Final opportunity count must reconcile.");
assert(result.trace.grouping.groupCount === result.trace.assessment.groupCount, "Grouping and assessment counts must reconcile.");
console.log("✓ Detection, grouping, assessment, and final opportunity counts reconcile");

const prohibited = new Set([
  "INTERNAL_TOOL",
  "CRM",
  "CUSTOMER_PORTAL",
  "AI_AUTOMATION",
  "MOBILE_APP",
  "BOOKING_SYSTEM",
  "ECOMMERCE",
]);
for (const opportunity of result.opportunities) {
  assert(!prohibited.has(opportunity.recommendedService), `Prohibited service emitted: ${opportunity.recommendedService}`);
  assert(Array.isArray(opportunity.supportingFindingIds) && opportunity.supportingFindingIds.length > 0, "Opportunity must preserve supporting findings.");
  assert(opportunity.opportunityEngineVersion === result.opportunityEngineVersion, "Opportunity engine version must reconcile.");
  assert(opportunity.scoringModelVersion === result.scoringModelVersion, "Scoring model version must reconcile.");
}
console.log("✓ Persistable opportunity output remains website-only and fully traceable");

const historicalResponse = await fetch(
  `${target}/api/websites/opportunities/${encodeURIComponent(body.opportunityRunId)}`,
);
const historical = await historicalResponse.json();
assert(historicalResponse.ok && historical.ok === true, `Historical lookup failed: ${JSON.stringify(historical.error ?? historical)}`);
assert(historical.opportunityRunId === body.opportunityRunId, "Historical run ID must match.");
assert(historical.scoringRunId === body.scoringRunId, "Historical scoring run ID must match.");
assert(historical.opportunityEngineVersion === result.opportunityEngineVersion, "Persisted opportunity engine version must match.");
assert(historical.scoringModelVersion === result.scoringModelVersion, "Persisted scoring model version must match.");
assert(historical.opportunityResult?.evaluatedFindingCount === 140, "Historical result must preserve all 140 evaluated findings.");
assert(Array.isArray(historical.opportunities), "Historical endpoint must return persisted opportunity rows.");
assert(historical.opportunities.length === result.opportunityCount, "Persisted opportunity rows must match final opportunity count.");
console.log("✓ Opportunity run and individual opportunities are persisted and reloadable");

const storedKeys = new Set(historical.opportunities.map((row) => row.opportunity_key));
for (const opportunity of result.opportunities) {
  assert(storedKeys.has(opportunity.opportunityId), `Missing persisted opportunity ${opportunity.opportunityId}.`);
}
console.log("✓ Historical persistence preserves every structured opportunity and evidence link");

assert(historical.persistence?.historicalResultImmutable === true, "Historical result must be marked immutable.");
assert(body.persistence?.historicalResultImmutable === true, "Create response must mark result immutable.");
console.log("✓ Analyzer, scoring, and opportunity versions are tied to an immutable historical run");

console.log("\nPhase 8 API & Persistence smoke test passed.\n");
