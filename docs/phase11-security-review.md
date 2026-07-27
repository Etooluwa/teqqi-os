# Phase 11 — Security Review

## Scope

This review covers the TEQQI OS MVP application boundary, dependency baseline, Supabase access model, website-audit SSRF protections, secret handling, and browser response hardening.

## Findings and actions

### 1. Next.js security patch

TEQQI OS was pinned to Next.js 16.2.10. Security advisories published July 21, 2026 affect Next.js 16.x releases earlier than 16.2.11.

Action:
- Pin `next` to `16.2.11`.
- Keep `eslint-config-next` aligned at `16.2.11`.
- Refresh `package-lock.json` with `npm install` during verification before release.
- Do not use `npm audit fix --force` without reviewing the resulting dependency changes.

### 2. Supabase public write access

Supabase Security Advisor identified an anonymous `INSERT` policy on `public.businesses` with `WITH CHECK (true)`. TEQQI OS database access is server-only through `SUPABASE_SECRET_KEY`, so anonymous business creation is not required.

Action applied to the Supabase project:

```sql
drop policy if exists "Allow public business inserts" on public.businesses;
revoke insert on table public.businesses from anon;
```

The Security Advisor warning is resolved. Existing RLS-enabled server-only tables with no public policies remain deny-by-default for public roles.

### 3. Secret boundary

The application keeps Supabase and provider credentials behind `server-only` modules and uses non-public environment variable names:
- `SUPABASE_SECRET_KEY`
- `GOOGLE_PLACES_API_KEY`
- `PAGESPEED_API_KEY`

No secret should ever be renamed with a `NEXT_PUBLIC_` prefix or returned from API responses/logs.

### 4. Website analyzer SSRF protection

The website analyzer already enforces a strong network boundary:
- HTTP/HTTPS only.
- Embedded URL credentials rejected.
- localhost, `.local`, and `.internal` targets rejected.
- Private, loopback, link-local, documentation, carrier-grade NAT, multicast, and reserved IP ranges rejected.
- DNS results checked before requests.
- Redirects followed manually and every redirect target revalidated.
- Redirect chain capped at 5 hops.
- Fetch timeout capped at 10 seconds.
- Response body capped at 2 MB.
- Fetch cache disabled.

These protections must remain regression-tested because TEQQI OS intentionally fetches user-supplied website URLs.

### 5. Browser response hardening

Global response headers now include:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: strict-origin-when-cross-origin`
- restrictive camera/microphone/geolocation `Permissions-Policy`
- `X-Permitted-Cross-Domain-Policies: none`

A strict Content Security Policy is intentionally deferred until the application has a tested nonce/hash strategy; adding a broad CSP without testing could break Next.js runtime scripts.

## Residual MVP risk

TEQQI OS does not currently implement end-user authentication/authorization. That is acceptable only while the MVP is treated as a private/internal tool. Production deployment should remain access-restricted at the hosting/platform layer until a deliberate authentication model is implemented.

The health/monitoring endpoint exposes aggregate operational status only and must continue to avoid secrets, provider payloads, and persisted business content.

## Release verification

Before Step 8 is marked complete:

```bash
npm install
npm audit
npm run lint
npm run build
npm run test:phase11:security
npm run test:phase11:monitoring
npm run test:phase11:rate-limit
npm run test:phase11:resilience
npm run test:phase10
```

Review any remaining `npm audit` findings individually. A non-zero audit result is not automatically safe or unsafe; affected package, exploitability in TEQQI OS, and available non-breaking patch versions must be evaluated.
