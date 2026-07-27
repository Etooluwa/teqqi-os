# Phase 11 — Deployment Checklist

TEQQI OS v1 deployment readiness checklist.

This checklist is intentionally hosting-platform neutral. The application may be deployed to any Node.js-capable platform that can run the Next.js production build and provide the required server-only environment variables.

## 1. Release source

- Deploy from the intended `main` commit only.
- Working tree must be clean before tagging/releasing.
- `package-lock.json` must be committed and must match `package.json`.
- Use `npm ci` in CI/deployment environments so the committed lockfile is authoritative.
- Record the deployed Git commit SHA so rollback is deterministic.

## 2. Runtime requirements

- Node.js must satisfy Next.js 16.2.11 requirements (Node.js 20.9.0 or newer).
- Install: `npm ci`.
- Build: `npm run build`.
- Start: `npm start`.
- The platform must support the Node.js runtime used by TEQQI OS API routes.

## 3. Required server-only environment variables

Required:

- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY`
- `GOOGLE_PLACES_API_KEY`

Optional but recommended for repeated automated audits:

- `PAGESPEED_API_KEY`

Rules:

- Never prefix provider/database secrets with `NEXT_PUBLIC_`.
- Never commit `.env.local`, production environment files, or real secret values.
- Configure secrets using the hosting platform's protected environment-variable store.
- Use production-specific credentials rather than reusing local development secrets where possible.
- Rotate any credential immediately if it is exposed in source, logs, screenshots, or public build output.

## 4. Supabase readiness

Before release:

- Confirm the deployment points to the intended TEQQI OS Supabase project.
- Confirm `/api/health/supabase` returns HTTP 200 and `{ ok: true }`.
- Confirm required migrations are applied before application traffic is switched over.
- Run Supabase Security Advisor after schema or policy changes.
- Do not add anonymous write policies to support server-side operations; server writes use the secret key.
- Existing RLS-enabled/no-policy notices for server-only tables are acceptable when public roles intentionally have no row access.

## 5. Security gate

Before release:

- `npm run test:phase11:security` passes against the production build.
- Browser security headers are present on live responses.
- Website Analyzer SSRF/private-network/redirect/size/timeout protections remain enabled.
- Supabase and provider credentials remain server-only.
- Do not use `npm audit fix --force` as a release shortcut.
- Review `npm audit` output and document unresolved upstream/transitive advisories.

### Access-control boundary

TEQQI OS v1 does not yet implement end-user authentication/authorization. Until an intentional auth model is added, production access should be restricted at the hosting/network layer to the intended TEQQI operator(s). Do not expose the internal dashboard/API surface as a public multi-user application.

## 6. Reliability and monitoring gate

Before release:

- `/api/health/monitoring` returns a successful aggregate snapshot.
- A `DEGRADED` monitoring status may be acceptable only when the known degraded signal has been reviewed and does not prevent the MVP workflow.
- Rate-limit handling tests pass.
- Background-job resilience tests pass.
- Structured logs are available from the hosting platform and preserve `X-Request-Id` correlation.

After release, watch for:

- repeated provider rate limits,
- stale search recoveries,
- failed search/scoring/opportunity executions,
- elevated dashboard duration,
- unexpected 5xx responses.

## 7. Functional release gate

Run against the production build before release:

```bash
npm run lint
npm run build
npm run test:phase11:security
npm run test:phase11:monitoring
npm run test:phase11:performance
npm run test:phase11:e2e
npm run test:phase10
npm run test:phase11:deployment
```

The server must be running for tests that target `TEQQI_APP_URL` / `http://localhost:3000`.

## 8. Data/provider boundaries

- Google Place business content must continue to be retrieved live rather than persisted as copied provider content.
- Persist only the approved Place ID/search-reference fields.
- Website analysis/scoring/opportunity runs remain immutable historical records.
- Manual refresh creates/reuses runs according to the Phase 11 cache and resilience contracts.
- Commercial business-level Lead Score remains explicitly unavailable until its model is implemented; release must not fabricate one.

## 9. Performance gate

- `npm run test:phase11:performance` passes.
- Dashboard runtime is measured and surfaced.
- Live Google Place Detail requests remain concurrency-bounded.
- Do not remove cache/version filters or replace targeted scoring reads with broad scans.

## 10. Rollback plan

Before switching traffic:

- Record the release commit SHA.
- Know how to redeploy the immediately previous known-good commit.
- Do not roll back database migrations independently of application code unless the migration is explicitly reversible and data-safe.
- Prefer forward fixes for additive/immutable intelligence data when a database rollback could discard valid runs.
- If a release causes provider abuse, unexpected writes, or secret exposure, disable/restrict traffic first, then rotate affected credentials and redeploy a known-good commit.

## 11. Post-deploy verification

Immediately after deployment:

1. Load `/` and confirm the dashboard renders.
2. Check `/api/health/supabase`.
3. Check `/api/health/monitoring`.
4. Verify security headers on a live response.
5. Run `TEQQI_APP_URL=https://<deployment-host> npm run test:phase11:deployment`.
6. Run one controlled business discovery search.
7. Open one discovered business detail page.
8. Confirm website intelligence is traceable to immutable scoring/opportunity run IDs when available.
9. Confirm logs include request IDs for the exercised requests.

## Exit criterion

Step 10 is satisfied when the deployment requirements are documented, machine-checked where practical, and the production build can pass the deployment-readiness smoke test without weakening any Phase 10/11 product boundaries.
