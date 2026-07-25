const baseUrl = process.env.TEQQI_OS_BASE_URL ?? "http://localhost:3000";
const website = process.env.TEQQI_OS_PHASE7_TEST_URL ?? "https://www.google.com/";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function approxEqual(a, b, tolerance = 1e-9) {
  return Math.abs(a - b) <= tolerance;
}

async function postScore() {
  const response = await fetch(`${baseUrl}/api/websites/score`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: website }),
  });
  const data = await response.json();
  assert(response.ok, `Scoring request failed: HTTP ${response.status} ${JSON.stringify(data)}`);
  return data;
}

console.log("\nTEQQI OS Phase 7 — Website Scoring completion review");
console.log(`Target app: ${baseUrl}`);
console.log(`Website: ${website}\n`);

const result = await postScore();
const scoring = result.scoring;

assert(result.ok === true, "Expected successful score response.");
assert(typeof result.scoringRunId === "string" && result.scoringRunId.length > 0, "Expected persisted scoring run ID.");
assert(result.persistence?.stored === true, "Expected scoring run persistence.");
assert(result.persistence?.historicalResultImmutable === true, "Historical result must be marked immutable.");
assert(typeof result.analyzerVersion === "string" && result.analyzerVersion.length > 0, "Expected analyzer version.");
assert(typeof scoring?.scoringModelVersion === "string" && scoring.scoringModelVersion.length > 0, "Expected scoring model version.");
console.log("✓ Phase 6 analyzer output flows into a versioned Phase 7 scoring run");

assert(Array.isArray(scoring.categoryScores) && scoring.categoryScores.length === 6, "Expected six category score explanations.");
assert(Array.isArray(scoring.weightedCategories) && scoring.weightedCategories.length === 6, "Expected six weighted category contributions.");
assert(Array.isArray(scoring.ruleScores) && scoring.ruleScores.length === 140, `Expected 140 rule scores, received ${scoring.ruleScores?.length}.`);
assert(new Set(scoring.ruleScores.map((item) => item.ruleId)).size === 140, "All 140 rule scores must be globally unique.");
console.log("✓ All six categories and all 140 configured rules are represented exactly once");

for (const category of scoring.categoryScores) {
  assert(category.providedFindingCount === category.includedRuleCount + category.excludedRuleCount, `${category.category} finding counts do not reconcile.`);
  const included = category.ruleScores.filter((item) => item.included);
  const earned = included.reduce((sum, item) => sum + item.earnedPoints, 0);
  const available = included.reduce((sum, item) => sum + item.maxPoints, 0);
  assert(approxEqual(category.earnedPoints, earned), `${category.category} earned points do not reconcile.`);
  assert(approxEqual(category.availablePoints, available), `${category.category} available points do not reconcile.`);
  if (category.available) {
    assert(typeof category.score === "number" && category.score >= 0 && category.score <= 100, `${category.category} score must be within 0–100.`);
  } else {
    assert(category.score === null, `${category.category} unavailable score must be null.`);
  }
}
console.log("✓ Rule contributions reconcile to each category score and missing evidence stays explicit");

const weightedTotal = scoring.weightedCategories.reduce(
  (sum, item) => sum + (item.weightedContribution ?? 0),
  0,
);
assert(approxEqual(weightedTotal, scoring.measuredWeightedTotal), "Weighted category contributions do not reconcile.");
assert(approxEqual(scoring.measuredWeight + scoring.missingWeight, 1), "Measured and missing category weights must total 1.");

if (scoring.scoreAvailable) {
  assert(typeof scoring.uncappedWebsiteScore === "number", "Available score requires an uncapped score.");
  assert(typeof scoring.websiteScore === "number", "Available score requires a final Website Score.");
  assert(scoring.websiteScore >= 0 && scoring.websiteScore <= 100, "Final Website Score must be within 0–100.");
  assert(scoring.websiteScore <= scoring.uncappedWebsiteScore, "Critical caps must never raise the Website Score.");
  if (scoring.appliedCriticalCap !== null) {
    assert([80, 60, 40].includes(scoring.appliedCriticalCap), "Applied critical cap must be 80, 60, or 40.");
    assert(scoring.websiteScore <= scoring.appliedCriticalCap, "Final score exceeds its critical cap.");
  }
} else {
  assert(scoring.websiteScore === null && scoring.uncappedWebsiteScore === null, "Unavailable overall score must remain null.");
  assert(Array.isArray(scoring.unavailableCategories) && scoring.unavailableCategories.length > 0, "Unavailable overall score must identify missing categories.");
}
console.log("✓ Weighted Website Score, missing-data behavior, and critical-cap behavior reconcile");

for (const rule of scoring.ruleScores) {
  assert(typeof rule.ruleId === "string" && rule.ruleId.length > 0, "Rule score missing rule ID.");
  assert(typeof rule.maxPoints === "number" && rule.maxPoints > 0, `${rule.ruleId} must expose positive max points.`);
  assert(typeof rule.included === "boolean", `${rule.ruleId} must expose participation state.`);
  if (rule.included) {
    assert(rule.exclusionReason === null, `${rule.ruleId} included result must not have exclusion reason.`);
    assert(typeof rule.multiplier === "number", `${rule.ruleId} included result must expose multiplier.`);
  } else {
    assert(typeof rule.exclusionReason === "string" && rule.exclusionReason.length > 0, `${rule.ruleId} excluded result must explain why.`);
    assert(rule.multiplier === null, `${rule.ruleId} excluded result must not expose scoring multiplier.`);
  }
}
console.log("✓ Every included/excluded rule remains individually explainable");

const historicalResponse = await fetch(`${baseUrl}/api/websites/score/${encodeURIComponent(result.scoringRunId)}`);
const historical = await historicalResponse.json();
assert(historicalResponse.ok && historical.ok === true, "Historical scoring lookup failed.");
assert(historical.run?.id === result.scoringRunId, "Historical lookup returned a different scoring run.");
assert(historical.run?.analyzer_version === result.analyzerVersion, "Persisted analyzer version does not match live result.");
assert(historical.run?.scoring_model_version === scoring.scoringModelVersion, "Persisted scoring-model version does not match live result.");
assert(Array.isArray(historical.categories) && historical.categories.length === 6, "Expected six persisted category snapshots.");
assert(Array.isArray(historical.run?.explanation?.ruleScores) && historical.run.explanation.ruleScores.length === 140, "Persisted explanation must preserve all 140 rule scores.");
console.log("✓ Immutable historical persistence preserves versions, six categories, and all 140 rule explanations");

console.log("\nPhase 7 Website Scoring completion review passed.\n");
