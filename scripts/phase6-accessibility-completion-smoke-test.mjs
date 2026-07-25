const baseUrl = process.env.TEQQI_OS_BASE_URL ?? "http://localhost:3000";
function assert(condition, message) { if (!condition) throw new Error(message); }
async function analyze(url) { const response = await fetch(`${baseUrl}/api/websites/analyze`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }) }); return { response, data: await response.json() }; }
function expectedIds() { return Array.from({ length: 22 }, (_, i) => `A11Y-${String(i + 1).padStart(3, "0")}`); }

async function run() {
  console.log("\nTEQQI OS Phase 6 — Accessibility completion review"); console.log(`Target: ${baseUrl}\n`);
  const { response, data } = await analyze("https://www.google.com/");
  assert(response.ok, `Analysis failed: HTTP ${response.status} ${JSON.stringify(data)}`);
  assert(data.implementationStage === "ACCESSIBILITY_COMPLETE", `Expected ACCESSIBILITY_COMPLETE, received ${data.implementationStage}.`);
  assert(data.nextStage === "CONTENT_QUALITY", `Expected CONTENT_QUALITY handoff, received ${data.nextStage}.`);
  const findings = data.accessibilityFindings;
  assert(Array.isArray(findings), "Expected accessibilityFindings array.");
  assert(findings.length === 22, `Expected exactly 22 Accessibility findings, received ${findings.length}.`);
  const expected = expectedIds(); const ids = findings.map((f) => f.ruleId);
  assert(new Set(ids).size === 22, "Expected 22 unique Accessibility rule IDs.");
  assert(ids.every((id, i) => id === expected[i]), "Expected A11Y-001 through A11Y-022 in order.");
  const statuses = new Set(["PASS", "WARNING", "FAIL", "UNKNOWN", "NOT_APPLICABLE"]); const confidence = new Set(["HIGH", "MEDIUM", "LOW"]);
  for (const finding of findings) {
    assert(finding.category === "ACCESSIBILITY", `${finding.ruleId} has incorrect category.`);
    assert(statuses.has(finding.status), `${finding.ruleId} has invalid status.`);
    assert(confidence.has(finding.confidence), `${finding.ruleId} has invalid confidence.`);
    assert(typeof finding.applicable === "boolean", `${finding.ruleId} applicable must be boolean.`);
    assert(typeof finding.summary === "string" && finding.summary.trim().length > 0, `${finding.ruleId} needs summary.`);
    assert(finding.result && typeof finding.result === "object" && !Array.isArray(finding.result), `${finding.ruleId} needs result.`);
    assert(finding.evidence && typeof finding.evidence === "object" && !Array.isArray(finding.evidence), `${finding.ruleId} needs evidence.`);
    assert((finding.status === "NOT_APPLICABLE") === (finding.applicable === false), `${finding.ruleId} applicability/status contract inconsistent.`);
  }
  for (const id of ["A11Y-009", "A11Y-010", "A11Y-011", "A11Y-012", "A11Y-013", "A11Y-014", "A11Y-019", "A11Y-020", "A11Y-021", "A11Y-022"]) {
    const item = findings.find((f) => f.ruleId === id); assert(item, `Missing ${id}.`); assert(item.status === "UNKNOWN", `${id} should remain UNKNOWN until required rendered/raw DOM evidence exists.`); assert(item.confidence === "LOW", `${id} limitation should be LOW confidence.`);
  }
  console.log("✓ Exactly 22 Accessibility findings returned");
  console.log("✓ A11Y-001 through A11Y-022 are unique, complete, and ordered");
  console.log("✓ Accessibility status/confidence/applicability contract is consistent");
  console.log("✓ Browser/raw-DOM limitations are explicit rather than fabricated");
  console.log("\nAccessibility completion review passed.\n");
}
run().catch((error) => { console.error("\nAccessibility completion review failed:"); console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
