const TARGET = process.env.TEQQI_APP_URL ?? "http://localhost:3000";
const assert = (condition, message) => { if (!condition) throw new Error(message); };

console.log("\nTEQQI OS Phase 9 — Ranked Business Table smoke test");
console.log(`Target app: ${TARGET}\n`);

const response = await fetch(`${TARGET}/api/dashboard`);
const payload = await response.json();
assert(response.ok && payload.ok === true, `Dashboard API failed: ${JSON.stringify(payload.error ?? payload)}`);

const dashboard = payload.dashboard;
const rows = dashboard.rankedBusinesses;
assert(Array.isArray(rows), "rankedBusinesses must be an array.");
assert(rows.length === dashboard.businesses.length, "Ranked table must contain every dashboard business exactly once.");
assert(new Set(rows.map((row) => row.externalId)).size === rows.length, "Ranked businesses must be unique.");
assert(rows.every((row, index) => row.rank === index + 1), "Ranks must be contiguous and ordered from 1.");
console.log("✓ Every discovered business appears exactly once with a deterministic rank");

const priorityRank = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
const confidenceRank = { HIGH: 3, MEDIUM: 2, LOW: 1 };
for (let i = 1; i < rows.length; i += 1) {
  const a = rows[i - 1];
  const b = rows[i];
  const ap = a.bestOpportunity ? priorityRank[a.bestOpportunity.priority] : 0;
  const bp = b.bestOpportunity ? priorityRank[b.bestOpportunity.priority] : 0;
  assert(ap >= bp, "Higher-priority opportunities must rank ahead of lower-priority opportunities.");

  if (ap === bp) {
    const ac = a.bestOpportunity ? confidenceRank[a.bestOpportunity.confidence] : 0;
    const bc = b.bestOpportunity ? confidenceRank[b.bestOpportunity.confidence] : 0;
    if (ac !== bc) {
      assert(ac >= bc, "Higher-confidence opportunities must rank ahead when priority is equal.");
    } else if (a.opportunityCount !== b.opportunityCount) {
      assert(a.opportunityCount >= b.opportunityCount, "More opportunity evidence must rank ahead when priority/confidence are equal.");
    } else if (a.websiteScore !== null && b.websiteScore !== null && a.websiteScore !== b.websiteScore) {
      assert(a.websiteScore <= b.websiteScore, "Lower Website Score must rank ahead when prior evidence is tied.");
    }
  }
}
console.log("✓ Priority, confidence, opportunity count, and Website Score drive evidence-based ordering");

assert(rows.every((row) => typeof row.rankingReason === "string" && row.rankingReason.length > 0), "Every ranked row must explain its position.");
assert(rows.every((row) => row.leadScore?.available === false && row.leadScore?.score === null), "Ranked table must not fabricate Lead Scores.");
console.log("✓ Every row exposes an explanation and Lead Score remains explicitly unavailable");

assert(rows.every((row) => "websiteScore" in row && "bestOpportunity" in row && "opportunityCount" in row && "intelligenceAvailable" in row), "Ranked rows must expose required table intelligence.");
console.log("✓ Ranked rows expose Website Score, best opportunity, priority/confidence context, opportunity count, and analysis status");

console.log("\nPhase 9 Ranked Business Table smoke test passed.\n");
