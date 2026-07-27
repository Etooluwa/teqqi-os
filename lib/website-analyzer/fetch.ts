import "server-only";

import { retryDelayMs, waitForRetry } from "@/lib/reliability/rate-limit";
import { WebsiteAnalyzerError } from "@/lib/website-analyzer/errors";
import type { HtmlFetchResult, RedirectHop, ValidatedWebsiteTarget } from "@/lib/website-analyzer/types";
import { validateWebsiteUrl } from "@/lib/website-analyzer/url";

const FETCH_TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 5;
const MAX_RESPONSE_BYTES = 2_000_000;
const USER_AGENT = "TEQQI-OS-Website-Analyzer/1.0 (+https://theteqqi.com)";
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const TARGET_RATE_LIMIT_POLICY = { maxRetries: 1, baseDelayMs: 1_000, maxDelayMs: 5_000 } as const;

async function readBodyWithLimit(response: Response): Promise<{ html: string; byteLength: number }> {
  if (!response.body) return { html: "", byteLength: 0 };

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new WebsiteAnalyzerError(
          "RESPONSE_TOO_LARGE",
          `Website response exceeded the ${MAX_RESPONSE_BYTES} byte analysis limit.`,
          413,
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return {
    html: new TextDecoder("utf-8", { fatal: false }).decode(merged),
    byteLength: total,
  };
}

async function fetchNetworkResponse(url: string): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    return await fetch(url, {
      method: "GET",
      redirect: "manual",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1",
      },
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new WebsiteAnalyzerError("FETCH_TIMEOUT", "Website request timed out.", 504);
    }
    throw new WebsiteAnalyzerError("FETCH_NETWORK_ERROR", "Website request could not be completed.", 502);
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchOnce(url: string): Promise<Response> {
  for (let retryIndex = 0; ; retryIndex += 1) {
    const response = await fetchNetworkResponse(url);
    if (response.status !== 429) return response;

    const retryAfterHeader = response.headers.get("retry-after");
    if (retryIndex < TARGET_RATE_LIMIT_POLICY.maxRetries) {
      await response.body?.cancel().catch(() => undefined);
      await waitForRetry(retryDelayMs(retryIndex, retryAfterHeader, TARGET_RATE_LIMIT_POLICY));
      continue;
    }

    await response.body?.cancel().catch(() => undefined);
    throw new WebsiteAnalyzerError(
      "FETCH_RATE_LIMITED",
      "The website temporarily rate-limited the analyzer. Try the audit again later.",
      503,
    );
  }
}

export async function fetchWebsiteHtml(initialTarget: ValidatedWebsiteTarget): Promise<HtmlFetchResult> {
  const redirects: RedirectHop[] = [];
  let currentTarget = initialTarget;

  for (let attempt = 0; attempt <= MAX_REDIRECTS; attempt += 1) {
    const response = await fetchOnce(currentTarget.normalizedUrl);

    if (REDIRECT_STATUSES.has(response.status)) {
      if (attempt === MAX_REDIRECTS) {
        throw new WebsiteAnalyzerError("TOO_MANY_REDIRECTS", "Website exceeded the redirect limit.", 508);
      }

      const location = response.headers.get("location");
      if (!location) {
        throw new WebsiteAnalyzerError(
          "REDIRECT_LOCATION_MISSING",
          "Website returned a redirect response without a Location header.",
          502,
        );
      }

      let nextUrl: string;
      try {
        nextUrl = new URL(location, currentTarget.normalizedUrl).toString();
      } catch {
        throw new WebsiteAnalyzerError("INVALID_URL", "Website returned an invalid redirect URL.", 502);
      }

      const nextTarget = await validateWebsiteUrl(nextUrl);
      redirects.push({
        fromUrl: currentTarget.normalizedUrl,
        toUrl: nextTarget.normalizedUrl,
        status: response.status,
      });
      currentTarget = nextTarget;
      continue;
    }

    const contentType = response.headers.get("content-type");
    const contentLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BYTES) {
      throw new WebsiteAnalyzerError(
        "RESPONSE_TOO_LARGE",
        `Website response exceeded the ${MAX_RESPONSE_BYTES} byte analysis limit.`,
        413,
      );
    }

    const { html, byteLength } = await readBodyWithLimit(response);

    return {
      requestedUrl: initialTarget.requestedUrl,
      finalUrl: currentTarget.normalizedUrl,
      status: response.status,
      contentType,
      redirectCount: redirects.length,
      redirects,
      html,
      byteLength,
      fetchedAt: new Date().toISOString(),
    };
  }

  throw new WebsiteAnalyzerError("TOO_MANY_REDIRECTS", "Website exceeded the redirect limit.", 508);
}
