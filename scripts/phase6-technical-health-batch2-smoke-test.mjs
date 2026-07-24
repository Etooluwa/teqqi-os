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
  const data = await response.json();
  return { response, data };
}

function findingById(data, ruleId) {
  return data.technicalHealthFindings?.find((finding) => finding.ruleId === ruleId);
}

async function run() {
  console.log("\nTEQQI OS Phase 6 — Technical Health Batch 2 smoke test");
  console.log(`Target: ${baseUrl}\n`);

  const { response, data } = await analyze("https://www.google.com/");
  assert(response.ok, `Google analysis failed: HTTP ${response.status} ${JSON.stringify(data)}`);
  assert(data.implementationStage === "TECHNICAL_HEALTH_BATCH_3", "Expected analyzer to have advanced through Batch 3.");
  assert(Array.isArray(data.technicalHealthFindings), "Expected Technical Health findings.");
  assert(data.technicalHealthFindings.length >= 10, "Expected findings through TECH-010.");
  assert(typeof data.transportSecurity === "object", "Expected transport-security evidence.");
  assert(typeof data.transportSecurity.https?.available === "boolean", "Expected HTTPS probe evidence.");
  assert(typeof data.transportSecurity.http?.available === "boolean", "Expected HTTP probe evidence.");
  assert(typeof data.transportSecurity.tls?.connected === "boolean", "Expected TLS evidence.");

  for (const ruleId of ["TECH-006", "TECH-007", "TECH-008", "TECH-009", "TECH-010"]) {
    const finding = findingById(data, ruleId);
    assert(finding, `Missing ${ruleId}.`);
    assert(typeof finding.summary === "string" && finding.summary.length > 0, `${ruleId} needs a summary.`);
    assert(["HIGH", "MEDIUM", "LOW"].includes(finding.confidence), `${ruleId} has invalid confidence.`);
    assert(typeof finding.evidence === "object", `${ruleId} needs structured evidence.`);
    assert(finding.detectorVersion === "1.0.0", `${ruleId} detector version should be 1.0.0.`);
  }

  assert(["PASS", "WARNING"].includes(findingById(data, "TECH-006")?.status), "TECH-006 should find HTTPS available.");

  const tech007 = findingById(data, "TECH-007");
  assert(["PASS", "FAIL", "UNKNOWN"].includes(tech007?.status), "TECH-007 should classify HTTP upgrade behavior.");
  assert(
    [true, false, null].includes(tech007?.result?.redirectsToHttps),
    "TECH-007 should expose redirectsToHttps as true, false, or null.",
  );

  assert(findingById(data, "TECH-008")?.status === "PASS", "TECH-008 should validate Google's TLS certificate.");
  assert(["PASS", "WARNING"].includes(findingById(data, "TECH-009")?.status), "TECH-009 should classify certificate expiry risk.");
  assert(findingById(data, "TECH-010")?.status === "PASS", "TECH-010 should find no mixed active content on Google homepage.");

  console.log("✓ TECH-006 HTTPS availability");
  console.log(`✓ TECH-007 HTTP to HTTPS behavior (${tech007.status})`);
  console.log("✓ TECH-008 TLS certificate validity");
  console.log("✓ TECH-009 certificate expiry risk");
  console.log("✓ TECH-010 mixed active content inspection");
  console.log("\n5 Technical Health Batch 2 smoke checks passed.\n");
}

run().catch((error) => {
  console.error("\nTechnical Health Batch 2 smoke test failed:");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
