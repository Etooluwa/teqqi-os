const baseUrl = process.env.TEQQI_BASE_URL ?? "http://localhost:3000";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function jsonRequest(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const body = await response.json().catch(() => null);
  return { response, body };
}

async function postSearch(payload) {
  return jsonRequest("/api/businesses/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

async function run() {
  const checks = [];
  const pass = (name) => {
    checks.push({ name, status: "PASS" });
    console.log(`✓ ${name}`);
  };

  console.log(`\nTEQQI OS Phase 5 smoke test\nTarget: ${baseUrl}\n`);

  // 1. Supabase health.
  {
    const { response, body } = await jsonRequest("/api/health/supabase");
    assert(response.ok && body?.ok === true, "Supabase health check failed.");
    pass("Supabase connection");
  }

  // 2. Missing required input should be rejected without creating a provider search.
  {
    const { response, body } = await postSearch({ industry: "", location: "Ottawa", maxResults: 5 });
    assert(response.status === 400, `Expected 400 for missing industry, got ${response.status}.`);
    assert(body?.error?.code === "VALIDATION_ERROR", "Expected VALIDATION_ERROR for missing industry.");
    pass("Missing industry validation");
  }

  // 3. Invalid max results should be rejected.
  {
    const { response, body } = await postSearch({ industry: "Dentists", location: "Ottawa", maxResults: 61 });
    assert(response.status === 400, `Expected 400 for maxResults=61, got ${response.status}.`);
    assert(body?.error?.code === "VALIDATION_ERROR", "Expected VALIDATION_ERROR for invalid maxResults.");
    pass("Maximum-results validation");
  }

  // 4. Execute a real one-result discovery search.
  const first = await postSearch({ industry: "Dentists", location: "Ottawa", maxResults: 1 });
  assert(first.response.ok && first.body?.ok === true, "First discovery search failed.");
  assert(first.body?.discovery?.mode === "NEW_RESULTS_ONLY", "Search is not in NEW_RESULTS_ONLY mode.");
  assert(typeof first.body?.searchId === "string", "Search did not return a searchId.");
  assert(Array.isArray(first.body?.results), "Search results are not an array.");
  pass("Real Google Places discovery search");

  // 5. A second search must not repeat the first Place ID when both searches return a result.
  const second = await postSearch({ industry: "Dentists", location: "Ottawa", maxResults: 1 });
  assert(second.response.ok && second.body?.ok === true, "Second discovery search failed.");

  const firstId = first.body?.results?.[0]?.externalId;
  const secondId = second.body?.results?.[0]?.externalId;
  if (firstId && secondId) {
    assert(firstId !== secondId, "New-results-only check failed: repeated Google Place ID returned.");
  }
  pass("Previously discovered Place IDs excluded from new searches");

  // 6. Historical search can be reopened using stored Place IDs.
  {
    const { response, body } = await jsonRequest(`/api/businesses/search/${first.body.searchId}`);
    assert(response.ok && body?.ok === true, "Historical search retrieval failed.");
    assert(body?.search?.id === first.body.searchId, "Historical search returned the wrong search record.");
    assert(Array.isArray(body?.results), "Historical search results are not an array.");
    pass("Historical search retrieval");
  }

  // 7. Search-history endpoint is available.
  {
    const { response, body } = await jsonRequest("/api/businesses/search/history");
    assert(response.ok && body?.ok === true, "Search-history endpoint failed.");
    assert(Array.isArray(body?.searches), "Search history is not an array.");
    assert(body.searches.some((item) => item.id === first.body.searchId), "New search was not found in search history.");
    pass("Search-history persistence");
  }

  // 8. Optional provider fields must be nullable without breaking the UI/API contract.
  for (const result of [...(first.body?.results ?? []), ...(second.body?.results ?? [])]) {
    for (const key of ["websiteUrl", "phone", "formattedAddress", "rating"]) {
      assert(result[key] === null || result[key] !== undefined, `Optional field ${key} is missing from the response contract.`);
    }
  }
  pass("Optional-field response contract");

  console.log(`\n${checks.length} Phase 5 smoke checks passed.\n`);
  console.log("Note: this test creates development search-history/Place-ID records. They should be cleared before production use.");
}

run().catch((error) => {
  console.error("\n✗ Phase 5 smoke test failed");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
