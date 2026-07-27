import { readFile } from "node:fs/promises";

const assert = (condition, message) => { if (!condition) throw new Error(message); };

console.log("\nTEQQI OS Phase 11 — Rate-limit Handling smoke test\n");

const retryModule = await import(new URL("../lib/reliability/rate-limit.ts", import.meta.url));
const { parseRetryAfterMs, retryDelayMs, isRetryableProviderStatus } = retryModule;

assert(parseRetryAfterMs("2", 0) === 2_000, "Retry-After seconds must convert to milliseconds.");
const retryDate = new Date(10_000).toUTCString();
assert(parseRetryAfterMs(retryDate, 5_000) === 5_000, "Retry-After HTTP dates must be honored.");
assert(parseRetryAfterMs("not-a-date", 0) === null, "Invalid Retry-After values must be ignored safely.");
assert(retryDelayMs(0, null, { maxRetries: 2, baseDelayMs: 500, maxDelayMs: 5_000 }) === 500, "First exponential retry delay must be deterministic.");
assert(retryDelayMs(3, null, { maxRetries: 2, baseDelayMs: 1_000, maxDelayMs: 5_000 }) === 5_000, "Retry delay must respect its hard cap.");
assert(retryDelayMs(0, "30", { maxRetries: 2, baseDelayMs: 500, maxDelayMs: 5_000 }) === 5_000, "Long provider Retry-After values must be capped.");
assert(isRetryableProviderStatus(429) && isRetryableProviderStatus(503), "429 and 503 must be retryable provider statuses.");
assert(!isRetryableProviderStatus(400) && !isRetryableProviderStatus(404), "Normal client errors must not be retried.");
console.log("✓ Retry-After parsing, exponential backoff, status selection, and hard delay caps are deterministic");

const googleSource = await readFile(new URL("../lib/business-discovery/google-places.ts", import.meta.url), "utf8");
assert(googleSource.includes("maxRetries: 2"), "Google Places must have a bounded retry count.");
assert(googleSource.includes("retry-after") && googleSource.includes("waitForRetry"), "Google Places must honor Retry-After through the shared policy.");
assert(googleSource.includes("GooglePlacesError") && googleSource.includes("retryAfterMs"), "Google Places exhausted retries must preserve retry metadata.");
console.log("✓ Google Places retries temporary limits before returning structured retry metadata");

const searchRouteSource = await readFile(new URL("../app/api/businesses/search/route.ts", import.meta.url), "utf8");
assert(searchRouteSource.includes("GOOGLE_PLACES_RATE_LIMITED"), "Business search must expose an explicit rate-limit error code.");
assert(searchRouteSource.includes('status: rateLimited ? 503 : 502'), "Exhausted upstream rate limits must surface as temporary service unavailability.");
assert(searchRouteSource.includes('"Retry-After"'), "Business search must return a Retry-After response header when available.");
assert(searchRouteSource.includes("retryable: rateLimited"), "Business search rate-limit responses must tell clients they are retryable.");
console.log("✓ Business Discovery exposes exhausted provider limits as a retryable temporary state");

const pageSpeedSource = await readFile(new URL("../lib/website-analyzer/performance/pagespeed.ts", import.meta.url), "utf8");
assert(pageSpeedSource.includes("PAGESPEED_RATE_LIMIT_POLICY") && pageSpeedSource.includes("maxRetries: 2"), "PageSpeed must use bounded retries.");
assert(pageSpeedSource.includes("remained rate-limited after bounded retries"), "PageSpeed must preserve a clear degraded reason after retries are exhausted.");
assert(pageSpeedSource.includes("unavailablePerformance"), "PageSpeed rate limits must degrade performance evidence rather than crash the entire analyzer.");
console.log("✓ PageSpeed rate limits retry boundedly and degrade to unavailable performance evidence safely");

const websiteFetchSource = await readFile(new URL("../lib/website-analyzer/fetch.ts", import.meta.url), "utf8");
assert(websiteFetchSource.includes("TARGET_RATE_LIMIT_POLICY") && websiteFetchSource.includes("maxRetries: 1"), "Target websites must receive at most one rate-limit retry.");
assert(websiteFetchSource.includes('response.status !== 429'), "Target-site retries must be limited specifically to HTTP 429.");
assert(websiteFetchSource.includes('"FETCH_RATE_LIMITED"'), "Exhausted target-site throttling must become an explicit analyzer failure.");
console.log("✓ Target websites receive one polite 429 retry and then a controlled analyzer failure");

const analyzerTypesSource = await readFile(new URL("../lib/website-analyzer/types.ts", import.meta.url), "utf8");
assert(analyzerTypesSource.includes('"FETCH_RATE_LIMITED"'), "Analyzer contracts must include the rate-limit failure code.");
console.log("✓ Rate-limit failure semantics are part of the typed analyzer contract");

console.log("\n✅ Phase 11 Rate-limit Handling smoke test passed.\n");
