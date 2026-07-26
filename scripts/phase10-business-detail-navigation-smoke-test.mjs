import { readFile } from "node:fs/promises";

const TARGET = process.env.TEQQI_APP_URL ?? "http://localhost:3000";
const assert = (condition, message) => { if (!condition) throw new Error(message); };

console.log("\nTEQQI OS Phase 10 — Business Detail API & Dashboard Navigation smoke test");
console.log(`Target app: ${TARGET}\n`);

const dashboardResponse = await fetch(`${TARGET}/api/dashboard`);
const dashboardBody = await dashboardResponse.json();
assert(dashboardResponse.ok && dashboardBody.ok === true, `Dashboard API failed: ${JSON.stringify(dashboardBody)}`);
const candidate = dashboardBody.dashboard.rankedBusinesses?.[0] ?? dashboardBody.dashboard.tableView?.rows?.[0];
assert(candidate?.externalId, "A discovered business is required for the Phase 10 navigation test.");

const detailApiResponse = await fetch(`${TARGET}/api/businesses/${encodeURIComponent(candidate.externalId)}`);
const detailApiBody = await detailApiResponse.json();
assert(detailApiResponse.ok && detailApiBody.ok === true, `Business detail API failed: ${JSON.stringify(detailApiBody)}`);
assert(detailApiBody.detail.externalId === candidate.externalId, "Business detail API must resolve the requested dashboard business.");
assert(detailApiBody.detail.business.name, "Business detail API must expose live business identity.");
console.log("✓ Dashboard business IDs resolve through the Phase 10 business-detail API");

const pageResponse = await fetch(`${TARGET}/businesses/${encodeURIComponent(candidate.externalId)}`);
const pageHtml = await pageResponse.text();
assert(pageResponse.ok, `Business detail page failed with ${pageResponse.status}.`);
assert(pageHtml.includes("Business intelligence detail"), "Business detail route must render the Phase 10 detail shell.");
assert(pageHtml.includes("Back to dashboard"), "Business detail page must provide navigation back to the dashboard.");
assert(pageHtml.includes(detailApiBody.detail.business.name), "Business detail page must render the resolved business name.");
console.log("✓ Business detail route renders server-side from the same traceable detail contract");

const dashboardSource = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
assert(dashboardSource.includes("/businesses/${encodeURIComponent(row.externalId)}"), "Ranked business rows must link to their Phase 10 detail route.");
assert(dashboardSource.includes("View details"), "Dashboard must expose an explicit business-detail action.");
console.log("✓ Ranked dashboard businesses link directly into their matching detail pages");

assert(detailApiBody.detail.dataNotes.googlePlaceContentPersisted === false, "Business detail navigation must preserve Google Places storage boundaries.");
assert(detailApiBody.detail.leadScore.available === false && detailApiBody.detail.leadScore.score === null, "Business detail navigation must not fabricate Lead Score.");
console.log("✓ Navigation preserves live Google data boundaries and the deferred Lead Score boundary");

console.log("\nPhase 10 Business Detail API & Dashboard Navigation smoke test passed.\n");
