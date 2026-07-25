const TARGET = process.env.TEQQI_APP_URL ?? "http://localhost:3000";
const assert = (condition, message) => { if (!condition) throw new Error(message); };

async function getDashboard(query = "") {
  const response = await fetch(`${TARGET}/api/dashboard${query ? `?${query}` : ""}`);
  const body = await response.json();
  return { response, body };
}

console.log("\nTEQQI OS Phase 9 — Filters & Sorting smoke test");
console.log(`Target app: ${TARGET}\n`);

const base = await getDashboard();
assert(base.response.ok && base.body.ok === true, `Dashboard API failed: ${JSON.stringify(base.body)}`);
const dashboard = base.body.dashboard;
const allRows = dashboard.rankedBusinesses;
const defaultView = dashboard.tableView;
assert(defaultView.totalRows === allRows.length && defaultView.filteredRows === allRows.length, "Default view must include every ranked row.");
assert(defaultView.filters.analysis === "ALL" && defaultView.filters.sort === "RANK", "Default filters/sort must be explicit.");
console.log("✓ Default table view preserves the ranked business list and exposes active controls");

const analyzed = await getDashboard("analysis=ANALYZED");
assert(analyzed.response.ok, "Analyzed filter request failed.");
assert(analyzed.body.dashboard.tableView.rows.every((row) => row.intelligenceAvailable), "ANALYZED filter returned an unanalyzed row.");
const notAnalyzed = await getDashboard("analysis=NOT_ANALYZED");
assert(notAnalyzed.response.ok, "Not-analyzed filter request failed.");
assert(notAnalyzed.body.dashboard.tableView.rows.every((row) => !row.intelligenceAvailable), "NOT_ANALYZED filter returned an analyzed row.");
const hasWebsite = await getDashboard("analysis=HAS_WEBSITE");
assert(hasWebsite.body.dashboard.tableView.rows.every((row) => Boolean(row.websiteUrl)), "HAS_WEBSITE filter returned a row without a website.");
console.log("✓ Analysis and website-availability filters are deterministic");

const evidenceRow = allRows.find((row) => row.bestOpportunity);
if (evidenceRow) {
  const priority = await getDashboard(`priority=${evidenceRow.bestOpportunity.priority}`);
  assert(priority.body.dashboard.tableView.rows.every((row) => row.bestOpportunity?.priority === evidenceRow.bestOpportunity.priority), "Priority filter mismatch.");
  const confidence = await getDashboard(`confidence=${evidenceRow.bestOpportunity.confidence}`);
  assert(confidence.body.dashboard.tableView.rows.every((row) => row.bestOpportunity?.confidence === evidenceRow.bestOpportunity.confidence), "Confidence filter mismatch.");
  const service = await getDashboard(`service=${evidenceRow.bestOpportunity.recommendedService}`);
  assert(service.body.dashboard.tableView.rows.every((row) => row.bestOpportunity?.recommendedService === evidenceRow.bestOpportunity.recommendedService), "Service filter mismatch.");
}
console.log("✓ Priority, confidence, and recommended-service filters respect opportunity evidence");

const scoredRows = allRows.filter((row) => typeof row.websiteScore === "number");
if (scoredRows.length > 0) {
  const threshold = scoredRows[0].websiteScore;
  const min = await getDashboard(`minScore=${threshold}`);
  assert(min.body.dashboard.tableView.rows.every((row) => typeof row.websiteScore === "number" && row.websiteScore >= threshold), "Minimum score filter mismatch.");
  const max = await getDashboard(`maxScore=${threshold}`);
  assert(max.body.dashboard.tableView.rows.every((row) => typeof row.websiteScore === "number" && row.websiteScore <= threshold), "Maximum score filter mismatch.");
}
console.log("✓ Website Score range filters exclude missing or out-of-range scores");

for (const sort of ["WEBSITE_SCORE_ASC", "WEBSITE_SCORE_DESC", "OPPORTUNITY_COUNT_DESC", "BUSINESS_NAME_ASC", "GOOGLE_RATING_DESC"]) {
  const sorted = await getDashboard(`sort=${sort}`);
  assert(sorted.response.ok, `${sort} request failed.`);
  assert(sorted.body.dashboard.tableView.filters.sort === sort, `${sort} was not preserved in the response.`);
  assert(sorted.body.dashboard.tableView.rows.length === allRows.length, `${sort} changed row count without a filter.`);
}
console.log("✓ Supported sorting modes preserve row membership and expose the selected order");

const invalid = await getDashboard("priority=IMPOSSIBLE");
assert(invalid.response.status === 400 && invalid.body.error?.code === "INVALID_DASHBOARD_FILTER", "Invalid filter must return a controlled 400 response.");
const invalidRange = await getDashboard("minScore=90&maxScore=20");
assert(invalidRange.response.status === 400 && invalidRange.body.error?.code === "INVALID_DASHBOARD_FILTER", "Invalid score range must be rejected.");
console.log("✓ Invalid filters and score ranges fail safely instead of changing dashboard semantics");

assert(defaultView.rows.every((row) => row.leadScore?.available === false), "Filters/sorting must not introduce fabricated Lead Scores.");
console.log("✓ Filters and sorting remain website-evidence-only and do not fabricate Lead Scoring");

console.log("\nPhase 9 Filters & Sorting smoke test passed.\n");
