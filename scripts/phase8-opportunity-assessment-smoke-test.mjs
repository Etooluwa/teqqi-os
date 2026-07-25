import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const root = process.cwd();
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "teqqi-phase8-assessment-"));

async function compile(relativePath) {
  const sourcePath = path.join(root, relativePath);
  const source = await fs.readFile(sourcePath, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
    fileName: sourcePath,
  }).outputText;
  const outPath = path.join(tempDir, path.basename(relativePath).replace(/\.ts$/, ".mjs"));
  await fs.writeFile(
    outPath,
    output
      .replaceAll('from "./config"', 'from "./config.mjs"')
      .replaceAll('from "./detection"', 'from "./detection.mjs"')
      .replaceAll('from "./types"', 'from "./types.mjs"'),
  );
}

for (const file of ["types.ts", "config.ts", "detection.ts", "assessment.ts"]) {
  await compile(`lib/website-opportunities/${file}`);
}

const { assessOpportunityGroups } = await import(
  pathToFileURL(path.join(tempDir, "assessment.mjs"))
);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function group(overrides = {}) {
  return {
    groupId: "OPPORTUNITY_GROUP:SEO_IMPROVEMENT",
    type: "SEO_IMPROVEMENT",
    candidateIds: ["C1"],
    detectionRuleIds: ["DIRECT:SEO-001"],
    supportingFindingIds: ["SEO-001"],
    categories: ["SEO"],
    candidateCount: 1,
    failCount: 0,
    warningCount: 1,
    highConfidenceCount: 0,
    mediumConfidenceCount: 1,
    ...overrides,
  };
}

function scoring(overrides = {}) {
  return {
    websiteScore: 75,
    categoryScores: { SEO: 75 },
    criticalFailureCount: 0,
    scoringModelVersion: "1.0.0",
    ...overrides,
  };
}

console.log("\nTEQQI OS Phase 8 — Priority & Recommendation Confidence smoke test\n");

const low = assessOpportunityGroups([group()], scoring({ categoryScores: { SEO: 90 } }));
assert(low.assessments[0].priority === "LOW", "Single warning with strong category score should be LOW priority.");
assert(low.assessments[0].confidence === "LOW", "Single MEDIUM-confidence finding should be LOW recommendation confidence.");
console.log("✓ Weak isolated evidence remains LOW priority / LOW confidence");

const medium = assessOpportunityGroups([
  group({
    candidateIds: ["C1", "C2"],
    detectionRuleIds: ["DIRECT:SEO-001", "DIRECT:SEO-002"],
    supportingFindingIds: ["SEO-001", "SEO-002"],
    candidateCount: 2,
    failCount: 0,
    warningCount: 2,
    highConfidenceCount: 0,
    mediumConfidenceCount: 2,
  }),
], scoring({ categoryScores: { SEO: 75 } }));
assert(medium.assessments[0].priority === "MEDIUM", "Multiple warnings should reach MEDIUM priority.");
assert(medium.assessments[0].confidence === "MEDIUM", "Multiple MEDIUM-confidence findings should reach MEDIUM confidence.");
console.log("✓ Multiple warnings and consistent MEDIUM-confidence evidence produce MEDIUM assessment");

const high = assessOpportunityGroups([
  group({
    candidateIds: ["C1", "C2"],
    detectionRuleIds: ["DIRECT:SEO-001", "DIRECT:SEO-002"],
    supportingFindingIds: ["SEO-001", "SEO-002"],
    candidateCount: 2,
    failCount: 2,
    warningCount: 0,
    highConfidenceCount: 2,
    mediumConfidenceCount: 0,
  }),
], scoring({ categoryScores: { SEO: 70 } }));
assert(high.assessments[0].priority === "HIGH", "Two fails should reach HIGH priority.");
assert(high.assessments[0].confidence === "HIGH", "Two HIGH-confidence findings should reach HIGH confidence.");
console.log("✓ Multiple confirmed failures with strong evidence produce HIGH priority / HIGH confidence");

const criticalByConcentration = assessOpportunityGroups([
  group({
    candidateIds: ["C1", "C2", "C3"],
    detectionRuleIds: ["D1", "D2", "D3"],
    supportingFindingIds: ["SEO-001", "SEO-002", "SEO-003"],
    candidateCount: 3,
    failCount: 3,
    warningCount: 0,
    highConfidenceCount: 2,
    mediumConfidenceCount: 1,
  }),
], scoring({ categoryScores: { SEO: 72 } }));
assert(criticalByConcentration.assessments[0].priority === "CRITICAL", "Three fails should be CRITICAL.");
console.log("✓ Three or more failures elevate an opportunity to CRITICAL priority");

const criticalByScore = assessOpportunityGroups([
  group({ failCount: 1, warningCount: 0, highConfidenceCount: 1, mediumConfidenceCount: 0 }),
], scoring({ categoryScores: { SEO: 40 } }));
assert(criticalByScore.assessments[0].priority === "CRITICAL", "Fail plus category score <= 40 should be CRITICAL.");
console.log("✓ Category scoring context can strengthen priority without creating the opportunity itself");

const unavailableScore = assessOpportunityGroups([
  group({ failCount: 1, warningCount: 0, highConfidenceCount: 1, mediumConfidenceCount: 0 }),
], scoring({ websiteScore: null, categoryScores: { SEO: null } }));
assert(unavailableScore.assessments[0].priority === "MEDIUM", "Missing scores should not fabricate higher priority.");
assert(unavailableScore.assessments[0].categoryScore === null, "Unavailable category score should remain null.");
console.log("✓ Missing scoring evidence remains explicit and does not fabricate priority");

let invalidRejected = false;
try {
  assessOpportunityGroups([group()], scoring({ categoryScores: { SEO: 101 } }));
} catch {
  invalidRejected = true;
}
assert(invalidRejected, "Invalid category scores must be rejected.");

let duplicateRejected = false;
try {
  assessOpportunityGroups([group(), group()], scoring());
} catch {
  duplicateRejected = true;
}
assert(duplicateRejected, "Duplicate group IDs must be rejected.");

let inconsistentRejected = false;
try {
  assessOpportunityGroups([group({ candidateCount: 2 })], scoring());
} catch {
  inconsistentRejected = true;
}
assert(inconsistentRejected, "Non-reconciling evidence counts must be rejected.");
console.log("✓ Invalid scores, duplicate groups, and inconsistent evidence counts are rejected");

const transparent = high.assessments[0];
assert(transparent.priorityReasons.length > 0, "Priority must include reasons.");
assert(transparent.confidenceReasons.length > 0, "Confidence must include reasons.");
assert(transparent.evidenceStrength.candidateCount === 2, "Evidence explanation should preserve candidate count.");
assert(high.scoringModelVersion === "1.0.0", "Assessment should preserve scoring model version.");
console.log("✓ Priority and confidence results remain transparent and version-traceable");

console.log("\nPhase 8 priority & recommendation confidence smoke test passed.\n");
