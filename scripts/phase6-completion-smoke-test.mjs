const baseUrl = process.env.TEQQI_OS_BASE_URL ?? "http://localhost:3000";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function analyze(url) {
  const response = await fetch(`${baseUrl}/api/websites/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  return { response, data: await response.json() };
}

function range(prefix, count) {
  return Array.from({ length: count }, (_, index) => `${prefix}-${String(index + 1).padStart(3, "0")}`);
}

const categories = [
  { key: "technicalFindings", name: "Technical Health", category: "TECHNICAL_HEALTH", ids: range("TECH", 38) },
  { key: "seoFindings", name: "SEO", category: "SEO", ids: range("SEO", 24) },
  { key: "performanceFindings", name: "Performance", category: "PERFORMANCE", ids: range("PERF", 16) },
  { key: "conversionUxFindings", name: "Conversion/UX", category: "CONVERSION_UX", ids: range("CUX", 22) },
  { key: "accessibilityFindings", name: "Accessibility", category: "ACCESSIBILITY", ids: range("A11Y", 22) },
  { key: "contentQualityFindings", name: "Content Quality", category: "CONTENT_QUALITY", ids: range("CONTENT", 18) },
];

async function run() {
  console.log("\nTEQQI OS Phase 6 — Full Website Analyzer completion review");
  console.log(`Target: ${baseUrl}\n`);

  const { response, data } = await analyze("https://www.google.com/");
  assert(response.ok, `Analysis failed: HTTP ${response.status} ${JSON.stringify(data)}`);
  assert(data.implementationStage === "CONTENT_QUALITY_COMPLETE", `Expected final implemented stage CONTENT_QUALITY_COMPLETE, received ${data.implementationStage}.`);
  assert(data.nextStage === "PHASE_6_COMPLETION_REVIEW", `Expected PHASE_6_COMPLETION_REVIEW handoff, received ${data.nextStage}.`);

  const statuses = new Set(["PASS", "WARNING", "FAIL", "UNKNOWN", "NOT_APPLICABLE"]);
  const confidence = new Set(["HIGH", "MEDIUM", "LOW"]);
  const allFindings = [];

  for (const spec of categories) {
    const findings = data[spec.key];
    assert(Array.isArray(findings), `Expected ${spec.key} array.`);
    assert(findings.length === spec.ids.length, `${spec.name}: expected ${spec.ids.length} findings, received ${findings.length}.`);
    const ids = findings.map((finding) => finding.ruleId);
    assert(new Set(ids).size === spec.ids.length, `${spec.name}: rule IDs must be unique.`);
    assert(ids.every((id, index) => id === spec.ids[index]), `${spec.name}: rule IDs are incomplete or out of order.`);

    for (const finding of findings) {
      assert(finding.category === spec.category, `${finding.ruleId} has incorrect category ${finding.category}.`);
      assert(statuses.has(finding.status), `${finding.ruleId} has invalid status.`);
      assert(confidence.has(finding.confidence), `${finding.ruleId} has invalid confidence.`);
      assert(typeof finding.applicable === "boolean", `${finding.ruleId} applicable must be boolean.`);
      assert(typeof finding.summary === "string" && finding.summary.trim().length > 0, `${finding.ruleId} needs a summary.`);
      assert(finding.result && typeof finding.result === "object" && !Array.isArray(finding.result), `${finding.ruleId} needs result evidence.`);
      assert(finding.evidence && typeof finding.evidence === "object" && !Array.isArray(finding.evidence), `${finding.ruleId} needs structured evidence.`);
      assert(typeof finding.detectorVersion === "string" && finding.detectorVersion.length > 0, `${finding.ruleId} needs detectorVersion.`);
      assert((finding.status === "NOT_APPLICABLE") === (finding.applicable === false), `${finding.ruleId} applicability/status contract is inconsistent.`);
    }

    allFindings.push(...findings);
    console.log(`✓ ${spec.name}: ${findings.length}/${spec.ids.length} rules complete and ordered`);
  }

  assert(allFindings.length === 140, `Expected exactly 140 findings across Phase 6, received ${allFindings.length}.`);
  const allIds = allFindings.map((finding) => finding.ruleId);
  assert(new Set(allIds).size === 140, "Expected all 140 Phase 6 rule IDs to be globally unique.");

  const explicitLimitations = ["TECH-037", "CUX-019", "CUX-020", "A11Y-004", "CONTENT-003", "CONTENT-013", "CONTENT-018"];
  for (const id of explicitLimitations) {
    const finding = allFindings.find((item) => item.ruleId === id);
    assert(finding, `Missing limitation-sensitive rule ${id}.`);
    assert(finding.status === "UNKNOWN" || finding.status === "NOT_APPLICABLE", `${id} must not fabricate unsupported evidence.`);
  }

  if (data.performanceEvidence?.available === false) {
    assert(typeof data.performanceEvidence.error === "string" && data.performanceEvidence.error.length > 0, "Unavailable PageSpeed evidence must preserve the provider error.");
    console.log("✓ Performance provider unavailability is explicit and non-fabricated");
  } else {
    assert(data.performanceEvidence?.available === true, "Expected explicit Performance provider availability state.");
    console.log("✓ Live Performance provider evidence is available");
  }

  console.log("✓ Exactly 140 analyzer findings returned across all six categories");
  console.log("✓ All 140 rule IDs are globally unique");
  console.log("✓ Shared finding contract is consistent across Phase 6");
  console.log("✓ Evidence limitations remain explicit rather than fabricated");
  console.log("✓ Final analyzer handoff is PHASE_6_COMPLETION_REVIEW");
  console.log("\nPhase 6 full Website Analyzer completion review passed.\n");
}

run().catch((error) => {
  console.error("\nPhase 6 full Website Analyzer completion review failed:");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
