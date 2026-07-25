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

function expectedSeoRuleIds() {
  return Array.from({ length: 24 }, (_, index) => `SEO-${String(index + 1).padStart(3, "0")}`);
}

async function run() {
  console.log("\nTEQQI OS Phase 6 — SEO completion review");
  console.log(`Target: ${baseUrl}\n`);

  const { response, data } = await analyze("https://www.wikipedia.org/");
  assert(response.ok, `Analysis failed: HTTP ${response.status} ${JSON.stringify(data)}`);
  assert(typeof data.implementationStage === "string" && data.implementationStage.length > 0, "Expected analyzer implementation stage.");

  const findings = data.seoFindings;
  assert(Array.isArray(findings), "Expected seoFindings array.");
  assert(findings.length === 24, `Expected exactly 24 SEO findings, received ${findings.length}.`);

  const expected = expectedSeoRuleIds();
  const ids = findings.map((finding) => finding.ruleId);
  const uniqueIds = new Set(ids);
  assert(uniqueIds.size === 24, `Expected 24 unique SEO rule IDs, received ${uniqueIds.size}.`);
  const missing = expected.filter((id) => !uniqueIds.has(id));
  const unexpected = ids.filter((id) => !expected.includes(id));
  assert(missing.length === 0, `Missing SEO rules: ${missing.join(", ")}`);
  assert(unexpected.length === 0, `Unexpected SEO rules: ${unexpected.join(", ")}`);
  assert(ids.every((id, index) => id === expected[index]), "SEO findings are not returned in SEO-001 through SEO-024 order.");

  const validStatuses = new Set(["PASS", "WARNING", "FAIL", "UNKNOWN", "NOT_APPLICABLE"]);
  const validConfidence = new Set(["HIGH", "MEDIUM", "LOW"]);
  for (const finding of findings) {
    assert(finding.category === "SEO", `${finding.ruleId} has incorrect category.`);
    assert(validStatuses.has(finding.status), `${finding.ruleId} has invalid status ${finding.status}.`);
    assert(validConfidence.has(finding.confidence), `${finding.ruleId} has invalid confidence ${finding.confidence}.`);
    assert(typeof finding.applicable === "boolean", `${finding.ruleId} applicable must be boolean.`);
    assert(typeof finding.summary === "string" && finding.summary.trim().length > 0, `${finding.ruleId} needs a summary.`);
    assert(finding.result && typeof finding.result === "object" && !Array.isArray(finding.result), `${finding.ruleId} needs object result evidence.`);
    assert(finding.evidence && typeof finding.evidence === "object" && !Array.isArray(finding.evidence), `${finding.ruleId} needs structured evidence.`);
    assert(typeof finding.detectorVersion === "string" && finding.detectorVersion.length > 0, `${finding.ruleId} needs detectorVersion.`);
    assert((finding.status === "NOT_APPLICABLE") === (finding.applicable === false), `${finding.ruleId} applicability/status contract is inconsistent.`);
  }

  assert(data.seoEvidence && typeof data.seoEvidence === "object", "Expected shared seoEvidence object.");
  assert(Array.isArray(data.seoEvidence.pages), "Expected seoEvidence.pages array.");

  const requiredResultKeys = new Map([
    ["SEO-015", "imagesEvaluated"],
    ["SEO-017", "linksEvaluated"],
    ["SEO-018", "pagesEvaluated"],
    ["SEO-019", "pagesEvaluated"],
    ["SEO-020", "pagesEvaluated"],
    ["SEO-021", "pagesEvaluated"],
    ["SEO-022", "blocksEvaluated"],
    ["SEO-023", "pagesEvaluated"],
    ["SEO-024", "sitemapPresent"],
  ]);
  for (const [ruleId, key] of requiredResultKeys) {
    const item = findings.find((finding) => finding.ruleId === ruleId);
    assert(item, `Missing ${ruleId}.`);
    if (ruleId === "SEO-024" && item.applicable) continue;
    assert(Object.prototype.hasOwnProperty.call(item.result, key), `${ruleId} should expose ${key}.`);
  }

  console.log("✓ Exactly 24 SEO findings returned");
  console.log("✓ SEO-001 through SEO-024 are unique, complete, and ordered");
  console.log("✓ SEO finding status/confidence/applicability contract is consistent");
  console.log("✓ Shared SEO page evidence is present");
  console.log("✓ Remaining SEO rule result contracts are present");
  console.log("\nSEO completion review passed.\n");
}

run().catch((error) => {
  console.error("\nSEO completion review failed:");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
