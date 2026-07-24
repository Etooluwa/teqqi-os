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
  console.log("\nTEQQI OS Phase 6 — Technical Health Batch 1 smoke test");
  console.log(`Target: ${baseUrl}\n`);

  {
    const { response, data } = await analyze("https://www.wikipedia.org/");
    assert(response.ok, `Wikipedia analysis failed: HTTP ${response.status} ${JSON.stringify(data)}`);
    assert(String(data.implementationStage).startsWith("TECHNICAL_HEALTH_BATCH_"), "Expected Technical Health stage.");
    assert(Array.isArray(data.technicalHealthFindings), "Expected Technical Health findings.");
    assert(data.technicalHealthFindings.length >= 5, "Analyzer should include at least the five Batch 1 findings.");

    for (const ruleId of ["TECH-001", "TECH-002", "TECH-003", "TECH-004", "TECH-005"]) {
      const finding = findingById(data, ruleId);
      assert(finding, `Missing ${ruleId}.`);
      assert(typeof finding.summary === "string" && finding.summary.length > 0, `${ruleId} needs a summary.`);
      assert(["HIGH", "MEDIUM", "LOW"].includes(finding.confidence), `${ruleId} has invalid confidence.`);
      assert(typeof finding.evidence === "object", `${ruleId} needs structured evidence.`);
      assert(finding.detectorVersion === "1.0.0", `${ruleId} detector version should be 1.0.0.`);
    }

    assert(findingById(data, "TECH-001")?.status === "PASS", "TECH-001 should PASS for a resolvable public domain.");
    assert(findingById(data, "TECH-002")?.status === "PASS", "TECH-002 should PASS for a healthy homepage response.");
    assert(["PASS", "WARNING"].includes(findingById(data, "TECH-003")?.status), "TECH-003 should identify Wikipedia as HTML.");
    assert(findingById(data, "TECH-004")?.status !== "FAIL", "Wikipedia should not be classified as parked.");
    assert(findingById(data, "TECH-005")?.status !== "FAIL", "Wikipedia should contain meaningful content.");
    console.log("✓ TECH-001 through TECH-005 healthy-site path");
  }

  {
    const { response, data } = await analyze("https://www.google.com/robots.txt");
    assert(response.ok, `Non-HTML classification request failed: HTTP ${response.status}.`);
    assert(findingById(data, "TECH-001")?.status === "PASS", "TECH-001 should still PASS for the resolvable domain.");
    assert(findingById(data, "TECH-002"), "TECH-002 should still produce a response finding.");
    assert(findingById(data, "TECH-003")?.status === "FAIL", "TECH-003 should FAIL for text/plain robots.txt.");
    assert(findingById(data, "TECH-004")?.status === "NOT_APPLICABLE", "TECH-004 should be N/A when HTML is unavailable.");
    assert(findingById(data, "TECH-005")?.status === "NOT_APPLICABLE", "TECH-005 should be N/A when HTML is unavailable.");
    console.log("✓ TECH-003 failure and downstream applicability behavior");
  }

  console.log("\n2 Technical Health Batch 1 smoke checks passed.\n");
}

run().catch((error) => {
  console.error("\nTechnical Health Batch 1 smoke test failed:");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
