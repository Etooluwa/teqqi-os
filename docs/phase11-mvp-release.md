# Phase 11 — MVP Release

TEQQI OS MVP version: `0.1.0`

## Release scope

The MVP connects the full deterministic intelligence workflow:

1. Business Discovery through Google Places
2. Search persistence and recent-search reuse
3. Live business-detail retrieval without persisting Google Place business content
4. Website analysis with SSRF, redirect, timeout, response-size, and rate-limit protections
5. Deterministic Website Scoring with versioned category/rule evidence
6. Website Opportunity generation with immutable persisted runs
7. Opportunity Dashboard with ranking, filtering, search history, and market summaries
8. Business Detail pages with score breakdown, analyzer findings, recommendations, and immutable run traceability
9. Manual refresh, audit caching, recovery checkpoints, structured logging, monitoring, and performance telemetry

## Explicit MVP boundaries

- Commercial business-level Lead Scoring is not implemented. The UI and APIs must continue to expose it as unavailable rather than fabricate a score.
- Google Places business content is retrieved live and is not persisted as provider business content.
- The application does not yet have end-user authentication/authorization. The MVP must remain private or access-restricted until an authentication layer is introduced.
- AI is not required for the deterministic analyzer/scoring/opportunity path.

## Release prerequisites

Before declaring the MVP released:

- `npm ci` succeeds from the committed lockfile.
- `npm run lint` succeeds.
- `npm run build` succeeds.
- A production-style server is running with the intended environment variables.
- `npm run test:phase11:release` passes against that server.
- Supabase reports healthy.
- Operational monitoring is reachable.
- Security headers are live.
- The dashboard and business-detail flow return controlled, typed responses.
- Rollback is possible by redeploying the previous known-good commit.

## Release command

With the production-style app running:

```bash
npm run test:phase11:release
```

The release gate runs the critical deployment readiness, end-to-end, security, monitoring, performance, and Phase 10 product-contract suites.

## Release decision

A release is **GO** only when the release gate passes in full.

Any failed critical gate is a **NO-GO** until corrected and rerun. Third-party website/provider conditions may degrade only where an existing typed resilience rule explicitly allows them; they must never cause fabricated intelligence.

## Post-release checks

After deployment:

1. Verify `/` loads successfully.
2. Verify `/api/health/supabase` is healthy.
3. Verify `/api/health/monitoring` returns a recognized operational status.
4. Run the release gate against the deployed URL using `TEQQI_APP_URL`.
5. Confirm the dashboard loads the intended market and business details resolve correctly.
6. Confirm security headers are present on live responses.
7. Keep the deployment access-restricted until authentication/authorization exists.
