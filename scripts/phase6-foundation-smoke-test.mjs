const baseUrl = process.env.TEQQI_OS_BASE_URL ?? "http://localhost:3000";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function post(body) {
  const response = await fetch(`${baseUrl}/api/websites/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = await response.json();
  return { response, data };
}

async function run() {
  console.log("\nTEQQI OS Phase 6 — Analyzer Foundation smoke test");
  console.log(`Target: ${baseUrl}\n`);

  {
    const { response, data } = await post({});
    assert(response.status === 400, "Missing URL should return 400.");
    assert(data.error?.code === "INVALID_REQUEST", "Missing URL should return INVALID_REQUEST.");
    console.log("✓ Missing URL validation");
  }

  {
    const { response, data } = await post({ url: "ftp://example.com" });
    assert(response.status === 400, "Unsupported protocol should return 400.");
    assert(data.error?.code === "UNSUPPORTED_PROTOCOL", "Expected UNSUPPORTED_PROTOCOL.");
    console.log("✓ Unsupported protocol rejection");
  }

  {
    const { response, data } = await post({ url: "http://localhost:3000" });
    assert(response.status === 400, "Localhost should return 400.");
    assert(data.error?.code === "UNSAFE_HOST", "Expected UNSAFE_HOST.");
    console.log("✓ Local/internal hostname rejection");
  }

  {
    const { response, data } = await post({ url: "http://127.0.0.1" });
    assert(response.status === 400, "Loopback IP should return 400.");
    assert(data.error?.code === "UNSAFE_RESOLVED_ADDRESS", "Expected UNSAFE_RESOLVED_ADDRESS.");
    console.log("✓ Loopback IP rejection");
  }

  {
    const { response, data } = await post({ url: "google.com" });
    assert(
      response.ok,
      `Public URL should succeed, received HTTP ${response.status}: ${JSON.stringify(data)}`,
    );
    assert(data.ok === true, "Public URL should return ok=true.");
    assert(data.analyzerVersion === "1.0.0", "Analyzer version should be 1.0.0.");
    assert(data.target?.normalizedUrl === "https://google.com/", "Bare hostname should normalize to HTTPS.");
    assert(
      String(data.implementationStage).startsWith("TECHNICAL_HEALTH_BATCH_"),
      "Validated public URL should continue into Technical Health analysis.",
    );
    console.log("✓ Public URL validation and normalization");
  }

  console.log("\n5 Phase 6 foundation smoke checks passed.\n");
}

run().catch((error) => {
  console.error("\nPhase 6 foundation smoke test failed:");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
