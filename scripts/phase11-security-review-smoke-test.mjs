import { readFile } from "node:fs/promises";

const TARGET = process.env.TEQQI_APP_URL ?? "http://localhost:3000";
const assert = (condition, message) => { if (!condition) throw new Error(message); };

console.log("\nTEQQI OS Phase 11 — Security Review smoke test");
console.log(`Target app: ${TARGET}\n`);

const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const nextConfig = await readFile(new URL("../next.config.ts", import.meta.url), "utf8");
const envSource = await readFile(new URL("../lib/env/server.ts", import.meta.url), "utf8");
const urlSource = await readFile(new URL("../lib/website-analyzer/url.ts", import.meta.url), "utf8");
const fetchSource = await readFile(new URL("../lib/website-analyzer/fetch.ts", import.meta.url), "utf8");

assert(packageJson.dependencies?.next === "16.2.11", "Next.js must be pinned to the patched 16.2.11 security release.");
assert(packageJson.devDependencies?.["eslint-config-next"] === "16.2.11", "eslint-config-next must stay aligned with Next.js.");
console.log("✓ Next.js is pinned to the patched 16.2.11 release");

for (const header of [
  "X-Content-Type-Options",
  "X-Frame-Options",
  "Referrer-Policy",
  "Permissions-Policy",
  "X-Permitted-Cross-Domain-Policies",
]) {
  assert(nextConfig.includes(header), `Missing security header: ${header}`);
}
console.log("✓ Default browser-security headers are configured globally");

assert(envSource.includes('import "server-only"'), "Secret environment access must remain server-only.");
assert(envSource.includes("SUPABASE_SECRET_KEY") && envSource.includes("GOOGLE_PLACES_API_KEY"), "Server secret boundaries must remain explicit.");
assert(!envSource.includes("NEXT_PUBLIC_SUPABASE_SECRET_KEY") && !envSource.includes("NEXT_PUBLIC_GOOGLE_PLACES_API_KEY"), "Server secrets must never use NEXT_PUBLIC names.");
console.log("✓ Supabase and provider credentials remain server-only");

for (const marker of [
  "UNSAFE_HOST",
  "UNSAFE_RESOLVED_ADDRESS",
  "URL_CREDENTIALS_NOT_ALLOWED",
  "127.0.0.0",
  "169.254.0.0",
  "192.168.0.0",
  "::1",
]) {
  assert(urlSource.includes(marker), `Website target validation is missing ${marker}.`);
}
assert(fetchSource.includes('redirect: "manual"'), "Redirects must be followed manually so every hop can be revalidated.");
assert(fetchSource.includes("validateWebsiteUrl(nextUrl)"), "Every redirect target must be revalidated before fetching.");
assert(fetchSource.includes("MAX_REDIRECTS = 5"), "Redirect traversal must stay bounded.");
assert(fetchSource.includes("MAX_RESPONSE_BYTES = 2_000_000"), "Website response bodies must stay size-bounded.");
assert(fetchSource.includes("FETCH_TIMEOUT_MS = 10_000"), "Website fetches must stay time-bounded.");
console.log("✓ Website auditing preserves SSRF, redirect, response-size, and timeout protections");

const response = await fetch(`${TARGET}/`);
assert(response.ok, `Application root failed during security-header verification (${response.status}).`);
assert(response.headers.get("x-content-type-options") === "nosniff", "Live responses must include X-Content-Type-Options: nosniff.");
assert(response.headers.get("x-frame-options") === "DENY", "Live responses must block framing.");
assert(response.headers.get("referrer-policy") === "strict-origin-when-cross-origin", "Live responses must expose the approved referrer policy.");
assert(response.headers.get("permissions-policy")?.includes("camera=()"), "Live responses must expose the restrictive permissions policy.");
console.log("✓ Live application responses expose the approved security-header baseline");

console.log("\n✅ Phase 11 Security Review smoke test passed.\n");
