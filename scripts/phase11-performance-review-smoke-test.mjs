import { readFile } from "node:fs/promises";

const TARGET = process.env.TEQQI_APP_URL ?? "http://localhost:3000";
const assert = (condition, message) => { if (!condition) throw new Error(message); };

console.log("\nTEQQI OS Phase 11 — Performance Review smoke test");
console.log(`Target app: ${TARGET}\n`);

const dashboardService = await readFile(new URL("../lib/dashboard/service.ts", import.meta.url), "utf8");
const dashboardRoute = await readFile(new URL("../app/api/dashboard/route.ts", import.meta.url), "utf8");
const opportunityPersistence = await readFile(new URL("../lib/website-opportunities/persistence.ts", import.meta.url), "utf8");
const scoringPersistence = await readFile(new URL("../lib/website-scoring/persistence.ts", import.meta.url), "utf8");
const reviewDoc = await readFile(new URL("../docs/phase11-performance-review.md", import.meta.url), "utf8");

assert(dashboardService.includes("GOOGLE_PLACE_DETAIL_CONCURRENCY = 5"), "Dashboard Place Detail concurrency must be explicitly bounded.");
assert(dashboardService.includes("mapWithConcurrency"), "Dashboard must use bounded concurrency for live provider details.");
assert(!dashboardService.includes("Promise.all(references.map"), "Dashboard must not fan out all Google Place Detail requests at once.");
console.log("✓ Dashboard live Google Place Detail requests are concurrency-bounded");

assert(dashboardService.includes("id=in.(${uniqueIds.join(\",\")})"), "Dashboard scoring lookup must target only referenced scoring-run IDs.");
assert(dashboardService.includes("bestOpportunity") && !dashboardService.includes("const sorted = [...result.opportunities].sort"), "Best-opportunity selection must avoid sorting a full copy.");
console.log("✓ Dashboard avoids broad scoring reads and unnecessary opportunity sorting");

for (const required of ["analyzer_version", "scoring_model_version", "opportunity_engine_version", "created_at", "limit: \"250\""]) {
  assert(opportunityPersistence.includes(required), `Audit cache lookup must push ${required} filtering into Supabase.`);
}
assert(opportunityPersistence.includes("new URLSearchParams"), "Audit cache lookup must use a bounded server-side query.");
console.log("✓ Website audit cache lookup pushes TTL/version filtering to Supabase");

assert(scoringPersistence.includes("async function getScoringRun"), "Scoring persistence must expose an internal run-only reader.");
const recoverySection = scoringPersistence.slice(scoringPersistence.indexOf("export async function getRecoverableWebsiteScoringRun"));
assert(recoverySection.includes("getScoringRun(scoringRunId)"), "Recovery must read only the scoring checkpoint it needs.");
assert(!recoverySection.includes("getWebsiteScoringRun(scoringRunId)"), "Recovery must not fetch category rows unnecessarily.");
console.log("✓ Audit checkpoint recovery avoids redundant category-result reads");

assert(dashboardRoute.includes("performance.now()"), "Dashboard route must measure runtime duration.");
assert(dashboardRoute.includes("dashboard.completed") && dashboardRoute.includes("durationMs"), "Dashboard duration must be emitted through structured observability.");
assert(dashboardRoute.includes("X-Request-Id"), "Dashboard performance measurements must remain request-correlated.");
assert(reviewDoc.includes("Deferred optimization") && reviewDoc.includes("canonical-domain"), "Performance review must document the known deferred domain-query optimization.");
console.log("✓ Dashboard runtime is measurable and the remaining scale-dependent optimization is documented");

const requestId = `phase11-performance-${Date.now()}`;
const response = await fetch(`${TARGET}/api/dashboard`, { headers: { "X-Request-Id": requestId } });
const body = await response.json();
assert(response.ok && body?.ok === true, `Dashboard API failed during performance validation: ${JSON.stringify(body)}`);
assert(response.headers.get("x-request-id") === requestId, "Dashboard must preserve the caller correlation ID.");
assert(Number.isFinite(body.performance?.durationMs) && body.performance.durationMs >= 0, "Dashboard must expose a non-negative measured duration.");
assert(Array.isArray(body.dashboard?.businesses), "Performance instrumentation must preserve the dashboard data contract.");
console.log(`✓ Live dashboard contract remains intact with measured duration (${body.performance.durationMs} ms)`);

console.log("\n✅ Phase 11 Performance Review smoke test passed.\n");
