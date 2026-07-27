const TARGET = process.env.TEQQI_APP_URL ?? "http://localhost:3000";
const assert = (condition, message) => { if (!condition) throw new Error(message); };

async function postSearch(payload) {
  const response = await fetch(`${TARGET}/api/businesses/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await response.json().catch(() => null);
  return { response, body };
}

console.log("\nTEQQI OS Phase 11 — Business Search Caching smoke test");
console.log(`Target app: ${TARGET}\n`);

const dashboardResponse = await fetch(`${TARGET}/api/dashboard`);
const dashboardBody = await dashboardResponse.json();
assert(dashboardResponse.ok && dashboardBody.ok === true, `Dashboard API failed: ${JSON.stringify(dashboardBody)}`);

const market = dashboardBody.dashboard?.market;
assert(market?.industry && market?.location, "An existing dashboard market is required for the cache smoke test.");

const input = { industry: market.industry, location: market.location, maxResults: 1 };

const fresh = await postSearch({ ...input, reuseRecent: false });
assert(fresh.response.ok && fresh.body?.ok === true, `Fresh search failed: ${JSON.stringify(fresh.body)}`);
assert(fresh.body.discovery?.mode === "NEW_RESULTS_ONLY", "Explicit cache bypass must preserve NEW_RESULTS_ONLY discovery semantics.");
assert(fresh.body.cache?.hit === false, "Explicit cache bypass must not report a cache hit.");
assert(typeof fresh.body.searchId === "string", "Fresh search must return a persisted search ID.");
console.log("✓ Explicit cache bypass preserves Phase 5 NEW_RESULTS_ONLY behavior");

const cached = await postSearch({ ...input, reuseRecent: true });
assert(cached.response.ok && cached.body?.ok === true, `Cached search failed: ${JSON.stringify(cached.body)}`);
assert(cached.body.cache?.hit === true, "Identical recent search should report a cache hit.");
assert(cached.body.discovery?.mode === "RECENT_SEARCH_REUSE", "Cache hit must use RECENT_SEARCH_REUSE mode.");
assert(cached.body.searchId === fresh.body.searchId, "Cached search must reuse the exact completed search record instead of creating a duplicate.");
assert(cached.body.persistence?.reusedExistingSearch === true, "Cache hit must explicitly report persisted search reuse.");
assert(cached.body.persistence?.googlePlaceContentPersisted === false, "Caching must not persist Google Place business content.");
console.log("✓ Identical searches within the cache window reuse the persisted search ID without rerunning discovery");
console.log("✓ Google Place content remains live-only while search inputs and Place-ID references are reusable");

const historyResponse = await fetch(`${TARGET}/api/businesses/search/history?limit=100`);
const historyBody = await historyResponse.json();
assert(historyResponse.ok && historyBody.ok === true, `Search history failed: ${JSON.stringify(historyBody)}`);
const reusedRows = historyBody.searches.filter((row) => row.id === fresh.body.searchId);
assert(reusedRows.length === 1, "Cache reuse must not create a duplicate search-history row.");
console.log("✓ Cache hits avoid duplicate search-history executions");

console.log("\n✅ Phase 11 Business Search Caching smoke test passed.\n");
