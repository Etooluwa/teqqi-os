import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";

const root = process.cwd();
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "teqqi-phase7-caps-"));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function transpile(sourcePath, outputName) {
  const source = fs.readFileSync(path.join(root, sourcePath), "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    fileName: sourcePath,
  }).outputText;
  fs.writeFileSync(path.join(tempDir, outputName), output);
}

function websiteScore(score) {
  const available = score !== null;
  return {
    scoringModelVersion: "1.0.0",
    score,
    available,
    measuredWeight: available ? 1 : 0.75,
    missingWeight: available ? 0 : 0.25,
    measuredWeightedTotal: score ?? 68,
    categories: [],
    unavailableCategories: available ? [] : ["TECHNICAL_HEALTH"],
  };
}

try {
  transpile("lib/website-scoring/types.ts", "types.js");
  transpile("lib/website-scoring/config.ts", "config.js");
  transpile("lib/website-scoring/rule-score.ts", "rule-score.js");
  transpile("lib/website-scoring/critical-caps.ts", "critical-caps.js");

  const require = createRequire(import.meta.url);
  const config = require(path.join(tempDir, "config.js"));
  const { scoreFinding, WebsiteScoringError } = require(path.join(tempDir, "rule-score.js"));
  const { applyCriticalFailureCaps } = require(path.join(tempDir, "critical-caps.js"));

  console.log("\nTEQQI OS Phase 7 — Critical Failure Caps smoke test\n");

  const criticalIds = config.CRITICAL_FAILURE_RULE_IDS;
  assert(criticalIds.length >= 3, "At least three approved critical rules are required to exercise the cap ladder.");
  assert(new Set(criticalIds).size === criticalIds.length, "Critical rule IDs must be unique.");
  assert(criticalIds.every((id) => config.SCORING_RULE_BY_ID.get(id)?.category === "TECHNICAL_HEALTH"), "Critical rules must be configured Technical Health rules.");

  function scored(ruleId, status = "PASS", confidence = "HIGH") {
    const rule = config.SCORING_RULE_BY_ID.get(ruleId);
    assert(rule, `Missing scoring rule ${ruleId}.`);
    return scoreFinding({
      ruleId,
      category: rule.category,
      status,
      confidence,
      applicable: true,
    });
  }

  const noCap = applyCriticalFailureCaps(websiteScore(95), [
    scored(criticalIds[0], "PASS"),
    scored("TECH-003", "FAIL"),
  ]);
  assert(noCap.criticalFailureCount === 0, "Noncritical failures must not trigger a cap.");
  assert(noCap.applicableCriticalCap === null && noCap.finalWebsiteScore === 95 && !noCap.capApplied, "Zero critical failures must preserve the uncapped score.");
  console.log("✓ Zero qualifying critical failures apply no cap");

  const one = applyCriticalFailureCaps(websiteScore(95), [scored(criticalIds[0], "FAIL")]);
  assert(one.criticalFailureCount === 1, "One critical failure should be counted once.");
  assert(one.applicableCriticalCap === 80 && one.finalWebsiteScore === 80 && one.capApplied, "One critical failure must cap a 95 score at 80.");
  assert(one.criticalFailures[0].ruleId === criticalIds[0], "Critical trigger explanation must preserve the rule ID.");
  console.log("✓ One qualifying critical failure caps the Website Score at 80");

  const two = applyCriticalFailureCaps(websiteScore(95), [
    scored(criticalIds[0], "FAIL"),
    scored(criticalIds[1], "FAIL", "MEDIUM"),
  ]);
  assert(two.criticalFailureCount === 2 && two.applicableCriticalCap === 60 && two.finalWebsiteScore === 60, "Two critical failures must cap at 60.");
  console.log("✓ Two qualifying critical failures cap the Website Score at 60");

  const three = applyCriticalFailureCaps(websiteScore(95), [
    scored(criticalIds[0], "FAIL"),
    scored(criticalIds[1], "FAIL"),
    scored(criticalIds[2], "FAIL"),
  ]);
  assert(three.criticalFailureCount === 3 && three.applicableCriticalCap === 40 && three.finalWebsiteScore === 40, "Three critical failures must cap at 40.");
  console.log("✓ Three or more qualifying critical failures cap the Website Score at 40");

  const belowCap = applyCriticalFailureCaps(websiteScore(55), [scored(criticalIds[0], "FAIL")]);
  assert(belowCap.applicableCriticalCap === 80, "One failure should still expose the applicable 80 cap.");
  assert(belowCap.finalWebsiteScore === 55 && !belowCap.capApplied, "A score already below its cap must remain unchanged.");
  console.log("✓ A Website Score already below the applicable cap remains unchanged");

  const unavailable = applyCriticalFailureCaps(websiteScore(null), [scored(criticalIds[0], "FAIL")]);
  assert(unavailable.criticalFailureCount === 1 && unavailable.applicableCriticalCap === 80, "Critical failures should remain explainable when the overall score is unavailable.");
  assert(unavailable.uncappedWebsiteScore === null && unavailable.finalWebsiteScore === null && !unavailable.scoreAvailable && !unavailable.capApplied, "Caps must not manufacture a score when the overall score is unavailable.");
  console.log("✓ Unavailable overall score remains unavailable while cap evidence stays explicit");

  const excludedCritical = applyCriticalFailureCaps(websiteScore(95), [
    scored(criticalIds[0], "FAIL", "LOW"),
    scored(criticalIds[1], "WARNING", "HIGH"),
  ]);
  assert(excludedCritical.criticalFailureCount === 0 && excludedCritical.finalWebsiteScore === 95, "LOW-confidence or non-FAIL critical findings must not trigger a cap.");
  console.log("✓ Only included HIGH/MEDIUM-confidence FAIL findings trigger critical caps");

  let duplicateRejected = false;
  const duplicate = scored(criticalIds[0], "FAIL");
  try {
    applyCriticalFailureCaps(websiteScore(95), [duplicate, duplicate]);
  } catch (error) {
    duplicateRejected = error instanceof WebsiteScoringError;
  }
  assert(duplicateRejected, "Duplicate critical rule scores must be rejected rather than double-counted.");
  console.log("✓ Duplicate critical triggers cannot be double-counted");

  const explanation = applyCriticalFailureCaps(websiteScore(91.25), [
    scored(criticalIds[0], "FAIL"),
    scored(criticalIds[1], "FAIL"),
  ]);
  assert(explanation.uncappedWebsiteScore === 91.25, "Result must preserve the uncapped Website Score.");
  assert(explanation.finalWebsiteScore === 60 && explanation.applicableCriticalCap === 60, "Final score must reconcile with the applicable cap.");
  assert(explanation.criticalFailures.length === explanation.criticalFailureCount, "Critical failure explanation count must reconcile.");
  assert(explanation.scoringModelVersion === "1.0.0", "Critical-cap result must preserve the scoring model version.");
  console.log("✓ Critical-cap explanation reconciles uncapped score, triggers, cap, and final score");

  console.log("\nPhase 7 critical failure caps smoke test passed.\n");
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}