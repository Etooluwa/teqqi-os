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
  console.log("\nTEQQI OS Phase 6 — Technical Health Batch 3 smoke test");
  console.log(`Target: ${baseUrl}\n`);

  const { response, data } = await analyze("google.com");
  assert(response.ok, `Google analysis failed: HTTP ${response.status} ${JSON.stringify(data)}`);
  assert(data.implementationStage === "TECHNICAL_HEALTH_BATCH_3", "Expected Batch 3 stage.");
  assert(Array.isArray(data.technicalHealthFindings), "Expected Technical Health findings.");
  assert(data.technicalHealthFindings.length >= 15, "Expected findings through TECH-015.");
  assert(typeof data.redirectConsistency === "object", "Expected redirect-consistency evidence.");
  assert(typeof data.redirectConsistency.redirectCount === "number", "Expected redirect count evidence.");
  assert(typeof data.redirectConsistency.finalUrl === "string", "Expected final URL evidence.");

  for (const ruleId of ["TECH-011", "TECH-012", "TECH-013", "TECH-014", "TECH-015"]) {
    const finding = findingById(data, ruleId);
    assert(finding, `Missing ${ruleId}.`);
    assert(typeof finding.summary === "string" && finding.summary.length > 0, `${ruleId} needs a summary.`);
    assert(["HIGH", "MEDIUM", "LOW"].includes(finding.confidence), `${ruleId} has invalid confidence.`);
    assert(typeof finding.evidence === "object", `${ruleId} needs structured evidence.`);
    assert(finding.detectorVersion === "1.0.0", `${ruleId} detector version should be 1.0.0.`);
  }

  const tech011 = findingById(data, "TECH-011");
  assert(["PASS", "WARNING", "UNKNOWN"].includes(tech011?.status), "TECH-011 should classify preferred-hostname behavior.");

  const tech012 = findingById(data, "TECH-012");
  assert(["PASS", "FAIL"].includes(tech012?.status), "TECH-012 should classify redirect-loop behavior.");
  assert(typeof tech012?.result?.redirectLoopDetected === "boolean", "TECH-012 should expose redirectLoopDetected.");

  const tech013 = findingById(data, "TECH-013");
  assert(["PASS", "WARNING", "FAIL"].includes(tech013?.status), "TECH-013 should classify redirect-chain length.");
  assert(typeof tech013?.result?.redirectCount === "number", "TECH-013 should expose redirectCount.");

  const tech014 = findingById(data, "TECH-014");
  assert(["PASS", "WARNING", "UNKNOWN"].includes(tech014?.status), "TECH-014 should classify redirect destination relevance.");

  const tech015 = findingById(data, "TECH-015");
  assert(["PASS", "WARNING", "FAIL"].includes(tech015?.status), "TECH-015 should classify URL normalization.");
  assert(typeof tech015?.result?.normalized === "boolean", "TECH-015 should expose normalization state.");

  console.log(`✓ TECH-011 preferred hostname (${tech011.status})`);
  console.log(`✓ TECH-012 redirect loop (${tech012.status})`);
  console.log(`✓ TECH-013 redirect chains (${tech013.status}, ${tech013.result.redirectCount} redirects)`);
  console.log(`✓ TECH-014 redirect destination relevance (${tech014.status})`);
  console.log(`✓ TECH-015 URL normalization (${tech015.status})`);
  console.log("\n5 Technical Health Batch 3 smoke checks passed.\n");
}

run().catch((error) => {
  console.error("\nTechnical Health Batch 3 smoke test failed:");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
