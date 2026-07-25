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

function findingById(data, ruleId) {
  return data.seoFindings?.find((finding) => finding.ruleId === ruleId);
}

async function run() {
  console.log("\nTEQQI OS Phase 6 — SEO Batch 1 smoke test");
  console.log(`Target: ${baseUrl}\n`);

  const { response, data } = await analyze("https://www.wikipedia.org/");
  assert(response.ok, `Wikipedia analysis failed: HTTP ${response.status} ${JSON.stringify(data)}`);
  assert(data.implementationStage === "SEO_BATCH_1", "Expected SEO Batch 1 stage.");
  assert(data.nextStage === "SEO_BATCH_2", "Expected SEO Batch 2 handoff.");
  assert(data.seoEvidence && typeof data.seoEvidence === "object", "Expected SEO evidence foundation.");
  assert(Array.isArray(data.seoEvidence.pages), "Expected SEO page evidence array.");
  assert(data.seoEvidence.pageCount === data.seoEvidence.pages.length, "SEO pageCount should match pages array.");
  assert(data.seoEvidence.pageCount >= 1, "Expected at least the homepage in SEO evidence.");
  assert(data.seoEvidence.pages.some((page) => page.isHomepage), "Expected homepage SEO evidence.");
  assert(Array.isArray(data.seoFindings), "Expected seoFindings array.");
  assert(data.seoFindings.length === 6, `Expected exactly 6 SEO Batch 1 findings, received ${data.seoFindings.length}.`);

  const expected = ["SEO-001", "SEO-002", "SEO-003", "SEO-004", "SEO-005", "SEO-006"];
  assert(data.seoFindings.every((finding, index) => finding.ruleId === expected[index]), "SEO Batch 1 findings should be ordered SEO-001 through SEO-006.");

  for (const ruleId of expected) {
    const finding = findingById(data, ruleId);
    assert(finding, `Missing ${ruleId}.`);
    assert(finding.category === "SEO", `${ruleId} should use SEO category.`);
    assert(["PASS", "WARNING", "FAIL", "UNKNOWN", "NOT_APPLICABLE"].includes(finding.status), `${ruleId} has invalid status.`);
    assert(["HIGH", "MEDIUM", "LOW"].includes(finding.confidence), `${ruleId} has invalid confidence.`);
    assert(typeof finding.applicable === "boolean", `${ruleId} applicable must be boolean.`);
    assert(typeof finding.summary === "string" && finding.summary.length > 0, `${ruleId} needs a summary.`);
    assert(finding.result && typeof finding.result === "object", `${ruleId} needs result evidence.`);
    assert(finding.evidence && typeof finding.evidence === "object", `${ruleId} needs structured evidence.`);
    assert(finding.detectorVersion === "1.0.0", `${ruleId} detectorVersion should be 1.0.0.`);
    assert((finding.status === "NOT_APPLICABLE") === (finding.applicable === false), `${ruleId} applicability contract is inconsistent.`);
  }

  console.log(`✓ SEO evidence foundation (${data.seoEvidence.pageCount} HTML pages)`);
  for (const ruleId of expected) {
    console.log(`✓ ${ruleId} ${findingById(data, ruleId).status}`);
  }
  console.log("\n6 SEO Batch 1 smoke checks passed.\n");
}

run().catch((error) => {
  console.error("\nSEO Batch 1 smoke test failed:");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
