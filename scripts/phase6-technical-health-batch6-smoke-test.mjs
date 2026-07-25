const baseUrl = process.env.TEQQI_OS_BASE_URL ?? "http://localhost:3000";
function assert(condition, message) { if (!condition) throw new Error(message); }
async function analyze(url) { const response = await fetch(`${baseUrl}/api/websites/analyze`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }) }); return { response, data: await response.json() }; }
function findingById(data, ruleId) { return data.technicalHealthFindings?.find((finding) => finding.ruleId === ruleId); }

async function run() {
  console.log("\nTEQQI OS Phase 6 — Technical Health Batch 6 smoke test");
  console.log(`Target: ${baseUrl}\n`);

  const { response, data } = await analyze("https://www.wikipedia.org/");
  assert(response.ok, `Wikipedia analysis failed: HTTP ${response.status} ${JSON.stringify(data)}`);
  assert(/^TECHNICAL_HEALTH_BATCH_[6-9]$/.test(data.implementationStage) || data.implementationStage === "TECHNICAL_HEALTH_COMPLETE", "Expected analyzer to have reached Batch 6 or later.");
  assert(Array.isArray(data.technicalHealthFindings) && data.technicalHealthFindings.length >= 29, "Expected findings through TECH-029.");
  assert(typeof data.mobileUsability === "object" && data.mobileUsability !== null, "Expected mobile-usability evidence.");
  assert(data.mobileUsability.method === "STATIC_HTML_CSS", "Expected static mobile evidence method.");
  assert(typeof data.mobileUsability.viewport?.present === "boolean", "Expected viewport evidence.");
  assert(typeof data.mobileUsability.responsiveSignals?.mediaQueryCount === "number", "Expected responsive CSS evidence.");
  assert(typeof data.mobileUsability.navigation?.navElementCount === "number", "Expected navigation evidence.");
  assert(typeof data.mobileUsability.essentialContent?.h1Count === "number", "Expected essential-content evidence.");
  assert(typeof data.mobileUsability.touchTargets?.totalCandidates === "number", "Expected touch-target evidence.");
  assert(Array.isArray(data.mobileUsability.limitations), "Expected explicit evidence limitations.");

  for (const ruleId of ["TECH-025", "TECH-026", "TECH-027", "TECH-028", "TECH-029"]) {
    const finding = findingById(data, ruleId);
    assert(finding, `Missing ${ruleId}.`);
    assert(typeof finding.summary === "string" && finding.summary.length > 0, `${ruleId} needs a summary.`);
    assert(["PASS", "WARNING", "FAIL", "UNKNOWN", "NOT_APPLICABLE"].includes(finding.status), `${ruleId} has invalid status.`);
    assert(["HIGH", "MEDIUM", "LOW"].includes(finding.confidence), `${ruleId} has invalid confidence.`);
    assert(typeof finding.evidence === "object", `${ruleId} needs structured evidence.`);
    assert(finding.detectorVersion === "1.0.0", `${ruleId} detector version should be 1.0.0.`);
  }

  const a = findingById(data, "TECH-025");
  const b = findingById(data, "TECH-026");
  const c = findingById(data, "TECH-027");
  const d = findingById(data, "TECH-028");
  const e = findingById(data, "TECH-029");
  console.log(`✓ TECH-025 viewport configured (${a.status})`);
  console.log(`✓ TECH-026 responsive layout (${b.status})`);
  console.log(`✓ TECH-027 mobile navigation usable (${c.status})`);
  console.log(`✓ TECH-028 essential content visible on mobile (${d.status})`);
  console.log(`✓ TECH-029 touch target accessibility (${e.status})`);
  console.log("\n5 Technical Health Batch 6 smoke checks passed.\n");
}

run().catch((error) => {
  console.error("\nTechnical Health Batch 6 smoke test failed:");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
