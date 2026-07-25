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

async function run() {
  console.log("\nTEQQI OS Phase 6 — SEO Batch 2 smoke test");
  console.log(`Target: ${baseUrl}\n`);

  const { response, data } = await analyze("https://www.wikipedia.org/");
  assert(response.ok, `Analysis failed: HTTP ${response.status} ${JSON.stringify(data)}`);
  assert(data.implementationStage === "SEO_BATCH_2", `Expected SEO_BATCH_2, received ${data.implementationStage}.`);
  assert(data.nextStage === "SEO_BATCH_3", `Expected SEO_BATCH_3 handoff, received ${data.nextStage}.`);

  const findings = data.seoFindings;
  assert(Array.isArray(findings), "Expected seoFindings array.");
  assert(findings.length === 9, `Expected 9 SEO findings through Batch 2, received ${findings.length}.`);
  const expectedIds = Array.from({ length: 9 }, (_, index) => `SEO-${String(index + 1).padStart(3, "0")}`);
  assert(findings.every((finding, index) => finding.ruleId === expectedIds[index]), "Expected SEO-001 through SEO-009 in order.");

  for (const id of ["SEO-007", "SEO-008", "SEO-009"]) {
    const finding = findings.find((item) => item.ruleId === id);
    assert(finding, `Missing ${id}.`);
    assert(finding.category === "SEO", `${id} should use SEO category.`);
    assert(["PASS", "WARNING", "FAIL", "UNKNOWN", "NOT_APPLICABLE"].includes(finding.status), `${id} returned invalid status.`);
    assert(typeof finding.applicable === "boolean", `${id} applicable must be boolean.`);
    assert(finding.result && typeof finding.result === "object", `${id} needs result evidence.`);
    assert(finding.evidence && typeof finding.evidence === "object", `${id} needs structured evidence.`);
    console.log(`✓ ${id} ${finding.status}`);
  }

  const seo007 = findings.find((item) => item.ruleId === "SEO-007");
  assert(typeof seo007.result.pagesEvaluated === "number", "SEO-007 should report pagesEvaluated.");

  const seo009 = findings.find((item) => item.ruleId === "SEO-009");
  if (seo009.applicable) {
    assert(typeof seo009.result.hierarchyIssues === "number", "SEO-009 should report hierarchyIssues when applicable.");
  }

  console.log("\n3 SEO Batch 2 smoke checks passed.\n");
}

run().catch((error) => {
  console.error("\nSEO Batch 2 smoke test failed:");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
