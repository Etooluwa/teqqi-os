# TEQQI OS

TEQQI OS is a deterministic business and digital intelligence platform for discovering local businesses, analyzing their websites, scoring website quality, and identifying service opportunities.

## MVP workflow

Business Discovery → Website Analyzer → Website Scoring → Opportunity Engine → Dashboard → Business Details

The MVP includes:

- Google Places business discovery
- Recent-search reuse and search history
- Live business-detail retrieval
- Website crawling with SSRF, redirect, timeout, response-size, and rate-limit protections
- Deterministic website scoring with versioned rule evidence
- Website opportunity generation with immutable persisted runs
- Opportunity dashboard with ranking, filtering, market summaries, and search history
- Business detail pages with score breakdown, findings, recommendations, refresh controls, and run traceability
- Audit caching, recovery checkpoints, structured logging, monitoring, security headers, and performance telemetry

## Important product boundaries

- Commercial business-level Lead Scoring is not implemented yet. The product deliberately exposes Lead Score as unavailable rather than fabricating one.
- Google Places business content is retrieved live and is not persisted as provider business content.
- The deterministic analysis/scoring/opportunity workflow does not require AI.
- End-user authentication/authorization is not implemented yet. Until it is, the MVP should remain private or access-restricted rather than exposed as an open public dashboard.

## Stack

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS
- Supabase / PostgreSQL
- Cheerio
- Zod

## Environment

Copy `.env.example` to `.env.local` and configure:

```bash
SUPABASE_URL=...
SUPABASE_SECRET_KEY=...
GOOGLE_PLACES_API_KEY=...
PAGESPEED_API_KEY=... # optional
```

All credentials are server-only. Do not expose secret values through `NEXT_PUBLIC_*` variables.

## Local development

```bash
npm ci
npm run dev
```

Open `http://localhost:3000`.

## Production-style verification

Build and start the application:

```bash
npm ci
npm run lint
npm run build
npm start
```

With the server running, execute the MVP release gate from a second terminal:

```bash
npm run test:phase11:release
```

To verify a deployed environment instead of localhost:

```bash
TEQQI_APP_URL=https://your-private-deployment.example npm run test:phase11:release
```

The release gate validates deployment readiness, end-to-end behavior, security, monitoring, performance, and the Phase 10 business-detail product contracts.

## Health endpoints

- `/api/health/supabase`
- `/api/health/monitoring`

## Release documentation

See:

- `docs/phase11-deployment-checklist.md`
- `docs/phase11-mvp-release.md`
- `docs/phase11-security-review.md`
- `docs/phase11-performance-review.md`

## Version

Current MVP version: `0.1.0`
