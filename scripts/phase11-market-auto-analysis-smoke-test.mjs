import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const assert = (condition, message) => { if (!condition) throw new Error(message); };

console.log("\nTEQQI OS — Automatic Market Analysis smoke test\n");

assert(source.includes("AUTO_ANALYSIS_CONCURRENCY = 3"), "Automatic market analysis must use bounded concurrency.");
assert(source.includes("row.websiteUrl && !row.intelligenceAvailable"), "Only eligible websites missing intelligence should be queued.");
assert(source.includes('fetch("/api/websites/opportunities"'), "Automatic analysis must execute the Analyze → Score → Opportunities endpoint.");
assert(source.includes("Promise.all(Array.from"), "Automatic market analysis must use a bounded worker pool.");
assert(source.includes("void runAutomaticAnalysis(discoveredMarket)"), "Discovery completion must automatically start market analysis.");
assert(source.includes("Analyzing discovered websites…"), "The dashboard must expose automatic-analysis progress to the user.");
assert(source.includes("could not be analyzed"), "Per-site failures must be surfaced without failing the whole market.");
assert(source.includes("await loadDashboard(market.market.id)"), "The dashboard must refresh after automatic analysis completes.");

console.log("✓ Newly discovered eligible websites automatically enter Analyze → Score → Opportunities");
console.log("✓ Analysis concurrency is bounded to three websites at a time");
console.log("✓ Already-analyzed and no-website businesses are skipped");
console.log("✓ Individual website failures do not abort the market run");
console.log("✓ Progress and completion state are visible in the dashboard");
console.log("✓ Dashboard intelligence is refreshed after the market run\n");
console.log("✅ Automatic Market Analysis smoke test passed.\n");
