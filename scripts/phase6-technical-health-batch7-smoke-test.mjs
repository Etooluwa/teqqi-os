const baseUrl = process.env.TEQQI_OS_BASE_URL ?? "http://localhost:3000";
function assert(condition, message) { if (!condition) throw new Error(message); }
async function analyze(url) {
  const response = await fetch(`${baseUrl}/api/websites/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  return { response, data: await response.json() };
}
function findingById(data, ruleId) { return data.technicalHealthFindings?.find((finding) => finding.ruleId === ruleId); }

async function run() {
  console.log("\nTEQQI OS Phase 6 — Technical Health Batch 7 smoke test");
  console.log(`Target: ${baseUrl}\n`);

  const { response, data } = await analyze("https://www.wikipedia.org/");
  assert(response.ok, `Wikipedia analysis failed: HTTP ${response.status} ${JSON.stringify(data)}`);
  assert(data.implementationStage === "TECHNICAL_HEALTH_BATCH_7", "Expected Batch 7 stage.");
  assert(data.nextStage === "TECHNICAL_HEALTH_COMPLETE", "Expected Technical Health completion marker.");
  assert(Array.isArray(data.technicalHealthFindings) && data.technicalHealthFindings.length >= 38, "Expected findings through TECH-038.");
  assert(typeof data.technicalHygiene === "object" && data.technicalHygiene !== null, "Expected technical-hygiene evidence.");
  assert(typeof data.technicalHygiene.notFoundProbe?.requestedUrl === "string", "Expected missing-page probe evidence.");
  assert(Array.isArray(data.technicalHygiene.favicon?.probes), "Expected favicon probes.");
  assert(typeof data.technicalHygiene.document?.doctypePresent === "boolean", "Expected doctype evidence.");
  assert(data.technicalHygiene.javascriptRuntime?.inspected === false, "Static analyzer should explicitly mark runtime inspection unavailable.");
  assert(Array.isArray(data.technicalHygiene.firstPartyResources?.probes), "Expected first-party resource probes.");

  const ids = ["TECH-030", "TECH-031", "TECH-032", "TECH-033", "TECH-034", "TECH-035", "TECH-036", "TECH-037", "TECH-038"];
  for (const ruleId of ids) {
    const finding = findingById(data, ruleId);
    assert(finding, `Missing ${ruleId}.`);
    assert(typeof finding.summary === "string" && finding.summary.length > 0, `${ruleId} needs a summary.`);
    assert(["PASS", "WARNING", "FAIL", "UNKNOWN", "NOT_APPLICABLE"].includes(finding.status), `${ruleId} has invalid status.`);
    assert(["HIGH", "MEDIUM", "LOW"].includes(finding.confidence), `${ruleId} has invalid confidence.`);
    assert(typeof finding.evidence === "object", `${ruleId} needs structured evidence.`);
    assert(finding.detectorVersion === "1.0.0", `${ruleId} detector version should be 1.0.0.`);
  }

  for (const ruleId of ids) {
    console.log(`✓ ${ruleId} ${findingById(data, ruleId).status}`);
  }
  console.log("\n9 Technical Health Batch 7 smoke checks passed.\n");
}

run().catch((error) => {
  console.error("\nTechnical Health Batch 7 smoke test failed:");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
