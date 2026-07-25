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

function expectedIds() {
  return Array.from({ length: 18 }, (_, index) => `CONTENT-${String(index + 1).padStart(3, "0")}`);
}

async function run() {
  console.log("\nTEQQI OS Phase 6 — Content Quality completion review");
  console.log(`Target: ${baseUrl}\n`);

  const { response, data } = await analyze("https://www.google.com/");
  assert(response.ok, `Analysis failed: HTTP ${response.status} ${JSON.stringify(data)}`);
  assert(data.implementationStage === "CONTENT_QUALITY_COMPLETE", `Expected CONTENT_QUALITY_COMPLETE, received ${data.implementationStage}.`);
  assert(data.nextStage === "PHASE_6_COMPLETION_REVIEW", `Expected PHASE_6_COMPLETION_REVIEW handoff, received ${data.nextStage}.`);

  const findings = data.contentQualityFindings;
  assert(Array.isArray(findings), "Expected contentQualityFindings array.");
  assert(findings.length === 18, `Expected exactly 18 Content Quality findings, received ${findings.length}.`);

  const expected = expectedIds();
  const ids = findings.map((finding) => finding.ruleId);
  assert(new Set(ids).size === 18, "Expected 18 unique Content Quality rule IDs.");
  assert(ids.every((id, index) => id === expected[index]), "Expected CONTENT-001 through CONTENT-018 in order.");

  const statuses = new Set(["PASS", "WARNING", "FAIL", "UNKNOWN", "NOT_APPLICABLE"]);
  const confidence = new Set(["HIGH", "MEDIUM", "LOW"]);
  for (const finding of findings) {
    assert(finding.category === "CONTENT_QUALITY", `${finding.ruleId} has incorrect category.`);
    assert(statuses.has(finding.status), `${finding.ruleId} has invalid status.`);
    assert(confidence.has(finding.confidence), `${finding.ruleId} has invalid confidence.`);
    assert(typeof finding.applicable === "boolean", `${finding.ruleId} applicable must be boolean.`);
    assert(typeof finding.summary === "string" && finding.summary.trim().length > 0, `${finding.ruleId} needs a summary.`);
    assert(finding.result && typeof finding.result === "object" && !Array.isArray(finding.result), `${finding.ruleId} needs result evidence.`);
    assert(finding.evidence && typeof finding.evidence === "object" && !Array.isArray(finding.evidence), `${finding.ruleId} needs structured evidence.`);
    assert(typeof finding.detectorVersion === "string" && finding.detectorVersion.length > 0, `${finding.ruleId} needs detectorVersion.`);
    assert((finding.status === "NOT_APPLICABLE") === (finding.applicable === false), `${finding.ruleId} applicability/status contract is inconsistent.`);
  }

  for (const id of ["CONTENT-003", "CONTENT-013", "CONTENT-018"]) {
    const item = findings.find((finding) => finding.ruleId === id);
    assert(item, `Missing ${id}.`);
    assert(item.status === "UNKNOWN", `${id} should remain UNKNOWN until block/section-level DOM evidence is preserved.`);
    assert(item.confidence === "LOW", `${id} limitation should use LOW confidence.`);
  }

  console.log("✓ Exactly 18 Content Quality findings returned");
  console.log("✓ CONTENT-001 through CONTENT-018 are unique, complete, and ordered");
  console.log("✓ Content Quality status/confidence/applicability contract is consistent");
  console.log("✓ Block/section-level limitations are explicit rather than fabricated");
  console.log("\nContent Quality completion review passed.\n");
}

run().catch((error) => {
  console.error("\nContent Quality completion review failed:");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
