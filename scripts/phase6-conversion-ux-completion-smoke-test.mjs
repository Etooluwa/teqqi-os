const baseUrl = process.env.TEQQI_OS_BASE_URL ?? "http://localhost:3000";
function assert(condition, message) { if (!condition) throw new Error(message); }
async function analyze(url) { const response = await fetch(`${baseUrl}/api/websites/analyze`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }) }); return { response, data: await response.json() }; }
function expectedIds() { return Array.from({ length: 22 }, (_, i) => `CUX-${String(i + 1).padStart(3, "0")}`); }
async function run() {
  console.log("\nTEQQI OS Phase 6 — Conversion & UX completion review"); console.log(`Target: ${baseUrl}\n`);
  const { response, data } = await analyze("https://www.google.com/");
  assert(response.ok, `Analysis failed: HTTP ${response.status} ${JSON.stringify(data)}`);
  assert(data.implementationStage === "CONVERSION_UX_COMPLETE", `Expected CONVERSION_UX_COMPLETE, received ${data.implementationStage}.`);
  assert(data.nextStage === "ACCESSIBILITY", `Expected ACCESSIBILITY handoff, received ${data.nextStage}.`);
  const findings = data.conversionUxFindings; assert(Array.isArray(findings), "Expected conversionUxFindings array."); assert(findings.length === 22, `Expected exactly 22 Conversion/UX findings, received ${findings.length}.`);
  const expected = expectedIds(); const ids = findings.map((f) => f.ruleId); assert(new Set(ids).size === 22, "Expected 22 unique CUX rule IDs."); assert(ids.every((id, i) => id === expected[i]), "Expected CUX-001 through CUX-022 in order.");
  const statuses = new Set(["PASS", "WARNING", "FAIL", "UNKNOWN", "NOT_APPLICABLE"]); const confidence = new Set(["HIGH", "MEDIUM", "LOW"]);
  for (const finding of findings) { assert(finding.category === "CONVERSION_UX", `${finding.ruleId} has incorrect category.`); assert(statuses.has(finding.status), `${finding.ruleId} has invalid status.`); assert(confidence.has(finding.confidence), `${finding.ruleId} has invalid confidence.`); assert(typeof finding.applicable === "boolean", `${finding.ruleId} applicable must be boolean.`); assert(typeof finding.summary === "string" && finding.summary.length > 0, `${finding.ruleId} needs summary.`); assert(finding.result && typeof finding.result === "object" && !Array.isArray(finding.result), `${finding.ruleId} needs result.`); assert(finding.evidence && typeof finding.evidence === "object" && !Array.isArray(finding.evidence), `${finding.ruleId} needs evidence.`); assert((finding.status === "NOT_APPLICABLE") === (finding.applicable === false), `${finding.ruleId} applicability/status contract inconsistent.`); }
  for (const id of ["CUX-005", "CUX-020", "CUX-021", "CUX-022"]) { const x = findings.find((f) => f.ruleId === id); assert(x, `Missing ${id}.`); if (x.status === "UNKNOWN") assert(x.confidence === "LOW", `${id} rendered-evidence limitation should be LOW confidence.`); }
  console.log("✓ Exactly 22 Conversion/UX findings returned"); console.log("✓ CUX-001 through CUX-022 are unique, complete, and ordered"); console.log("✓ Conversion/UX status/confidence/applicability contract is consistent"); console.log("✓ Browser-dependent limitations are explicit rather than fabricated"); console.log("\nConversion & UX completion review passed.\n");
}
run().catch((error) => { console.error("\nConversion & UX completion review failed:"); console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
