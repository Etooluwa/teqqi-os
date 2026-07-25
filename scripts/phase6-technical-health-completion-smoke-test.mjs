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

function expectedRuleIds() {
  return Array.from({ length: 38 }, (_, index) => `TECH-${String(index + 1).padStart(3, "0")}`);
}

async function run() {
  console.log("\nTEQQI OS Phase 6 — Technical Health V2 completion review");
  console.log(`Target: ${baseUrl}\n`);

  const { response, data } = await analyze("https://www.wikipedia.org/");
  assert(response.ok, `Analysis failed: HTTP ${response.status} ${JSON.stringify(data)}`);
  assert(typeof data.implementationStage === "string", "Expected analyzer implementation stage.");

  const findings = data.technicalHealthFindings;
  assert(Array.isArray(findings), "Expected technicalHealthFindings array.");
  assert(findings.length === 38, `Expected exactly 38 findings, received ${findings.length}.`);

  const ids = findings.map((finding) => finding.ruleId);
  const uniqueIds = new Set(ids);
  assert(uniqueIds.size === 38, `Expected 38 unique rule IDs, received ${uniqueIds.size}.`);

  const expected = expectedRuleIds();
  const missing = expected.filter((id) => !uniqueIds.has(id));
  const unexpected = ids.filter((id) => !expected.includes(id));
  assert(missing.length === 0, `Missing Technical Health rules: ${missing.join(", ")}`);
  assert(unexpected.length === 0, `Unexpected Technical Health rules: ${unexpected.join(", ")}`);
  assert(ids.every((id, index) => id === expected[index]), "Technical Health findings are not returned in TECH-001 through TECH-038 order.");

  const validStatuses = new Set(["PASS", "WARNING", "FAIL", "UNKNOWN", "NOT_APPLICABLE"]);
  const validConfidence = new Set(["HIGH", "MEDIUM", "LOW"]);
  for (const finding of findings) {
    assert(finding.category === "TECHNICAL_HEALTH", `${finding.ruleId} has incorrect category.`);
    assert(validStatuses.has(finding.status), `${finding.ruleId} has invalid status ${finding.status}.`);
    assert(validConfidence.has(finding.confidence), `${finding.ruleId} has invalid confidence ${finding.confidence}.`);
    assert(typeof finding.applicable === "boolean", `${finding.ruleId} applicable must be boolean.`);
    assert(typeof finding.summary === "string" && finding.summary.trim().length > 0, `${finding.ruleId} needs a summary.`);
    assert(finding.result && typeof finding.result === "object" && !Array.isArray(finding.result), `${finding.ruleId} needs object result evidence.`);
    assert(finding.evidence && typeof finding.evidence === "object" && !Array.isArray(finding.evidence), `${finding.ruleId} needs structured evidence.`);
    assert(typeof finding.detectorVersion === "string" && finding.detectorVersion.length > 0, `${finding.ruleId} needs detectorVersion.`);
    assert((finding.status === "NOT_APPLICABLE") === (finding.applicable === false), `${finding.ruleId} applicability/status contract is inconsistent.`);
  }

  for (const key of ["transportSecurity", "redirectConsistency", "crawlability", "linkIntegrity", "technicalHygiene"]) {
    assert(data[key] && typeof data[key] === "object", `Expected ${key} evidence object.`);
  }
  assert(data.mobileUsability && typeof data.mobileUsability === "object", "Expected mobileUsability evidence for HTML fixture.");

  const runtime = findings.find((finding) => finding.ruleId === "TECH-037");
  assert(runtime, "Missing TECH-037.");
  assert(runtime.status === "UNKNOWN", "TECH-037 should remain UNKNOWN until rendered-browser runtime inspection exists.");
  assert(runtime.result?.runtimeInspected === false, "TECH-037 should explicitly record that runtime was not inspected.");

  console.log("✓ Exactly 38 Technical Health findings returned");
  console.log("✓ TECH-001 through TECH-038 are unique, complete, and ordered");
  console.log("✓ Finding status/confidence/applicability contract is consistent");
  console.log("✓ Shared evidence objects are present in the analyzer response");
  console.log("✓ TECH-037 limitation is explicit rather than inferred");
  console.log("\nTechnical Health V2 completion review passed.\n");
}

run().catch((error) => {
  console.error("\nTechnical Health V2 completion review failed:");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
