import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const root = process.cwd();
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "teqqi-phase7-unified-"));

async function compile(relativePath) {
  const sourcePath = path.join(root, relativePath);
  const source = await fs.readFile(sourcePath, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: sourcePath,
  }).outputText;
  const outPath = path.join(tempDir, path.basename(relativePath).replace(/\.ts$/, ".mjs"));
  await fs.writeFile(outPath, output.replaceAll('from "./', 'from "./').replaceAll('";', '.mjs";'));
  return outPath;
}

for (const file of ["config.ts", "rule-score.ts", "category-score.ts", "website-score.ts", "critical-caps.ts", "service.ts"]) {
  await compile(`lib/website-scoring/${file}`);
}

const config = await import(pathToFileURL(path.join(tempDir, "config.mjs")));
const { scoreWebsite } = await import(pathToFileURL(path.join(tempDir, "service.mjs")));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function finding(rule, status = "PASS", confidence = "HIGH") {
  return {
    ruleId: rule.ruleId,
    category: rule.category,
    status,
    confidence,
    applicable: status !== "NOT_APPLICABLE",
  };
}

function fullInput(status = "PASS") {
  const input = {};
  for (const category of Object.keys(config.CATEGORY_WEIGHTS)) {
    input[category] = config.SCORING_RULES.filter((rule) => rule.category === category).map((rule) => finding(rule, status));
  }
  return input;
}

console.log("\nTEQQI OS Phase 7 — Unified Scoring Service smoke test\n");

const perfect = scoreWebsite(fullInput("PASS"));
assert(perfect.websiteScore === 100, "All-pass fixture should produce 100.");
assert(perfect.uncappedWebsiteScore === 100, "All-pass uncapped score should be 100.");
assert(perfect.ruleScores.length === 140, "Expected all 140 rule contributions.");
assert(perfect.categoryScores.length === 6, "Expected six category explanations.");
assert(perfect.weightedCategories.length === 6, "Expected six weighted contributions.");
assert(perfect.criticalFailureCount === 0 && perfect.appliedCriticalCap === null, "Perfect fixture should not trigger a cap.");
console.log("✓ All 140 findings flow through one service to a perfect Website Score of 100");

const failed = scoreWebsite(fullInput("FAIL"));
assert(failed.uncappedWebsiteScore === 0 && failed.websiteScore === 0, "All-fail fixture should remain 0.");
assert(failed.criticalFailureCount === config.CRITICAL_FAILURE_RULE_IDS.length, "All-fail fixture should expose all configured critical failures.");
assert(failed.appliedCriticalCap === 40, "Three-plus critical failures should expose cap 40.");
assert(failed.capApplied === false, "A score already below the cap should not be lowered further.");
console.log("✓ Critical failures are integrated without changing a score already below its cap");

const cappedInput = fullInput("PASS");
for (const id of config.CRITICAL_FAILURE_RULE_IDS.slice(0, 2)) {
  const rule = config.SCORING_RULE_BY_ID.get(id);
  const index = cappedInput[rule.category].findIndex((item) => item.ruleId === id);
  cappedInput[rule.category][index] = finding(rule, "FAIL");
}
const capped = scoreWebsite(cappedInput);
assert(capped.appliedCriticalCap === 60, "Two critical failures should select cap 60.");
assert(capped.websiteScore === 60 && capped.capApplied, "High uncapped score should be capped at 60.");
assert(capped.uncappedWebsiteScore > capped.websiteScore, "Unified result must preserve uncapped score.");
console.log("✓ Unified service applies critical caps after normal weighted scoring");

const unavailableInput = fullInput("PASS");
unavailableInput.PERFORMANCE = unavailableInput.PERFORMANCE.map((item) => ({ ...item, status: "UNKNOWN" }));
const unavailable = scoreWebsite(unavailableInput);
assert(unavailable.websiteScore === null && !unavailable.scoreAvailable, "Unavailable category must make final score unavailable.");
assert(unavailable.unavailableCategories.includes("PERFORMANCE"), "Performance should be identified as unavailable.");
assert(unavailable.categoryScores.find((item) => item.category === "PERFORMANCE")?.score === null, "Performance explanation should preserve null score.");
console.log("✓ Missing evidence remains explicit through the complete scoring pipeline");

const mixedInput = fullInput("PASS");
const seoRules = config.SCORING_RULES.filter((rule) => rule.category === "SEO");
mixedInput.SEO[0] = finding(seoRules[0], "WARNING");
mixedInput.SEO[1] = finding(seoRules[1], "UNKNOWN");
mixedInput.SEO[2] = finding(seoRules[2], "FAIL");
const mixed = scoreWebsite(mixedInput);
const seo = mixed.categoryScores.find((item) => item.category === "SEO");
assert(seo.excludedRuleCount === 1, "SEO UNKNOWN finding should remain excluded.");
assert(mixed.ruleScores.some((item) => item.ruleId === seoRules[1].ruleId && item.exclusionReason === "UNKNOWN"), "Rule-level exclusion reason should survive unified scoring.");
console.log("✓ Rule-level contributions and exclusion reasons remain explainable end to end");

let missingRejected = false;
try {
  const input = fullInput("PASS");
  delete input.CONTENT_QUALITY;
  scoreWebsite(input);
} catch {
  missingRejected = true;
}
assert(missingRejected, "Missing category input should be rejected.");
console.log("✓ Missing category input is rejected rather than silently scored");

assert(perfect.scoringModelVersion === config.SCORING_MODEL_VERSION, "Unified result must expose scoring model version.");
assert(perfect.measuredWeight === 1 && perfect.missingWeight === 0, "Perfect fixture should reconcile full category weight.");
assert(perfect.measuredWeightedTotal === perfect.uncappedWebsiteScore, "Weighted total should reconcile with uncapped score.");
console.log("✓ Unified explanation reconciles model version, category weights, uncapped score, cap, and final score");

console.log("\nPhase 7 unified scoring service smoke test passed.\n");
