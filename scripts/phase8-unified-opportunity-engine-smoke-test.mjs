import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const root = process.cwd();
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "teqqi-phase8-unified-"));

async function compile(relativePath) {
  const sourcePath = path.join(root, relativePath);
  const source = await fs.readFile(sourcePath, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
    fileName: sourcePath,
  }).outputText;
  const outPath = path.join(tempDir, path.basename(relativePath).replace(/\.ts$/, ".mjs"));
  const rewritten = output.replace(/from "\.\/(config|types|detection|grouping|assessment)"/g, 'from "./$1.mjs"');
  await fs.writeFile(outPath, rewritten);
}

for (const file of ["types.ts", "config.ts", "detection.ts", "grouping.ts", "assessment.ts", "service.ts"]) {
  await compile(`lib/website-opportunities/${file}`);
}

const config = await import(pathToFileURL(path.join(tempDir, "config.mjs")));
const { generateWebsiteOpportunities } = await import(pathToFileURL(path.join(tempDir, "service.mjs")));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function finding(ruleId, category, status = "FAIL", confidence = "HIGH", applicable = true) {
  return { ruleId, category, status, confidence, applicable };
}

function scoring(overrides = {}) {
  return {
    websiteScore: 72,
    categoryScores: {
      TECHNICAL_HEALTH: 75,
      SEO: 58,
      PERFORMANCE: 55,
      CONVERSION_UX: 70,
      ACCESSIBILITY: 65,
      CONTENT_QUALITY: 80,
      ...(overrides.categoryScores ?? {}),
    },
    criticalFailureCount: 0,
    scoringModelVersion: "1.0.0",
    ...overrides,
  };
}

console.log("\nTEQQI OS Phase 8 — Unified Opportunity Engine smoke test\n");

const input = {
  findings: [
    finding("SEO-001", "SEO", "FAIL", "HIGH"),
    finding("SEO-004", "SEO", "WARNING", "HIGH"),
    finding("PERF-001", "PERFORMANCE", "FAIL", "HIGH"),
    finding("PERF-002", "PERFORMANCE", "FAIL", "HIGH"),
    finding("A11Y-001", "ACCESSIBILITY", "WARNING", "MEDIUM"),
    finding("TECH-006", "TECHNICAL_HEALTH", "FAIL", "HIGH"),
    finding("TECH-025", "TECHNICAL_HEALTH", "WARNING", "MEDIUM"),
    finding("CONTENT-001", "CONTENT_QUALITY", "PASS", "HIGH"),
    finding("CUX-001", "CONVERSION_UX", "UNKNOWN", "LOW"),
  ],
  scoring: scoring(),
};

const result = generateWebsiteOpportunities(input);
assert(result.evaluatedFindingCount === 9, "Expected all findings to be evaluated.");
assert(result.eligibleFindingCount === 7 && result.excludedFindingCount === 2, "Eligibility counts should reconcile.");
assert(result.candidateCount === 7, "Expected one candidate per eligible direct finding.");
assert(result.opportunityCount === 5, "Expected five grouped website opportunities.");
console.log("✓ Analyzer findings flow through detection, grouping, assessment, and final opportunity generation");

const seo = result.opportunities.find((item) => item.type === "SEO_IMPROVEMENT");
assert(seo, "Expected SEO opportunity.");
assert(seo.supportingFindingIds.join(",") === "SEO-001,SEO-004", "SEO evidence should remain traceable and grouped.");
assert(seo.recommendedService === "SEO_OPTIMIZATION", "SEO opportunity must map to SEO service.");
assert(seo.priority === "HIGH", "SEO score/evidence should deterministically produce HIGH priority.");
assert(seo.confidence === "HIGH", "Two HIGH-confidence SEO findings should produce HIGH recommendation confidence.");
console.log("✓ Grouped opportunities preserve evidence and map deterministically to approved website services");

const security = result.opportunities.find((item) => item.type === "SECURITY_CONFIGURATION");
const mobile = result.opportunities.find((item) => item.type === "MOBILE_EXPERIENCE");
assert(security?.supportingFindingIds.includes("TECH-006"), "Expected TECH-006 security opportunity.");
assert(mobile?.supportingFindingIds.includes("TECH-025"), "Expected TECH-025 mobile opportunity.");
console.log("✓ Technical Health specializations survive the complete unified pipeline");

for (const opportunity of result.opportunities) {
  assert(opportunity.opportunityEngineVersion === config.OPPORTUNITY_ENGINE_VERSION, "Opportunity version must be preserved.");
  assert(opportunity.scoringModelVersion === input.scoring.scoringModelVersion, "Scoring version must be preserved.");
  assert(opportunity.candidateIds.length > 0 && opportunity.detectionRuleIds.length > 0, "Candidate/detection trace must be present.");
  assert(opportunity.supportingFindingIds.length > 0, "Supporting findings must be present.");
  assert(opportunity.explanation.includes("Priority is"), "Explanation must include priority rationale.");
  assert(opportunity.explanation.includes("Recommendation confidence is"), "Explanation must include confidence rationale.");
}
console.log("✓ Final opportunities preserve versioned, rule-level, grouping, priority, and confidence traceability");

const prohibited = new Set(config.PROHIBITED_WEBSITE_ONLY_SERVICE_IDS);
for (const opportunity of result.opportunities) {
  assert(!prohibited.has(opportunity.recommendedService), "Website-only engine must not infer prohibited business services.");
}
console.log("✓ Unified engine cannot emit CRM, Internal Tool, AI Automation, or other prohibited business-service inferences");

const noEvidence = generateWebsiteOpportunities({
  findings: [finding("SEO-001", "SEO", "PASS", "HIGH")],
  scoring: scoring(),
});
assert(noEvidence.opportunityCount === 0 && noEvidence.trace.grouping.groupCount === 0, "No eligible evidence should produce no opportunities.");
console.log("✓ No eligible website evidence produces an explicit empty opportunity result");

const missingScore = generateWebsiteOpportunities({
  findings: [finding("A11Y-001", "ACCESSIBILITY", "WARNING", "MEDIUM")],
  scoring: scoring({ categoryScores: { ACCESSIBILITY: null }, websiteScore: null }),
});
assert(missingScore.opportunities[0].categoryScore === null, "Missing category score must stay null.");
assert(missingScore.opportunities[0].websiteScore === null, "Missing Website Score must stay null.");
assert(missingScore.opportunities[0].explanation.includes("No relevant category score was available"), "Missing score limitation should be explicit.");
console.log("✓ Missing scoring context remains explicit rather than being fabricated or converted to failure");

assert(result.trace.detection.candidates.length === result.candidateCount, "Detection trace should reconcile.");
assert(result.trace.grouping.groups.length === result.opportunityCount, "Grouping trace should reconcile.");
assert(result.trace.assessment.assessments.length === result.opportunityCount, "Assessment trace should reconcile.");
console.log("✓ Unified result reconciles detection, grouping, assessment, service mapping, and final opportunity counts");

console.log("\nPhase 8 unified Opportunity Engine smoke test passed.\n");
