import { readFile } from "node:fs/promises";

const TARGET = process.env.TEQQI_APP_URL ?? "http://localhost:3000";
const assert = (condition, message) => { if (!condition) throw new Error(message); };

console.log("\nTEQQI OS Phase 11 — Deployment Readiness smoke test");
console.log(`Target app: ${TARGET}\n`);

const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const packageLock = JSON.parse(await readFile(new URL("../package-lock.json", import.meta.url), "utf8"));
const envExample = await readFile(new URL("../.env.example", import.meta.url), "utf8");
const envModule = await readFile(new URL("../lib/env/server.ts", import.meta.url), "utf8");
const checklist = await readFile(new URL("../docs/phase11-deployment-checklist.md", import.meta.url), "utf8");

assert(packageJson.dependencies?.next === "16.2.11", "Deployment must use the reviewed Next.js 16.2.11 release.");
assert(packageLock.packages?.[""]?.dependencies?.next === packageJson.dependencies.next, "package-lock.json must match package.json Next.js version.");
assert(packageLock.packages?.[""]?.devDependencies?.["eslint-config-next"] === packageJson.devDependencies?.["eslint-config-next"], "package-lock.json must match package.json eslint-config-next version.");
console.log("✓ package.json and package-lock.json agree on the reviewed framework versions");

for (const required of ["SUPABASE_URL", "SUPABASE_SECRET_KEY", "GOOGLE_PLACES_API_KEY"]) {
  assert(envExample.includes(`${required}=`), `.env.example must document ${required}.`);
  assert(envModule.includes(`requireServerEnv(\"${required}\")`), `${required} must be loaded through the server-only environment module.`);
}
assert(envModule.includes('import "server-only"'), "Environment access must remain server-only.");
assert(!envExample.includes("NEXT_PUBLIC_SUPABASE_SECRET") && !envExample.includes("NEXT_PUBLIC_GOOGLE_PLACES"), "Secrets must not be documented as NEXT_PUBLIC values.");
console.log("✓ Required deployment credentials are documented and remain server-only");

for (const phrase of [
  "npm ci",
  "Access-control boundary",
  "Rollback plan",
  "Post-deploy verification",
  "/api/health/supabase",
  "/api/health/monitoring",
  "TEQQI_APP_URL",
]) {
  assert(checklist.includes(phrase), `Deployment checklist must include ${phrase}.`);
}
console.log("✓ Deployment checklist covers reproducible installs, access control, health checks, rollback, and post-deploy verification");

const rootResponse = await fetch(`${TARGET}/`, { redirect: "manual" });
assert(rootResponse.ok, `Application root must be reachable; received ${rootResponse.status}.`);
assert(rootResponse.headers.get("x-content-type-options")?.toLowerCase() === "nosniff", "Live application must expose the security-header baseline.");
assert(rootResponse.headers.get("x-frame-options")?.toUpperCase() === "DENY", "Live application must prevent framing.");
console.log("✓ Production-style application response is reachable with the approved security headers");

const supabaseResponse = await fetch(`${TARGET}/api/health/supabase`);
const supabaseBody = await supabaseResponse.json().catch(() => null);
assert(supabaseResponse.ok && supabaseBody?.ok === true, `Supabase health check failed: ${JSON.stringify(supabaseBody)}`);
assert(Boolean(supabaseResponse.headers.get("x-request-id")), "Supabase health response must include X-Request-Id.");
console.log("✓ Supabase production dependency reports healthy with request correlation");

const monitoringResponse = await fetch(`${TARGET}/api/health/monitoring`);
const monitoringBody = await monitoringResponse.json().catch(() => null);
assert(monitoringResponse.ok && monitoringBody?.ok === true, `Monitoring health check failed: ${JSON.stringify(monitoringBody)}`);
assert(["HEALTHY", "DEGRADED"].includes(monitoringBody?.monitoring?.status), "Monitoring must expose a recognized operational status.");
assert(Boolean(monitoringResponse.headers.get("x-request-id")), "Monitoring response must include X-Request-Id.");
console.log(`✓ Operational monitoring is reachable (${monitoringBody.monitoring.status}) with request correlation`);

const dashboardResponse = await fetch(`${TARGET}/api/dashboard`);
const dashboardBody = await dashboardResponse.json().catch(() => null);
assert(dashboardResponse.ok && dashboardBody?.ok === true, `Dashboard release check failed: ${JSON.stringify(dashboardBody)}`);
assert(typeof dashboardBody?.performance?.durationMs === "number", "Dashboard release check must expose measured duration.");
assert(dashboardBody?.dashboard?.dataNotes?.googlePlaceContentPersisted === false, "Deployment must preserve the Google Place live-content boundary.");
assert(dashboardBody?.dashboard?.dataNotes?.leadScoreStatus === "UNAVAILABLE_UNTIL_BUSINESS_LEVEL_MODEL_EXISTS", "Deployment must preserve the deferred commercial Lead Score boundary.");
console.log("✓ Dashboard release contract is live, measured, and preserves provider/Lead Score boundaries");

console.log("\n✅ Phase 11 Deployment Readiness smoke test passed.\n");
