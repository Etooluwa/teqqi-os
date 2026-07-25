const baseUrl = process.env.TEQQI_OS_BASE_URL ?? "http://localhost:3000";
function assert(condition, message) { if (!condition) throw new Error(message); }
async function analyze(url) { const response = await fetch(`${baseUrl}/api/websites/analyze`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }) }); return { response, data: await response.json() }; }
function findingById(data, ruleId) { return data.technicalHealthFindings?.find((finding) => finding.ruleId === ruleId); }
async function run() {
  console.log("\nTEQQI OS Phase 6 — Technical Health Batch 5 smoke test"); console.log(`Target: ${baseUrl}\n`);
  const { response, data } = await analyze("https://www.google.com/");
  assert(response.ok, `Google analysis failed: HTTP ${response.status} ${JSON.stringify(data)}`);
  assert(/^TECHNICAL_HEALTH_BATCH_[5-9]$/.test(data.implementationStage), "Expected analyzer to have reached Batch 5 or later.");
  assert(Array.isArray(data.technicalHealthFindings) && data.technicalHealthFindings.length >= 24, "Expected findings through TECH-024.");
  assert(typeof data.linkIntegrity === "object", "Expected link-integrity evidence.");
  assert(Array.isArray(data.linkIntegrity.internalLinks), "Expected normalized internal links.");
  assert(Array.isArray(data.linkIntegrity.externalLinks), "Expected normalized external links.");
  assert(Array.isArray(data.linkIntegrity.internalProbes), "Expected internal link probes.");
  assert(Array.isArray(data.linkIntegrity.externalProbes), "Expected external link probes.");
  assert(Array.isArray(data.linkIntegrity.invalidLinks), "Expected invalid-link evidence.");
  assert(Array.isArray(data.linkIntegrity.unsupportedProtocols), "Expected protocol evidence.");
  for (const ruleId of ["TECH-021", "TECH-022", "TECH-023", "TECH-024"]) {
    const f = findingById(data, ruleId); assert(f, `Missing ${ruleId}.`); assert(typeof f.summary === "string" && f.summary.length > 0, `${ruleId} needs a summary.`); assert(["PASS", "WARNING", "FAIL", "UNKNOWN", "NOT_APPLICABLE"].includes(f.status), `${ruleId} has invalid status.`); assert(["HIGH", "MEDIUM", "LOW"].includes(f.confidence), `${ruleId} has invalid confidence.`); assert(typeof f.evidence === "object", `${ruleId} needs structured evidence.`); assert(f.detectorVersion === "1.0.0", `${ruleId} detector version should be 1.0.0.`);
  }
  const a = findingById(data, "TECH-021"), b = findingById(data, "TECH-022"), c = findingById(data, "TECH-023"), d = findingById(data, "TECH-024");
  console.log(`✓ TECH-021 broken internal links (${a.status})`); console.log(`✓ TECH-022 broken external links (${b.status})`); console.log(`✓ TECH-023 empty or invalid links (${c.status})`); console.log(`✓ TECH-024 valid link protocols (${d.status})`); console.log("\n4 Technical Health Batch 5 smoke checks passed.\n");
}
run().catch((error) => { console.error("\nTechnical Health Batch 5 smoke test failed:"); console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
