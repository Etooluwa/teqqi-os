const baseUrl = process.env.TEQQI_OS_BASE_URL ?? "http://localhost:3000";
const testUrl = process.env.PHASE7_TEST_URL ?? "https://www.google.com/";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

console.log("\nTEQQI OS Phase 7 — API & Persistence smoke test");
console.log(`Target app: ${baseUrl}`);
console.log(`Website: ${testUrl}\n`);

const response = await fetch(`${baseUrl}/api/websites/score`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ url: testUrl }),
});

const body = await response.json();
assert(response.ok, `Scoring API failed: HTTP ${response.status} ${JSON.stringify(body)}`);
assert(body.ok === true, "Expected scoring API ok=true.");
assert(typeof body.scoringRunId === "string" && body.scoringRunId.length > 0, "Expected persisted scoringRunId.");
assert(body.persistence?.stored === true, "Expected scoring persistence confirmation.");
assert(body.persistence?.historicalResultImmutable === true, "Expected immutable historical scoring result flag.");
assert(body.scoring?.scoringModelVersion === "1.0.0", "Expected scoring model version 1.0.0.");
assert(Array.isArray(body.scoring?.categoryScores) && body.scoring.categoryScores.length === 6, "Expected six category scores.");
assert(Array.isArray(body.scoring?.ruleScores) && body.scoring.ruleScores.length === 140, "Expected 140 rule scores.");
console.log("✓ Website analysis flows into the unified Phase 7 scoring API");
console.log("✓ API response contains six category explanations and 140 rule contributions");
console.log("✓ Scoring run is persisted with a historical immutable run ID");

const historyResponse = await fetch(`${baseUrl}/api/websites/score/${body.scoringRunId}`);
const history = await historyResponse.json();
assert(historyResponse.ok, `Historical score lookup failed: HTTP ${historyResponse.status} ${JSON.stringify(history)}`);
assert(history.ok === true, "Expected historical scoring lookup ok=true.");
assert(history.run?.id === body.scoringRunId, "Historical run ID must match persisted scoring run.");
assert(history.run?.scoring_model_version === body.scoring.scoringModelVersion, "Persisted scoring model version must match API result.");
assert(history.run?.analyzer_version === body.analyzerVersion, "Persisted analyzer version must match API result.");
assert(Array.isArray(history.categories) && history.categories.length === 6, "Expected six persisted category rows.");
assert(history.run?.explanation?.ruleScores?.length === 140, "Persisted explanation must preserve all 140 rule contributions.");
console.log("✓ Historical scoring endpoint reloads the persisted run");
console.log("✓ Analyzer/scoring versions and six category snapshots are persisted");
console.log("✓ Full score explanation preserves all 140 contributing/excluded rules");

console.log("\nPhase 7 API & Persistence smoke test passed.\n");
