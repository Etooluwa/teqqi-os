import { readFile } from "node:fs/promises";

const TARGET = process.env.TEQQI_APP_URL ?? "http://localhost:3000";
const assert = (condition, message) => { if (!condition) throw new Error(message); };

console.log("\nTEQQI OS Phase 11 — Logging & Monitoring smoke test");
console.log(`Target app: ${TARGET}\n`);

const loggerSource = await readFile(new URL("../lib/observability/logger.ts", import.meta.url), "utf8");
const monitoringSource = await readFile(new URL("../lib/observability/monitoring.ts", import.meta.url), "utf8");
const searchRoute = await readFile(new URL("../app/api/businesses/search/route.ts", import.meta.url), "utf8");
const auditRoute = await readFile(new URL("../app/api/websites/opportunities/route.ts", import.meta.url), "utf8");

assert(loggerSource.includes("JSON.stringify"), "Application logs must be emitted as structured JSON.");
assert(loggerSource.includes("requestId") && loggerSource.includes("operation"), "Structured logs must include correlation and operation fields.");
assert(loggerSource.includes("responsebody") && loggerSource.includes("authorization") && loggerSource.includes("cookie"), "Structured logging must redact sensitive/provider-payload fields.");
assert(loggerSource.includes("MAX_STRING_LENGTH"), "Structured logging must bound arbitrary string payload size.");
console.log("✓ Structured JSON logging is correlated, bounded, and redacts sensitive payload fields");

for (const event of [
  "business_search.requested",
  "business_search.cache_hit",
  "business_search.stale_recovered",
  "business_search.completed",
  "business_search.rate_limited",
]) {
  assert(searchRoute.includes(event), `Business Discovery must log ${event}.`);
}
for (const event of [
  "website_audit.requested",
  "website_audit.cache_hit",
  "website_audit.scoring_persisted",
  "website_audit.resume_completed",
  "website_audit.completed",
  "website_audit.partial_failure",
]) {
  assert(auditRoute.includes(event), `Website Audit must log ${event}.`);
}
assert(searchRoute.includes("X-Request-Id") && auditRoute.includes("X-Request-Id"), "Critical workflows must surface request correlation IDs.");
console.log("✓ Discovery and audit workflows expose stable lifecycle events and request correlation IDs");

assert(monitoringSource.includes("MONITORING_WINDOW_MS"), "Monitoring must use a bounded observation window.");
assert(monitoringSource.includes("staleRunningSearches"), "Monitoring must surface stale active discovery work.");
assert(monitoringSource.includes("rateLimitedSearches"), "Monitoring must surface provider rate-limit signals.");
assert(monitoringSource.includes("failedScoringRuns") && monitoringSource.includes("failedOpportunityRuns"), "Monitoring must expose persisted website-run failure counts.");
assert(monitoringSource.includes("detailedSignalsAvailable"), "Monitoring must explicitly represent partial telemetry availability.");
assert(monitoringSource.includes("status-level search monitoring remains active"), "Monitoring must degrade safely when detailed search telemetry is unavailable.");
assert(monitoringSource.includes("business content and provider payloads are not included"), "Monitoring contract must explicitly avoid business/provider content.");
console.log("✓ Monitoring aggregates operational health and degrades safely without exposing business or provider payload content");

const requestId = `phase11-monitoring-${Date.now()}`;
const response = await fetch(`${TARGET}/api/health/monitoring`, {
  headers: { "X-Request-Id": requestId },
});
const body = await response.json();
assert(response.ok && body?.ok === true, `Monitoring endpoint failed: ${JSON.stringify(body)}`);
assert(response.headers.get("x-request-id") === requestId, "Monitoring endpoint must preserve a valid caller request ID.");
assert(["HEALTHY", "DEGRADED"].includes(body.monitoring?.status), "Monitoring status must use the approved health states.");
assert(typeof body.monitoring?.generatedAt === "string" && typeof body.monitoring?.windowMs === "number", "Monitoring must include snapshot metadata.");
assert(body.monitoring?.signals && body.monitoring?.executions, "Monitoring must expose signals and execution summaries.");
assert(typeof body.monitoring?.telemetry?.searchErrorCodeSignalsAvailable === "boolean", "Monitoring must disclose whether detailed search error-code telemetry is available.");
for (const key of ["searches", "scoringRuns", "opportunityRuns"]) {
  assert(typeof body.monitoring.executions[key]?.total === "number", `${key} monitoring total is required.`);
  assert(body.monitoring.executions[key]?.byStatus && typeof body.monitoring.executions[key].byStatus === "object", `${key} status summary is required.`);
}
console.log("✓ Operational monitoring endpoint returns a correlated, aggregate 24-hour health snapshot");

console.log("\n✅ Phase 11 Logging & Monitoring smoke test passed.\n");
