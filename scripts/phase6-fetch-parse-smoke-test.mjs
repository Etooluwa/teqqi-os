const baseUrl = process.env.TEQQI_OS_BASE_URL ?? "http://localhost:3000";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function post(url) {
  const response = await fetch(`${baseUrl}/api/websites/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  const data = await response.json();
  return { response, data };
}

async function run() {
  console.log("\nTEQQI OS Phase 6 — Fetch & Parse smoke test");
  console.log(`Target: ${baseUrl}\n`);

  {
    const { response, data } = await post("https://www.wikipedia.org/");
    assert(response.ok, `Public HTML fetch should succeed: HTTP ${response.status} ${JSON.stringify(data)}`);
    assert(data.ok === true, "Expected ok=true.");
    assert(data.implementationStage === "FETCH_AND_PARSE", "Expected FETCH_AND_PARSE stage.");
    assert(data.fetch?.status >= 200 && data.fetch?.status < 600, "Expected HTTP status metadata.");
    assert(typeof data.fetch?.byteLength === "number" && data.fetch.byteLength > 0, "Expected non-empty HTML response.");
    assert(typeof data.pageFacts === "object", "Expected pageFacts object.");
    assert(data.pageFacts.parser === "CHEERIO_PARSE5", "Expected standards-based Cheerio/parse5 parser.");
    assert(typeof data.pageFacts.document?.hasHtml === "boolean", "Expected normalized document-structure facts.");
    assert(Array.isArray(data.pageFacts.headings), "Expected normalized heading facts.");
    assert(Array.isArray(data.pageFacts.h1Texts), "Expected H1 compatibility facts.");
    assert(Array.isArray(data.pageFacts.links), "Expected link facts.");
    assert(Array.isArray(data.pageFacts.images), "Expected image facts.");
    assert(Array.isArray(data.pageFacts.forms), "Expected form facts.");
    assert(typeof data.pageFacts.landmarks?.navCount === "number", "Expected semantic landmark facts.");
    assert(typeof data.pageFacts.bodyTextWordCount === "number", "Expected body text metrics.");
    console.log("✓ Standards-based DOM parsing and hardened shared fact extraction");
  }

  {
    const { response, data } = await post("https://www.google.com/robots.txt");
    assert(response.status === 415, `Non-HTML response should return 415, got ${response.status}.`);
    assert(data.error?.code === "UNSUPPORTED_CONTENT_TYPE", "Expected UNSUPPORTED_CONTENT_TYPE.");
    console.log("✓ Non-HTML content rejection");
  }

  console.log("\n2 Phase 6 fetch/parse smoke checks passed.\n");
}

run().catch((error) => {
  console.error("\nPhase 6 fetch/parse smoke test failed:");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
