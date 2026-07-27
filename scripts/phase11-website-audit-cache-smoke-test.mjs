const TARGET = process.env.TEQQI_APP_URL ?? "http://localhost:3000";
const assert = (condition, message) => { if (!condition) throw new Error(message); };

async function runAudit(url, forceRefresh = false) {
  const response = await fetch(`${TARGET}/api/websites/opportunities`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, ...(forceRefresh ? { forceRefresh: true } : {}) }),
  });
  const body = await response.json();
  assert(response.ok && body.ok === true, `Website audit request failed: ${JSON.stringify(body)}`);
  return body;
}

console.log("\nTEQQI OS Phase 11 — Website Audit Caching smoke test");
console.log(`Target app: ${TARGET}\n`);

const dashboardResponse = await fetch(`${TARGET}/api/dashboard`);
const dashboardBody = await dashboardResponse.json();
assert(dashboardResponse.ok && dashboardBody.ok === true, `Dashboard API failed: ${JSON.stringify(dashboardBody)}`);
const candidate = dashboardBody.dashboard.rankedBusinesses.find((row) => row.websiteUrl);
assert(candidate?.websiteUrl, "A discovered business with a website is required for the Phase 11 audit-cache test.");

const seeded = await runAudit(candidate.websiteUrl, true);
assert(seeded.cache?.hit === false, "Forced seed audit must not be a cache hit.");
assert(seeded.persistence?.stored === true, "Forced seed audit must persist a new immutable run.");
console.log("✓ Forced audit creates a fresh immutable Analyze → Score → Opportunities run chain");

const cached = await runAudit(candidate.websiteUrl);
assert(cached.cache?.hit === true, "Immediate compatible audit request should reuse the recent audit.");
assert(cached.cache?.versionCompatible === true, "Cache hit must be compatible with active analyzer/scoring/opportunity versions.");
assert(cached.persistence?.stored === false, "Cache hit must not persist duplicate audit runs.");
assert(cached.scoringRunId === seeded.scoringRunId, "Cached audit must reuse the seeded scoring run.");
assert(cached.opportunityRunId === seeded.opportunityRunId, "Cached audit must reuse the seeded opportunity run.");
assert(cached.opportunityResult?.opportunityEngineVersion === seeded.opportunityResult?.opportunityEngineVersion, "Cached opportunity engine version must remain reproducible.");
assert(cached.scoring?.scoringModelVersion === seeded.scoring?.scoringModelVersion, "Cached scoring model version must remain reproducible.");
console.log("✓ Compatible audits within the 24-hour window reuse exact scoring/opportunity runs without rerunning analysis");

const refreshed = await runAudit(candidate.websiteUrl, true);
assert(refreshed.cache?.hit === false && refreshed.cache?.forceRefresh === true, "Manual force refresh must bypass the audit cache.");
assert(refreshed.persistence?.stored === true, "Forced refresh must persist a new immutable run.");
assert(refreshed.scoringRunId !== cached.scoringRunId, "Forced refresh must create a new scoring run.");
assert(refreshed.opportunityRunId !== cached.opportunityRunId, "Forced refresh must create a new opportunity run.");
console.log("✓ Manual refresh bypasses caching and produces a new immutable audit chain");

assert(cached.cache.ttlMs === 24 * 60 * 60 * 1000, "Website audit cache TTL must remain explicit at 24 hours.");
console.log("✓ Cache policy is explicit, version-aware, and bounded to 24 hours");

console.log("\n✅ Phase 11 Website Audit Caching smoke test passed.\n");
