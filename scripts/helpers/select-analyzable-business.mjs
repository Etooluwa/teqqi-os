const SKIPPABLE_LIVE_SITE_CODES = new Set([
  "RESPONSE_TOO_LARGE",
  "FETCH_TIMEOUT",
  "FETCH_NETWORK_ERROR",
  "FETCH_RATE_LIMITED",
  "DNS_RESOLUTION_FAILED",
  "UNSAFE_HOST",
  "UNSAFE_RESOLVED_ADDRESS",
  "INVALID_URL",
  "UNSUPPORTED_PROTOCOL",
  "URL_CREDENTIALS_NOT_ALLOWED",
]);

async function loadPersistedBusinessDetail(target, candidate) {
  const response = await fetch(`${target}/api/businesses/${encodeURIComponent(candidate.externalId)}`);
  const body = await response.json().catch(() => null);
  if (!response.ok || body?.ok !== true) return null;

  const detail = body.detail;
  const hasScoring = Boolean(detail?.intelligence?.scoringRun?.scoringRunId);
  const hasFindings = detail?.intelligence?.analyzerFindings?.available === true;
  const hasOpportunity = Boolean(detail?.intelligence?.opportunityRun?.opportunityRunId);
  const hasRecommendations = detail?.intelligence?.recommendations?.available === true;

  if (!hasScoring || !hasFindings || !hasOpportunity || !hasRecommendations) return null;
  return { response, body };
}

export async function selectAnalyzableBusiness(target, rankedBusinesses) {
  const candidates = rankedBusinesses.filter((row) => row?.externalId && row?.websiteUrl);
  if (candidates.length === 0) {
    throw new Error("A discovered business with a website is required for the live analysis smoke tests.");
  }

  const skipped = [];
  for (const candidate of candidates) {
    const response = await fetch(`${target}/api/websites/opportunities`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: candidate.websiteUrl, forceRefresh: true }),
    });
    const body = await response.json().catch(() => null);

    if (response.ok && body?.ok === true) {
      return { candidate, response, body, skipped, source: "FRESH_LIVE_RUN", detail: null };
    }

    const code = body?.error?.code;
    if (typeof code === "string" && SKIPPABLE_LIVE_SITE_CODES.has(code)) {
      skipped.push({ externalId: candidate.externalId, websiteUrl: candidate.websiteUrl, code });
      continue;
    }

    throw new Error(`Website intelligence pipeline failed for ${candidate.websiteUrl}: ${JSON.stringify(body)}`);
  }

  for (const candidate of candidates) {
    const persisted = await loadPersistedBusinessDetail(target, candidate);
    if (persisted) {
      return {
        candidate,
        response: null,
        body: null,
        skipped,
        source: "PERSISTED_INTELLIGENCE_FALLBACK",
        detail: persisted.body.detail,
      };
    }
  }

  throw new Error(
    `No analyzable live website or persisted business intelligence was available. Skipped ${skipped.length} site-specific failures: ${skipped.map((item) => `${item.code}:${item.websiteUrl}`).join(", ")}`,
  );
}
