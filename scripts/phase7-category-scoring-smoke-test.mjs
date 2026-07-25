import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";

const root = process.cwd();
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "teqqi-phase7-category-"));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function close(actual, expected, tolerance = 1e-10) {
  return Math.abs(actual - expected) <= tolerance;
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

function finding(ruleId, category, status = "PASS", confidence = "HIGH", applicable = true) {
  return { ruleId, category, status, confidence, applicable };
}

try {
  transpile("lib/website-scoring/types.ts", "types.js");
  transpile("lib/website-scoring/config.ts", "config.js");
  transpile("lib/website-scoring/rule-score.ts", "rule-score.js");
  transpile("lib/website-scoring/category-score.ts", "category-score.js");

  const require = createRequire(import.meta.url);
  const config = require(path.join(tempDir, "config.js"));
  const { WebsiteScoringError } = require(path.join(tempDir, "rule-score.js"));
  const { scoreCategory } = require(path.join(tempDir, "category-score.js"));

  console.log("\nTEQQI OS Phase 7 — Category Scoring smoke test\n");

  const categorySpecs = [
    ["TECHNICAL_HEALTH", "TECH", 38],
    ["SEO", "SEO", 24],
    ["PERFORMANCE", "PERF", 16],
    ["ACCESSIBILITY", "A11Y", 22],
    ["CONVERSION_UX", "CUX", 22],
    ["CONTENT_QUALITY", "CONTENT", 18],
  ];

  for (const [category, prefix, count] of categorySpecs) {
    const allPass = Array.from({ length: count }, (_, i) => finding(`${prefix}-${String(i + 1).padStart(3, "0")}`, category));
    const result = scoreCategory(category, allPass);
    assert(result.available && close(result.score, 100), `${category}: all-pass score should be 100.`);
    assert(result.includedRuleCount === count && result.excludedRuleCount === 0, `${category}: all-pass counts are wrong.`);
    assert(result.configuredRuleCount === count, `${category}: configured rule count is wrong.`);
  }
  console.log("✓ All six categories normalize an all-pass fixture to 100");

  const allFail = [
    finding("TECH-001", "TECHNICAL_HEALTH", "FAIL"),
    finding("TECH-002", "TECHNICAL_HEALTH", "FAIL"),
  ];
  const failResult = scoreCategory("TECHNICAL_HEALTH", allFail);
  assert(failResult.available && close(failResult.score, 0), "All-fail eligible rules should score 0.");
  assert(failResult.availablePoints === 10 && failResult.earnedPoints === 0, "All-fail denominator should retain eligible max points.");
  console.log("✓ Eligible FAIL findings remain in the denominator and produce 0");

  const warningResult = scoreCategory("TECHNICAL_HEALTH", [finding("TECH-001", "TECHNICAL_HEALTH", "WARNING")]);
  assert(warningResult.available && close(warningResult.score, 50), "A single WARNING should normalize to 50.");
  assert(warningResult.earnedPoints === 2.5 && warningResult.availablePoints === 5, "WARNING point explanation is incorrect.");
  console.log("✓ WARNING contributes 50% of eligible rule points");

  const mixed = scoreCategory("TECHNICAL_HEALTH", [
    finding("TECH-001", "TECHNICAL_HEALTH", "PASS"),
    finding("TECH-002", "TECHNICAL_HEALTH", "WARNING"),
    finding("TECH-003", "TECHNICAL_HEALTH", "FAIL"),
  ]);
  assert(mixed.available && close(mixed.score, 50), `Mixed category expected 50, received ${mixed.score}.`);
  assert(mixed.earnedPoints === 7.5 && mixed.availablePoints === 15, "Mixed score points do not reconcile.");
  console.log("✓ Mixed PASS/WARNING/FAIL findings calculate deterministically");

  const exclusions = scoreCategory("TECHNICAL_HEALTH", [
    finding("TECH-001", "TECHNICAL_HEALTH", "PASS"),
    finding("TECH-002", "TECHNICAL_HEALTH", "UNKNOWN"),
    finding("TECH-003", "TECHNICAL_HEALTH", "NOT_APPLICABLE", "HIGH", false),
    finding("TECH-004", "TECHNICAL_HEALTH", "FAIL", "LOW"),
  ]);
  assert(exclusions.available && close(exclusions.score, 100), "Excluded rules must not dilute the denominator.");
  assert(exclusions.availablePoints === 5 && exclusions.earnedPoints === 5, "Excluded-rule denominator normalization is wrong.");
  assert(exclusions.includedRuleCount === 1 && exclusions.excludedRuleCount === 3, "Excluded-rule counts are wrong.");
  assert(exclusions.ruleScores.filter((r) => !r.included).every((r) => r.exclusionReason), "Every excluded rule needs an exclusion reason.");
  console.log("✓ UNKNOWN / NOT_APPLICABLE / LOW confidence do not affect the denominator");

  const noEvidence = scoreCategory("SEO", [
    finding("SEO-001", "SEO", "UNKNOWN"),
    finding("SEO-002", "SEO", "PASS", "LOW"),
    finding("SEO-003", "SEO", "NOT_APPLICABLE", "HIGH", false),
  ]);
  assert(!noEvidence.available && noEvidence.score === null, "Zero eligible evidence must return an unavailable/null category score.");
  assert(noEvidence.availablePoints === 0 && noEvidence.includedRuleCount === 0, "Zero-evidence explanation is incorrect.");
  console.log("✓ Zero eligible evidence returns an explicit unavailable/null score");

  const empty = scoreCategory("CONTENT_QUALITY", []);
  assert(!empty.available && empty.score === null && empty.providedFindingCount === 0, "Empty category input must be explicitly unavailable.");
  console.log("✓ Empty category input is handled as missing evidence, not failure");

  let mismatchRejected = false;
  try {
    scoreCategory("SEO", [finding("TECH-001", "TECHNICAL_HEALTH")]);
  } catch (error) {
    mismatchRejected = error instanceof WebsiteScoringError;
  }
  assert(mismatchRejected, "Category-mismatched findings must be rejected.");

  let duplicateRejected = false;
  try {
    scoreCategory("SEO", [finding("SEO-001", "SEO"), finding("SEO-001", "SEO")]);
  } catch (error) {
    duplicateRejected = error instanceof WebsiteScoringError;
  }
  assert(duplicateRejected, "Duplicate category findings must be rejected.");
  console.log("✓ Invalid category and duplicate-finding inputs are rejected");

  const techConfiguredTotal = config.SCORING_RULES.filter((r) => r.category === "TECHNICAL_HEALTH").reduce((sum, r) => sum + r.maxPoints, 0);
  const allTechPass = Array.from({ length: 38 }, (_, i) => finding(`TECH-${String(i + 1).padStart(3, "0")}`, "TECHNICAL_HEALTH"));
  const fullTech = scoreCategory("TECHNICAL_HEALTH", allTechPass);
  assert(fullTech.availablePoints === techConfiguredTotal && fullTech.earnedPoints === techConfiguredTotal, "Full category explanation must reconcile to configured points.");
  assert(fullTech.ruleScores.length === 38, "Full category explanation must retain every rule contribution.");
  console.log("✓ Category explanation reconciles earned, available, included, excluded, and rule-level contributions");

  console.log("\nPhase 7 category scoring smoke test passed.\n");
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
