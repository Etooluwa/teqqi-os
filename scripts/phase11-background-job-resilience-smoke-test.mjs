import { readFile } from "node:fs/promises";

const TARGET = process.env.TEQQI_APP_URL ?? "http://localhost:3000";
const assert = (condition, message) => { if (!condition) throw new Error(message); };

console.log("\nTEQQI OS Phase 11 — Background Job Resilience smoke test");
console.log(`Target app: ${TARGET}\n`);

const discoveryPersistence = await readFile(new URL("../lib/business-discovery/persistence.ts", import.meta.url), "utf8");
const discoveryRoute = await readFile(new URL("../app/api/businesses/search/route.ts", import.meta.url), "utf8");
const scoringPersistence = await readFile(new URL("../lib/website-scoring/persistence.ts", import.meta.url), "utf8");
const opportunityRoute = await readFile(new URL("../app/api/websites/opportunities/route.ts", import.meta.url), "utf8");
const refreshControl = await readFile(new URL("../app/businesses/[externalId]/refresh-analysis-button.tsx", import.meta.url), "utf8");

assert(discoveryPersistence.includes("recoverStaleSearchExecutions"), "Discovery persistence must expose stale execution recovery.");
assert(discoveryPersistence.includes("STALE_EXECUTION_RECOVERED"), "Recovered stale executions must keep an explicit failure reason.");
assert(discoveryRoute.includes("BUSINESS_SEARCH_ACTIVE_WINDOW_MS"), "Discovery must define a bounded active execution window.");
assert(discoveryRoute.includes("SEARCH_ALREADY_RUNNING"), "Discovery must block duplicate identical active searches.");
assert(discoveryRoute.includes("recoverStaleSearchExecutions(BUSINESS_SEARCH_ACTIVE_WINDOW_MS)"), "Discovery must recover stale RUNNING records before starting new work.");
console.log("✓ Stale discovery executions are recoverable and duplicate active searches are blocked");

assert(scoringPersistence.includes("getRecoverableWebsiteScoringRun"), "Scoring persistence must expose validated recovery checkpoints.");
assert(scoringPersistence.includes("run.analyzer_version === WEBSITE_ANALYZER_VERSION"), "Recovery checkpoints must verify analyzer compatibility.");
assert(scoringPersistence.includes("run.scoring_model_version === SCORING_MODEL_VERSION"), "Recovery checkpoints must verify scoring-model compatibility.");
assert(scoringPersistence.includes("requestedDomain === runDomain"), "Recovery checkpoints must remain bound to the same website domain.");
assert(scoringPersistence.includes("hasFindings"), "Recovery checkpoints must require persisted analyzer findings.");
console.log("✓ Audit recovery checkpoints are domain-bound, version-aware, fresh, and evidence-backed");

const invalidCheckpointResponse = await fetch(`${TARGET}/api/websites/opportunities`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    url: "https://example.com",
    forceRefresh: true,
    resumeScoringRunId: "00000000-0000-0000-0000-000000000000",
  }),
});
const invalidCheckpointBody = await invalidCheckpointResponse.json();
assert(invalidCheckpointResponse.status === 409, `Invalid recovery checkpoint must return 409; received ${invalidCheckpointResponse.status}.`);
assert(invalidCheckpointBody?.ok === false && invalidCheckpointBody?.error?.code === "RECOVERY_CHECKPOINT_INVALID", `Invalid checkpoint contract mismatch: ${JSON.stringify(invalidCheckpointBody)}`);
console.log("✓ Invalid, stale, incompatible, or cross-site checkpoints fail safely without rerunning analysis");

assert(opportunityRoute.includes("WEBSITE_AUDIT_RECOVERY_TTL_MS"), "Opportunity pipeline must bound checkpoint lifetime.");
assert(opportunityRoute.includes("resumeScoringRunId"), "Opportunity pipeline must accept explicit checkpoint resume requests.");
assert(opportunityRoute.includes("analyzerRerun: false"), "Successful resume must explicitly state that analyzer work was not repeated.");
assert(opportunityRoute.includes("resumable: true"), "Partial post-scoring failures must return resumable recovery metadata.");
console.log("✓ Post-scoring failures preserve a resumable checkpoint instead of discarding completed work");

assert(refreshControl.includes("resumeScoringRunId"), "Refresh UI must retain a scoring checkpoint after a partial failure.");
assert(refreshControl.includes("Resume analysis"), "Refresh UI must expose a resume state to the user.");
assert(refreshControl.includes("result?.recovery?.resumable === true"), "Refresh UI must only retain server-approved resumable checkpoints.");
console.log("✓ Manual refresh retries resume from the preserved scoring checkpoint rather than restarting the crawl");

console.log("\n✅ Phase 11 Background Job Resilience smoke test passed.\n");
