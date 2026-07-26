const TARGET = process.env.TEQQI_APP_URL ?? "http://localhost:3000";
const assert = (condition, message) => { if (!condition) throw new Error(message); };

console.log("\nTEQQI OS Phase 10 — Business Detail Data Foundation smoke test");
console.log(`Target app: ${TARGET}\n`);

const dashboardResponse = await fetch(`${TARGET}/api/dashboard`);
const dashboardBody = await dashboardResponse.json();
assert(dashboardResponse.ok && dashboardBody.ok === true, `Dashboard API failed: ${JSON.stringify(dashboardBody)}`);

const candidates = dashboardBody.dashboard.businesses;
assert(Array.isArray(candidates) && candidates.length > 0, "A discovered business is required for Phase 10 foundation validation.");
const selected = candidates.find((row) => row.intelligenceAvailable) ?? candidates[0];

const detailResponse = await fetch(`${TARGET}/api/businesses/${encodeURIComponent(selected.externalId)}`);
const detailBody = await detailResponse.json();
assert(detailResponse.ok && detailBody.ok === true, `Business detail API failed: ${JSON.stringify(detailBody)}`);
const detail = detailBody.detail;

assert(detail.detailVersion === "1.0.0", "Business detail contract must be versioned.");
assert(detail.externalId === selected.externalId, "Business detail identity must match the requested Google Place ID.");
assert(detail.business?.externalId === selected.externalId, "Live Google business identity must reconcile with the detail request.");
assert(detail.discovery?.searchId, "Business detail must retain discovery-search traceability.");
console.log("✓ One discovered business resolves into a versioned, traceable business-detail contract");

assert(detail.dataNotes?.googlePlaceContentPersisted === false, "Google Places content must not be persisted for Phase 10.");
assert(detail.dataNotes?.googlePlaceDetailsRetrievedLive === true, "Business information must be refreshed live from Google Places.");
console.log("✓ Business information remains live-only and respects Google Places storage boundaries");

assert(detail.leadScore?.available === false && detail.leadScore?.score === null && detail.leadScore?.tier === null, "Phase 10 must not fabricate Lead Score.");
console.log("✓ Commercial Lead Score remains explicitly unavailable rather than fabricated");

if (detail.intelligence.available) {
  assert(detail.intelligence.scoringRun || detail.intelligence.opportunityRun, "Available intelligence must expose at least one persisted run.");
  if (detail.intelligence.scoringRun) {
    const scoring = detail.intelligence.scoringRun;
    assert(scoring.scoringRunId && scoring.scoring?.scoringModelVersion, "Scoring intelligence must preserve full Phase 7 traceability.");
    assert(Array.isArray(scoring.scoring.categoryScores) && Array.isArray(scoring.scoring.ruleScores), "Scoring detail must carry category and rule-level explanation data.");
  }
  if (detail.intelligence.opportunityRun) {
    const opportunity = detail.intelligence.opportunityRun;
    assert(opportunity.opportunityRunId && opportunity.result?.opportunityEngineVersion, "Opportunity intelligence must preserve full Phase 8 traceability.");
    assert(Array.isArray(opportunity.result.opportunities), "Opportunity detail must carry structured recommendation output.");
  }
  console.log("✓ Latest Phase 7/8 intelligence is attached with category, rule, recommendation, version, and run traceability");
} else {
  assert(detail.intelligence.websiteUrl === null || typeof detail.intelligence.websiteUrl === "string", "Missing intelligence must remain explicit.");
  console.log("✓ Missing website intelligence remains explicit instead of being fabricated");
}

const missingResponse = await fetch(`${TARGET}/api/businesses/not-a-real-teqqi-place-id`);
assert(missingResponse.status === 404, "Unknown business IDs must return a controlled 404.");
console.log("✓ Unknown business IDs fail safely without falling back to unrelated intelligence");

console.log("\nPhase 10 Business Detail Data Foundation smoke test passed.\n");
