import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const root = process.cwd();
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "teqqi-phase8-grouping-"));

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
      .replaceAll('from "./types"', 'from "./types.mjs"')
      .replaceAll('from "./detection"', 'from "./detection.mjs"'),
  );
  return outPath;
}

for (const file of ["types.ts", "config.ts", "detection.ts", "grouping.ts"]) {
  await compile(`lib/website-opportunities/${file}`);
}

const { groupOpportunityCandidates } = await import(
  pathToFileURL(path.join(tempDir, "grouping.mjs"))
);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function candidate({
  id,
  ruleId,
  type,
  category,
  status = "FAIL",
  confidence = "HIGH",
  findings = [ruleId],
}) {
  return {
    candidateId: id,
    detectionRuleId: `DIRECT:${ruleId}`,
    type,
    supportingFindingIds: findings,
    categories: [category],
    sourceStatus: status,
    sourceConfidence: confidence,
  };
}

console.log("\nTEQQI OS Phase 8 — Opportunity Grouping & Deduplication smoke test\n");

const grouped = groupOpportunityCandidates([
  candidate({ id: "c-seo-1", ruleId: "SEO-001", type: "SEO_IMPROVEMENT", category: "SEO" }),
  candidate({ id: "c-seo-2", ruleId: "SEO-010", type: "SEO_IMPROVEMENT", category: "SEO", status: "WARNING", confidence: "MEDIUM" }),
  candidate({ id: "c-perf-1", ruleId: "PERF-001", type: "PERFORMANCE_OPTIMIZATION", category: "PERFORMANCE" }),
  candidate({ id: "c-a11y-1", ruleId: "A11Y-001", type: "ACCESSIBILITY_REMEDIATION", category: "ACCESSIBILITY" }),
]);

assert(grouped.candidateCount === 4, "Expected four unique candidates.");
assert(grouped.groupCount === 3, "Expected three grouped opportunities.");
const seo = grouped.groups.find((group) => group.type === "SEO_IMPROVEMENT");
assert(seo, "Expected SEO group.");
assert(seo.candidateCount === 2, "SEO candidates should collapse into one opportunity group.");
assert(seo.supportingFindingIds.join(",") === "SEO-001,SEO-010", "SEO group must preserve all supporting findings.");
assert(seo.failCount === 1 && seo.warningCount === 1, "SEO status counts should reconcile.");
assert(seo.highConfidenceCount === 1 && seo.mediumConfidenceCount === 1, "SEO confidence counts should reconcile.");
console.log("✓ Multiple related candidates collapse into one opportunity while preserving source findings");

assert(grouped.groups.map((group) => group.type).join(",") === "PERFORMANCE_OPTIMIZATION,ACCESSIBILITY_REMEDIATION,SEO_IMPROVEMENT", "Groups should follow controlled taxonomy order.");
console.log("✓ Distinct opportunity types remain separate and use deterministic taxonomy ordering");

const duplicate = candidate({ id: "dup", ruleId: "SEO-004", type: "SEO_IMPROVEMENT", category: "SEO" });
const deduped = groupOpportunityCandidates([duplicate, { ...duplicate }]);
assert(deduped.candidateCount === 1, "Duplicate candidate IDs must not be counted twice.");
assert(deduped.duplicateCandidateCount === 1, "Duplicate candidate should be reported.");
assert(deduped.groups[0].supportingFindingIds.length === 1, "Duplicate candidate must not duplicate evidence.");
console.log("✓ Duplicate candidate IDs are deduplicated without duplicating evidence");

const repeatedEvidence = groupOpportunityCandidates([
  candidate({ id: "multi-1", ruleId: "SEO-002", type: "SEO_IMPROVEMENT", category: "SEO", findings: ["SEO-002", "SEO-003"] }),
  candidate({ id: "multi-2", ruleId: "SEO-003", type: "SEO_IMPROVEMENT", category: "SEO", findings: ["SEO-003", "SEO-004"] }),
]);
assert(repeatedEvidence.groups[0].supportingFindingIds.join(",") === "SEO-002,SEO-003,SEO-004", "Overlapping evidence should be unique and traceable.");
console.log("✓ Overlapping supporting findings are merged once while traceability is preserved");

let invalidRejected = false;
try {
  groupOpportunityCandidates([
    candidate({ id: "bad", ruleId: "SEO-001", type: "CRM", category: "SEO" }),
  ]);
} catch {
  invalidRejected = true;
}
assert(invalidRejected, "Unsupported opportunity types must be rejected.");
console.log("✓ Unsupported opportunity types are rejected instead of entering grouped output");

const empty = groupOpportunityCandidates([]);
assert(empty.candidateCount === 0 && empty.groupCount === 0 && empty.groups.length === 0, "Empty input should return an empty deterministic result.");
console.log("✓ Empty candidate input produces an explicit empty grouping result");

console.log("\nPhase 8 opportunity grouping & deduplication smoke test passed.\n");
