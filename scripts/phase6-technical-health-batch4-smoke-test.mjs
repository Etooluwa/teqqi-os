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
  console.log("\nTEQQI OS Phase 6 — Technical Health Batch 4 smoke test");
  console.log(`Target: ${baseUrl}\n`);

  const { response, data } = await analyze("https://www.google.com/");
  assert(response.ok, `Google analysis failed: HTTP ${response.status} ${JSON.stringify(data)}`);
  assert(data.implementationStage === "TECHNICAL_HEALTH_BATCH_4", "Expected Batch 4 stage.");
  assert(Array.isArray(data.technicalHealthFindings), "Expected Technical Health findings.");
  assert(data.technicalHealthFindings.length >= 20, "Expected findings through TECH-020.");
  assert(typeof data.crawlability === "object", "Expected crawlability evidence.");
  assert(typeof data.crawlability.robots?.reachable === "boolean", "Expected robots evidence.");
  assert(Array.isArray(data.crawlability.robots?.sitemapUrls), "Expected robots sitemap references.");
  assert(Array.isArray(data.crawlability.sitemap?.candidates), "Expected sitemap candidates.");
  assert(Array.isArray(data.crawlability.sitemap?.checkedUrls), "Expected sitemap URL probes.");
  assert(Array.isArray(data.crawlability.internalCrawl?.pages), "Expected internal crawl page evidence.");
  assert(data.crawlability.internalCrawl?.maxPages === 20, "Internal crawl should enforce the 20-page maximum.");
  assert(data.crawlability.internalCrawl?.maxDepth === 2, "Internal crawl should enforce depth 2.");

  for (const ruleId of ["TECH-016", "TECH-017", "TECH-018", "TECH-019", "TECH-020"]) {
    const finding = findingById(data, ruleId);
    assert(finding, `Missing ${ruleId}.`);
    assert(typeof finding.summary === "string" && finding.summary.length > 0, `${ruleId} needs a summary.`);
    assert(["HIGH", "MEDIUM", "LOW"].includes(finding.confidence), `${ruleId} has invalid confidence.`);
    assert(typeof finding.evidence === "object", `${ruleId} needs structured evidence.`);
    assert(finding.detectorVersion === "1.0.0", `${ruleId} detector version should be 1.0.0.`);
  }

  const tech016 = findingById(data, "TECH-016");
  assert(["PASS", "FAIL", "UNKNOWN"].includes(tech016?.status), "TECH-016 should classify robots.txt presence.");

  const tech017 = findingById(data, "TECH-017");
  assert(["PASS", "FAIL", "UNKNOWN"].includes(tech017?.status), "TECH-017 should classify global crawl blocking.");

  const tech018 = findingById(data, "TECH-018");
  assert(["PASS", "FAIL", "UNKNOWN"].includes(tech018?.status), "TECH-018 should classify sitemap presence.");

  const tech019 = findingById(data, "TECH-019");
  assert(
    ["PASS", "WARNING", "FAIL", "UNKNOWN", "NOT_APPLICABLE"].includes(tech019?.status),
    "TECH-019 should classify sitemap URL reachability.",
  );

  const tech020 = findingById(data, "TECH-020");
  assert(
    ["PASS", "WARNING", "FAIL", "UNKNOWN", "NOT_APPLICABLE"].includes(tech020?.status),
    "TECH-020 should classify internal crawlability.",
  );

  console.log(`✓ TECH-016 robots.txt presence (${tech016.status})`);
  console.log(`✓ TECH-017 global crawl blocking (${tech017.status})`);
  console.log(`✓ TECH-018 XML sitemap presence (${tech018.status})`);
  console.log(`✓ TECH-019 sitemap URL reachability (${tech019.status})`);
  console.log(
    `✓ TECH-020 internal crawlability (${tech020.status}, ${data.crawlability.internalCrawl.attemptedPages} pages sampled)`,
  );
  console.log("\n5 Technical Health Batch 4 smoke checks passed.\n");
}

run().catch((error) => {
  console.error("\nTechnical Health Batch 4 smoke test failed:");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
