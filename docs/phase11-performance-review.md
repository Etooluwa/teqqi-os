# Phase 11 — Performance Review

## Scope

This review focuses on the MVP request paths that can create unnecessary latency, external-provider load, or Supabase transfer volume without changing TEQQI OS product behavior.

## Changes implemented

### Dashboard Google Place detail fan-out

Before: every Place Detail request for a selected market was started at once with an unbounded `Promise.all`.

Now: Place Detail requests are processed with a bounded concurrency of 5. This keeps useful parallelism while reducing burst pressure against Google Places and complements Phase 11 rate-limit handling.

### Dashboard scoring-run reads

Before: the dashboard loaded up to 1,000 completed scoring runs even when only a subset could be referenced by the loaded opportunity runs.

Now: scoring rows are requested only for the distinct scoring-run IDs referenced by the opportunity runs used by the dashboard.

### Dashboard best-opportunity selection

Before: every opportunity list was copied and sorted only to select the first item.

Now: the best opportunity is selected in a single pass without allocating and sorting a copy.

### Website audit cache lookup

Before: cache lookup loaded up to 1,000 full completed opportunity runs and filtered TTL and engine-version compatibility in application memory.

Now: Supabase filters status, analyzer version, scoring version, opportunity-engine version, and the cache TTL before rows are returned. Domain matching remains application-side because historical rows do not currently persist a dedicated canonical-domain field.

### Audit recovery checkpoint lookup

Before: validating a resumable scoring checkpoint called the full scoring-run reader, which also fetched category rows that recovery does not need.

Now: checkpoint validation fetches only the scoring run. Category rows are still loaded by consumers that explicitly request the complete scoring-run detail contract.

### Dashboard performance instrumentation

`GET /api/dashboard` now records a correlated `durationMs` in structured logs and includes the same duration in the successful API response. This provides a repeatable runtime baseline for later optimization without adding a third-party observability dependency.

## Database advisor review

The Supabase performance advisor was reviewed during this step. It currently reports informational unindexed foreign keys and unused-index notices. None of the reported missing foreign-key indexes are on the MVP hot paths optimized above, so no speculative index changes were made in this step.

## Deferred optimization

If the number of historical website opportunity runs grows enough that the remaining domain scan becomes material, add a persisted/indexed canonical-domain field to the audit-run model and query cache/dashboard intelligence by canonical domain directly. That is intentionally deferred until runtime measurements justify a schema migration.

## Performance guardrails

- Google Place Detail concurrency remains explicitly bounded.
- Provider content remains live-only and is not persisted to improve speed.
- Cache semantics and immutable audit history remain unchanged.
- No result ranking, scoring, or recommendation behavior is changed by these optimizations.
- Performance changes must continue to pass the Phase 10 and Phase 11 regression suites.
