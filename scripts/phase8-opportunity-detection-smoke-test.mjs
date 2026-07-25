import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const root = process.cwd();
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "teqqi-phase8-detection-"));

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
      .replaceAll('from "./types"', 'from "./types.mjs"'),
  );
  return outPath;
}

for (const file of ["types.ts", "config.ts", "detection.ts"]) {
  await compile(`lib/website-opportunities/${file}`);
}

const config = await import(pathToFileURL(path.join(tempDir, "config.mjs")));
const { detectOpportunityCandidates } = await import(
  pathToFileURL(path.join(tempDir, "detection.mjs"))
);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function makeFinding(ruleId, category, status = "FAIL", confidence = "HIGH", applicable = true) {
  return { ruleId, category, status, confidence, applicable };
}

console.log("\nTEQQI OS Phase 8 — Finding → Opportunity Detection smoke test\n");

const representative = [
  makeFinding("TECH-001", "TECHNICAL_HEALTH"),
  makeFinding("TECH-006", "TECHNICAL_HEALTH"),
  makeFinding("TECH-025", "TECHNICAL_HEALTH"),
  makeFinding("SEO-001", "SEO"),
  makeFinding("PERF-001", "PERFORMANCE"),
  makeFinding("CUX-001", "CONVERSION_UX"),
  makeFinding("A11Y-001", "ACCESSIBILITY"),
  makeFinding("CONTENT-001", "CONTENT_QUALITY"),
];
const result = detectOpportunityCandidates(representative);
const types = result.candidates.map((candidate) => candidate.type);
assert(types.includes("TECHNICAL_REMEDIATION"), "Expected Technical Remediation candidate.");
assert(types.includes("SECURITY_CONFIGURATION"), "Expected Security Configuration candidate.");
assert(types.includes("MOBILE_EXPERIENCE"), "Expected Mobile Experience candidate.");
assert(types.includes("SEO_IMPROVEMENT"), "Expected SEO Improvement candidate.");
assert(types.includes("PERFORMANCE_OPTIMIZATION"), "Expected Performance Optimization candidate.");
assert(types.includes("CONVERSION_UX_IMPROVEMENT"), "Expected Conversion/UX candidate.");
assert(types.includes("ACCESSIBILITY_REMEDIATION"), "Expected Accessibility candidate.");
assert(types.includes("CONTENT_IMPROVEMENT"), "Expected Content candidate.");
console.log("✓ Representative Phase 6 findings map deterministically to website opportunity candidates");

const allConfiguredFindings = [];
for (const [category, range] of Object.entries(config.ANALYZER_RULE_RANGES)) {
  for (let index = 1; index <= range.count; index += 1) {
    allConfiguredFindings.push(
      makeFinding(`${range.prefix}-${String(index).padStart(3, "0")}`, category, "WARNING"),
    );
  }
}
const allConfigured = detectOpportunityCandidates(allConfiguredFindings);
assert(allConfigured.evaluatedFindingCount === 140, "Expected all 140 analyzer findings to be evaluated.");
assert(allConfigured.eligibleFindingCount === 140, "Expected all 140 WARNING fixtures to be eligible.");
assert(allConfigured.candidates.length === 140, "Every eligible finding should produce a traceable candidate before grouping.");
assert(new Set(allConfigured.candidates.map((item) => item.candidateId)).size === 140, "Candidate IDs must be unique.");
console.log("✓ All 140 configured analyzer rule IDs have deterministic pre-grouping detection coverage");

const excluded = detectOpportunityCandidates([
  makeFinding("SEO-001", "SEO", "PASS"),
  makeFinding("PERF-001", "PERFORMANCE", "UNKNOWN"),
  makeFinding("A11Y-001", "ACCESSIBILITY", "WARNING", "LOW"),
  makeFinding("CUX-001", "CONVERSION_UX", "NOT_APPLICABLE", "HIGH", false),
]);
assert(excluded.candidates.length === 0, "PASS/UNKNOWN/LOW/NOT_APPLICABLE must not create confirmed candidates.");
assert(excluded.excludedFindingCount === 4, "Expected four excluded findings.");
console.log("✓ PASS, UNKNOWN, NOT_APPLICABLE, and LOW-confidence findings do not create opportunities");

const security = detectOpportunityCandidates([
  ...[6, 7, 8, 9, 10].map((n) => makeFinding(`TECH-${String(n).padStart(3, "0")}`, "TECHNICAL_HEALTH")),
]);
assert(security.candidates.every((candidate) => candidate.type === "SECURITY_CONFIGURATION"), "TECH-006 through TECH-010 must map to Security Configuration.");
console.log("✓ HTTPS/TLS/mixed-content Technical Health rules map to Security Configuration");

const mobile = detectOpportunityCandidates([
  ...[25, 26, 27, 28, 29].map((n) => makeFinding(`TECH-${String(n).padStart(3, "0")}`, "TECHNICAL_HEALTH")),
]);
assert(mobile.candidates.every((candidate) => candidate.type === "MOBILE_EXPERIENCE"), "TECH-025 through TECH-029 must map to Mobile Experience.");
console.log("✓ Mobile Technical Health rules map to Mobile Experience");

let invalidRejected = false;
try {
  detectOpportunityCandidates([makeFinding("SEO-999", "SEO")]);
} catch {
  invalidRejected = true;
}
assert(invalidRejected, "Unknown rule IDs must be rejected.");

let mismatchRejected = false;
try {
  detectOpportunityCandidates([makeFinding("SEO-001", "PERFORMANCE")]);
} catch {
  mismatchRejected = true;
}
assert(mismatchRejected, "Rule/category mismatches must be rejected.");

let duplicateRejected = false;
try {
  detectOpportunityCandidates([
    makeFinding("SEO-001", "SEO"),
    makeFinding("SEO-001", "SEO"),
  ]);
} catch {
  duplicateRejected = true;
}
assert(duplicateRejected, "Duplicate findings must be rejected.");
console.log("✓ Invalid IDs, category mismatches, and duplicate findings are rejected safely");

const prohibited = new Set(config.PROHIBITED_WEBSITE_ONLY_SERVICE_IDS);
for (const type of new Set(allConfigured.candidates.map((candidate) => candidate.type))) {
  const service = config.WEBSITE_SERVICE_BY_OPPORTUNITY[type];
  assert(service && !prohibited.has(service), `${type} mapped to prohibited website-only service ${service}.`);
}
console.log("✓ Detection cannot produce CRM/Internal Tool/AI Automation or other unsupported business-service inferences");

console.log("\nPhase 8 finding-to-opportunity detection smoke test passed.\n");
