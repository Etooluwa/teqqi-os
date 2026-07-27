# Phase 11 — End-to-End Test Review

## Objective

Verify that the TEQQI OS MVP works as one connected product rather than only as individually tested subsystems.

The E2E gate covers the path:

**Business Discovery → Dashboard/Ranking → Website Analysis → Website Scoring → Opportunity Generation → Business Details → Historical Evidence**

## Test command

```bash
npm run test:phase11:e2e
```

The test targets `http://localhost:3000` by default. Set `TEQQI_APP_URL` to exercise another deployment.

## What the E2E test verifies

### 1. Persisted discovery reaches the dashboard

The suite loads the real `/api/dashboard` endpoint and verifies that:

- a persisted discovery search is selected;
- discovered businesses are present;
- each discovered business has a ranked row;
- dashboard summary counts agree with the row collection;
- Google Place content remains live-only;
- the deferred commercial Lead Score is not fabricated.

### 2. Discovery remains operational without unnecessary provider calls

The currently selected market is submitted to `/api/businesses/search` with `reuseRecent: true`.

When a compatible search is still within the Phase 11 discovery-cache window, the exact immutable search execution is reused.

If Google Places must be contacted, a successful fresh search is accepted. The only tolerated degraded provider states are the product's explicit temporary conditions:

- `SEARCH_ALREADY_RUNNING`
- `GOOGLE_PLACES_RATE_LIMITED`

These conditions do not invalidate already-persisted discovery data, so the E2E run continues against the selected persisted market.

Unexpected discovery failures fail the test.

### 3. Dashboard filtering and sorting work on the real market

The suite loads the selected market with:

- `analysis=HAS_WEBSITE`
- `sort=BUSINESS_NAME_ASC`

It verifies that every returned row has a website and that the resulting names are ordered deterministically.

### 4. A real website reaches the intelligence pipeline

The existing analyzable-business selector is reused. It attempts the canonical `/api/websites/opportunities` pipeline using a discovered business website.

A successful run proves the complete persisted chain:

**Analyze → Score → Opportunities**

Approved live-site safety failures are skipped rather than treated as TEQQI regressions. If every live site is temporarily unsuitable, the suite uses complete previously persisted intelligence when available. If no prior intelligence exists, the product must expose the explicit no-intelligence state rather than fabricate results.

### 5. Business details join live facts with immutable intelligence

For the selected business, `/api/businesses/[externalId]` must resolve:

- the requested external Place ID;
- the live website URL;
- the latest traceable website intelligence when available;
- an explicitly unavailable commercial Lead Score.

### 6. Historical scoring and opportunity APIs reproduce the displayed run chain

When intelligence exists, the suite loads:

- `/api/websites/score/[scoringRunId]`
- `/api/websites/opportunities/[opportunityRunId]`

The opportunity run must point to the exact scoring run selected by business details, and historical opportunity data must retain its immutable-result contract.

### 7. The rendered business page exposes explainability

The server-rendered business page must expose the core Phase 10 surfaces:

- Website Score
- Score breakdown
- Analyzer findings
- Recommendations
- Audit metadata

When immutable runs exist, their run IDs must be visible in the rendered audit metadata.

### 8. Error paths remain controlled

The suite verifies that:

- an unknown business returns a controlled 404;
- invalid dashboard filters return HTTP 400 with `INVALID_DASHBOARD_FILTER`.

## Intentional resilience behavior

This is an integration/E2E smoke gate, not a synthetic provider benchmark. External websites and Google Places can independently rate-limit, time out, become oversized, or become unsafe to crawl. The suite therefore distinguishes:

1. **TEQQI contract failures** — fail the E2E run.
2. **Approved external degraded states** — continue using persisted product state and verify that TEQQI degrades explicitly.

This keeps the release gate meaningful without making it dependent on a single third-party website being healthy at one exact moment.

## Exit criterion

Step 9 is complete when the E2E smoke test passes against a production build and the earlier Phase 10/11 regression gates remain green.
