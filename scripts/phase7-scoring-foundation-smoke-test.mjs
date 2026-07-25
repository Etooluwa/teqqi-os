import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";

const root = process.cwd();
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "teqqi-phase7-scoring-"));

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

function expectedIds(prefix, count) {
  return Array.from({ length: count }, (_, index) => `${prefix}-${String(index + 1).padStart(3, "0")}`);
}

try {
  transpile("lib/website-scoring/types.ts", "types.js");
  transpile("lib/website-scoring/config.ts", "config.js");
  transpile("lib/website-scoring/rule-score.ts", "rule-score.js");

  const require = createRequire(import.meta.url);
  const config = require(path.join(tempDir, "config.js"));
  const { scoreFinding, WebsiteScoringError } = require(path.join(tempDir, "rule-score.js"));

  console.log("\nTEQQI OS Phase 7 — Scoring Foundation smoke test\n");

  assert(config.SCORING_MODEL_VERSION === "1.0.0", "Expected scoring model version 1.0.0.");
  assert(config.SCORING_RULES.length === 140, `Expected 140 scoring rules, received ${config.SCORING_RULES.length}.`);

  const expectedByCategory = {
    TECHNICAL_HEALTH: expectedIds("TECH", 38),
    SEO: expectedIds("SEO", 24),
    PERFORMANCE: expectedIds("PERF", 16),
    ACCESSIBILITY: expectedIds("A11Y", 22),
    CONVERSION_UX: expectedIds("CUX", 22),
    CONTENT_QUALITY: expectedIds("CONTENT", 18),
  };

  const ids = config.SCORING_RULES.map((rule) => rule.ruleId);
  assert(new Set(ids).size === 140, "Expected all scoring rule IDs to be unique.");

  for (const [category, expected] of Object.entries(expectedByCategory)) {
    const actual = config.SCORING_RULES.filter((rule) => rule.category === category).map((rule) => rule.ruleId);
    assert(actual.length === expected.length, `${category}: expected ${expected.length} configured rules, received ${actual.length}.`);
    assert(actual.every((id, index) => id === expected[index]), `${category}: configured rule IDs are incomplete or out of order.`);
  }

  assert(config.SCORING_RULES.every((rule) => Number.isFinite(rule.maxPoints) && rule.maxPoints > 0), "Every configured rule must have positive max points.");
  const weightTotal = Object.values(config.CATEGORY_WEIGHTS).reduce((sum, weight) => sum + weight, 0);
  assert(Math.abs(weightTotal - 1) < 1e-12, `Category weights must total 1.0; received ${weightTotal}.`);
  assert(config.CATEGORY_WEIGHTS.TECHNICAL_HEALTH === 0.25, "Technical Health weight must be 25%.");
  assert(config.CATEGORY_WEIGHTS.SEO === 0.1, "SEO weight must be 10%.");
  assert(config.CATEGORY_WEIGHTS.PERFORMANCE === 0.18, "Performance weight must be 18%.");
  assert(config.CATEGORY_WEIGHTS.ACCESSIBILITY === 0.18, "Accessibility weight must be 18%.");
  assert(config.CATEGORY_WEIGHTS.CONVERSION_UX === 0.19, "Conversion/UX weight must be 19%.");
  assert(config.CATEGORY_WEIGHTS.CONTENT_QUALITY === 0.1, "Content Quality weight must be 10%.");

  const tech001 = { ruleId: "TECH-001", category: "TECHNICAL_HEALTH", confidence: "HIGH", applicable: true };
  const pass = scoreFinding({ ...tech001, status: "PASS" });
  assert(pass.included && pass.maxPoints === 5 && pass.multiplier === 1 && pass.earnedPoints === 5, "PASS must earn 100% of max points.");

  const warning = scoreFinding({ ...tech001, status: "WARNING" });
  assert(warning.included && warning.multiplier === 0.5 && warning.earnedPoints === 2.5, "WARNING must earn 50% of max points.");

  const fail = scoreFinding({ ...tech001, status: "FAIL" });
  assert(fail.included && fail.multiplier === 0 && fail.earnedPoints === 0, "FAIL must earn 0% while remaining in the denominator.");

  const unknown = scoreFinding({ ...tech001, status: "UNKNOWN" });
  assert(!unknown.included && unknown.multiplier === null && unknown.exclusionReason === "UNKNOWN", "UNKNOWN must be excluded.");

  const notApplicable = scoreFinding({ ...tech001, status: "NOT_APPLICABLE", applicable: false });
  assert(!notApplicable.included && notApplicable.exclusionReason === "NOT_APPLICABLE", "NOT_APPLICABLE must be excluded.");

  const lowConfidence = scoreFinding({ ...tech001, status: "PASS", confidence: "LOW" });
  assert(!lowConfidence.included && lowConfidence.exclusionReason === "LOW_CONFIDENCE", "LOW confidence must be excluded.");

  const mediumConfidence = scoreFinding({ ...tech001, status: "WARNING", confidence: "MEDIUM" });
  assert(mediumConfidence.included && mediumConfidence.earnedPoints === 2.5, "MEDIUM confidence must participate in scoring.");

  assert(config.CRITICAL_CAP_THRESHOLDS.length === 3, "Expected three critical-cap thresholds.");
  assert(config.CRITICAL_CAP_THRESHOLDS[0].minimumFailures === 3 && config.CRITICAL_CAP_THRESHOLDS[0].maximumWebsiteScore === 40, "Three critical failures must cap at 40.");
  assert(config.CRITICAL_CAP_THRESHOLDS[1].minimumFailures === 2 && config.CRITICAL_CAP_THRESHOLDS[1].maximumWebsiteScore === 60, "Two critical failures must cap at 60.");
  assert(config.CRITICAL_CAP_THRESHOLDS[2].minimumFailures === 1 && config.CRITICAL_CAP_THRESHOLDS[2].maximumWebsiteScore === 80, "One critical failure must cap at 80.");

  let unknownRuleRejected = false;
  try {
    scoreFinding({ ruleId: "TECH-999", category: "TECHNICAL_HEALTH", status: "PASS", confidence: "HIGH", applicable: true });
  } catch (error) {
    unknownRuleRejected = error instanceof WebsiteScoringError;
  }
  assert(unknownRuleRejected, "Unknown rule IDs must be rejected.");

  let categoryMismatchRejected = false;
  try {
    scoreFinding({ ruleId: "TECH-001", category: "SEO", status: "PASS", confidence: "HIGH", applicable: true });
  } catch (error) {
    categoryMismatchRejected = error instanceof WebsiteScoringError;
  }
  assert(categoryMismatchRejected, "Rule/category mismatches must be rejected.");

  let applicabilityMismatchRejected = false;
  try {
    scoreFinding({ ruleId: "TECH-001", category: "TECHNICAL_HEALTH", status: "PASS", confidence: "HIGH", applicable: false });
  } catch (error) {
    applicabilityMismatchRejected = error instanceof WebsiteScoringError;
  }
  assert(applicabilityMismatchRejected, "Inconsistent applicable/status values must be rejected.");

  console.log("✓ 140 scoring rules are configured, unique, complete, and ordered");
  console.log("✓ Six category counts match Phase 6: 38 / 24 / 16 / 22 / 22 / 18");
  console.log("✓ Category weights total 100% and match the approved model");
  console.log("✓ Every rule has a positive configured max-point value");
  console.log("✓ PASS / WARNING / FAIL rule scoring is deterministic");
  console.log("✓ UNKNOWN / NOT_APPLICABLE / LOW confidence are excluded correctly");
  console.log("✓ HIGH and MEDIUM confidence participate correctly");
  console.log("✓ Invalid rule/category/applicability contracts are rejected");
  console.log("✓ Critical-cap ladder is configured as 80 / 60 / 40");
  console.log("\nPhase 7 scoring foundation smoke test passed.\n");
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
