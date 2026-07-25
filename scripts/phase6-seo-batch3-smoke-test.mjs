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
  console.log("\nTEQQI OS Phase 6 — SEO Batch 3 smoke test");
  console.log(`Target: ${baseUrl}\n`);

  const { response, data } = await analyze("https://www.wikipedia.org/");
  assert(response.ok, `Analysis failed: HTTP ${response.status} ${JSON.stringify(data)}`);
  assert(data.implementationStage === "SEO_BATCH_3", `Expected SEO_BATCH_3, received ${data.implementationStage}.`);
  assert(data.nextStage === "SEO_BATCH_4", `Expected SEO_BATCH_4 handoff, received ${data.nextStage}.`);

  const findings = data.seoFindings;
  assert(Array.isArray(findings), "Expected seoFindings array.");
  assert(findings.length === 14, `Expected 14 SEO findings through Batch 3, received ${findings.length}.`);
  const expectedIds = Array.from({ length: 14 }, (_, index) => `SEO-${String(index + 1).padStart(3, "0")}`);
  assert(findings.every((finding, index) => finding.ruleId === expectedIds[index]), "Expected SEO-001 through SEO-014 in order.");

  for (const id of ["SEO-010", "SEO-011", "SEO-012", "SEO-013", "SEO-014"]) {
    const finding = findings.find((item) => item.ruleId === id);
    assert(finding, `Missing ${id}.`);
    assert(finding.category === "SEO", `${id} should use SEO category.`);
    assert(["PASS", "WARNING", "FAIL", "UNKNOWN", "NOT_APPLICABLE"].includes(finding.status), `${id} returned invalid status.`);
    assert(typeof finding.applicable === "boolean", `${id} applicable must be boolean.`);
    assert(finding.result && typeof finding.result === "object", `${id} needs result evidence.`);
    assert(finding.evidence && typeof finding.evidence === "object", `${id} needs structured evidence.`);
    console.log(`✓ ${id} ${finding.status}`);
  }

  const seo013 = findings.find((item) => item.ruleId === "SEO-013");
  if (seo013.applicable) assert(typeof seo013.result.noindexPages === "number", "SEO-013 should report noindexPages.");

  const seo014 = findings.find((item) => item.ruleId === "SEO-014");
  if (seo014.applicable) assert(typeof seo014.result.conflictCount === "number", "SEO-014 should report conflictCount.");

  console.log("\n5 SEO Batch 3 smoke checks passed.\n");
}

run().catch((error) => {
  console.error("\nSEO Batch 3 smoke test failed:");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
