const TARGET = process.env.TEQQI_APP_URL ?? "http://localhost:3000";
const assert = (condition, message) => { if (!condition) throw new Error(message); };

console.log("\nTEQQI OS Phase 10 — Score Breakdown smoke test");
console.log(`Target app: ${TARGET}\n`);

const dashboardResponse = await fetch(`${TARGET}/api/dashboard`);
const dashboardBody = await dashboardResponse.json();
assert(dashboardResponse.ok && dashboardBody.ok === true, `Dashboard API failed: ${JSON.stringify(dashboardBody)}`);

const candidate = dashboardBody.dashboard.rankedBusinesses.find((row) => row.intelligenceAvailable)
  ?? dashboardBody.dashboard.rankedBusinesses[0];
assert(candidate?.externalId, "A discovered business is required for the Phase 10 score breakdown test.");

const response = await fetch(`${TARGET}/api/businesses/${encodeURIComponent(candidate.externalId)}`);
const body = await response.json();
assert(response.ok && body.ok === true, `Business detail API failed: ${JSON.stringify(body)}`);
const detail = body.detail;
assert(detail, "Business detail API must return detail.");
const breakdown = detail.intelligence.scoreBreakdown;

assert(breakdown && typeof breakdown.available === "boolean", "Business detail must expose an explicit scoreBreakdown contract.");
assert(Array.isArray(breakdown.categories), "scoreBreakdown.categories must be an array.");
assert(typeof breakdown.ruleCount === "number" && typeof breakdown.includedRuleCount === "number" && typeof breakdown.excludedRuleCount === "number", "Score breakdown must expose rule totals.");
console.log("✓ Business detail exposes a deterministic score-breakdown contract");

if (detail.intelligence.scoringRun) {
  assert(breakdown.scoringModelVersion === detail.intelligence.scoringRun.scoringModelVersion, "Score breakdown version must match the persisted scoring run.");
  assert(breakdown.categories.length === 6, "A completed scoring run must expose all six scoring categories.");
  assert(breakdown.ruleCount === 140, `Completed scoring breakdown must expose all 140 rules; received ${breakdown.ruleCount}.`);
  assert(breakdown.includedRuleCount + breakdown.excludedRuleCount === breakdown.ruleCount, "Included and excluded rule totals must reconcile.");
  console.log("✓ All six categories and all 140 configured scoring rules remain traceable");

  const weightedTotal = breakdown.categories
    .filter((category) => category.weightedContribution !== null)
    .reduce((sum, category) => sum + category.weightedContribution, 0);
  assert(Math.abs(weightedTotal - breakdown.measuredWeightedTotal) < 0.02, "Weighted category contributions must reconcile with the measured weighted total.");
  assert(Math.abs((breakdown.measuredWeight + breakdown.missingWeight) - 1) < 0.02, "Measured and missing weights must total 1.0.");
  console.log("✓ Category weights, weighted contributions, and missing-data behavior reconcile");

  for (const category of breakdown.categories) {
    assert(category.includedRuleCount + category.excludedRuleCount === category.ruleScores.length, `${category.category} included/excluded rule counts must reconcile.`);
    assert(category.ruleScores.length === category.configuredRuleCount, `${category.category} must expose its configured scoring rules.`);
    if (category.available) {
      assert(category.score !== null && category.score >= 0 && category.score <= 100, `${category.category} available score must be between 0 and 100.`);
    } else {
      assert(category.score === null, `${category.category} unavailable score must remain null.`);
    }
  }
  console.log("✓ Every category explains score availability, points, inclusion, exclusion, and rule contributions");

  assert(breakdown.criticalFailureCount === breakdown.criticalFailures.length, "Critical-failure count must reconcile with its triggers.");
  if (breakdown.capApplied) {
    assert(breakdown.appliedCriticalCap !== null, "A cap-applied score must expose the applied critical cap.");
    assert(breakdown.websiteScore <= breakdown.appliedCriticalCap, "Final Website Score must respect the applied critical cap.");
  }
  console.log("✓ Critical-failure caps and uncapped/final Website Score context remain explicit");
} else {
  assert(breakdown.available === false, "A business with no completed scoring run must expose an unavailable score breakdown.");
  assert(breakdown.unavailableReason === "NO_COMPLETED_SCORING_RUN", "Missing scoring intelligence must have an explicit reason.");
  assert(breakdown.categories.length === 0, "Missing scoring intelligence must not fabricate category scores.");
  console.log("✓ Missing scoring intelligence remains explicit and does not fabricate category scores");
}

assert(detail.leadScore.available === false && detail.leadScore.score === null, "Score breakdown must not fabricate a commercial Lead Score.");
console.log("✓ Website scoring remains separate from deferred business-level Lead Scoring");

console.log("\nPhase 10 Score Breakdown smoke test passed.\n");
