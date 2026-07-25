import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";

const root = process.cwd();
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "teqqi-phase7-website-score-"));

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

function categoryResult(category, score) {
  return {
    category,
    score,
    available: score !== null,
    earnedPoints: score ?? 0,
    availablePoints: score === null ? 0 : 100,
    configuredRuleCount: 1,
    providedFindingCount: 1,
    includedRuleCount: score === null ? 0 : 1,
    excludedRuleCount: score === null ? 1 : 0,
    ruleScores: [],
  };
}

const categories = [
  "TECHNICAL_HEALTH",
  "SEO",
  "PERFORMANCE",
  "ACCESSIBILITY",
  "CONVERSION_UX",
  "CONTENT_QUALITY",
];

try {
  transpile("lib/website-scoring/types.ts", "types.js");
  transpile("lib/website-scoring/config.ts", "config.js");
  transpile("lib/website-scoring/rule-score.ts", "rule-score.js");
  transpile("lib/website-scoring/website-score.ts", "website-score.js");

  const require = createRequire(import.meta.url);
  const { calculateWebsiteScore } = require(path.join(tempDir, "website-score.js"));
  const { WebsiteScoringError } = require(path.join(tempDir, "rule-score.js"));

  console.log("\nTEQQI OS Phase 7 — Overall Website Score smoke test\n");

  const all100 = calculateWebsiteScore(categories.map((category) => categoryResult(category, 100)));
  assert(all100.available && all100.score === 100, "All-100 categories should produce Website Score 100.");
  assert(Math.abs(all100.measuredWeightedTotal - 100) < 1e-12, "All-100 weighted total should equal 100.");
  console.log("✓ All-100 category scores produce Website Score 100");

  const all0 = calculateWebsiteScore(categories.map((category) => categoryResult(category, 0)));
  assert(all0.available && all0.score === 0, "All-0 categories should produce Website Score 0.");
  console.log("✓ All-0 category scores produce Website Score 0");

  const mixedInput = [
    categoryResult("TECHNICAL_HEALTH", 80),
    categoryResult("SEO", 70),
    categoryResult("PERFORMANCE", 60),
    categoryResult("ACCESSIBILITY", 90),
    categoryResult("CONVERSION_UX", 75),
    categoryResult("CONTENT_QUALITY", 85),
  ];
  const mixed = calculateWebsiteScore(mixedInput);
  assert(Math.abs(mixed.score - 76.75) < 1e-12, `Expected mixed Website Score 76.75, received ${mixed.score}.`);
  const contributionTotal = mixed.categories.reduce((sum, item) => sum + (item.weightedContribution ?? 0), 0);
  assert(Math.abs(contributionTotal - mixed.score) < 1e-12, "Weighted contributions must reconcile to Website Score.");
  console.log("✓ Approved six-category weighting formula produces 76.75 for the reference fixture");

  const missing = calculateWebsiteScore([
    categoryResult("TECHNICAL_HEALTH", 80),
    categoryResult("SEO", 70),
    categoryResult("PERFORMANCE", null),
    categoryResult("ACCESSIBILITY", 90),
    categoryResult("CONVERSION_UX", 75),
    categoryResult("CONTENT_QUALITY", 85),
  ]);
  assert(!missing.available && missing.score === null, "Unavailable category evidence must make the overall Website Score unavailable.");
  assert(missing.unavailableCategories.length === 1 && missing.unavailableCategories[0] === "PERFORMANCE", "Unavailable category should be reported explicitly.");
  assert(Math.abs(missing.measuredWeight - 0.82) < 1e-12, `Expected measured weight 0.82, received ${missing.measuredWeight}.`);
  assert(Math.abs(missing.missingWeight - 0.18) < 1e-12, `Expected missing weight 0.18, received ${missing.missingWeight}.`);
  console.log("✓ Missing category evidence is explicit and is not silently treated as zero or reweighted");

  let missingCategoryRejected = false;
  try {
    calculateWebsiteScore(categories.slice(0, 5).map((category) => categoryResult(category, 100)));
  } catch (error) {
    missingCategoryRejected = error instanceof WebsiteScoringError;
  }
  assert(missingCategoryRejected, "Missing category input must be rejected.");

  let duplicateCategoryRejected = false;
  try {
    calculateWebsiteScore([
      ...categories.map((category) => categoryResult(category, 100)),
      categoryResult("SEO", 100),
    ]);
  } catch (error) {
    duplicateCategoryRejected = error instanceof WebsiteScoringError;
  }
  assert(duplicateCategoryRejected, "Duplicate category input must be rejected.");
  console.log("✓ Missing and duplicate category inputs are rejected");

  let outOfRangeRejected = false;
  try {
    calculateWebsiteScore([
      categoryResult("TECHNICAL_HEALTH", 101),
      ...categories.slice(1).map((category) => categoryResult(category, 100)),
    ]);
  } catch (error) {
    outOfRangeRejected = error instanceof WebsiteScoringError;
  }
  assert(outOfRangeRejected, "Category scores above 100 must be rejected.");
  console.log("✓ Invalid category score bounds are rejected");

  assert(mixed.scoringModelVersion === "1.0.0", "Website score must expose scoring model version.");
  assert(mixed.categories.length === 6, "Website score explanation must include all six category contributions.");
  console.log("✓ Score explanation exposes model version and six weighted contributions");

  console.log("\nPhase 7 overall Website Score smoke test passed.\n");
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
