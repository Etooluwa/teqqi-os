import "server-only";

import { WebsiteAnalyzerError } from "@/lib/website-analyzer/errors";
import { fetchWebsiteHtml } from "@/lib/website-analyzer/fetch";
import { extractPageFacts } from "@/lib/website-analyzer/html";
import { runTechnicalHealthBatch1 } from "@/lib/website-analyzer/technical-health/batch1";
import { runTechnicalHealthBatch2 } from "@/lib/website-analyzer/technical-health/batch2";
import { collectTransportSecurityEvidence } from "@/lib/website-analyzer/transport";
import type {
  AnalyzerFetchParseResponse,
  HtmlFetchResult,
  ValidatedWebsiteTarget,
} from "@/lib/website-analyzer/types";
import { validateWebsiteUrl } from "@/lib/website-analyzer/url";
import { WEBSITE_ANALYZER_VERSION } from "@/lib/website-analyzer/version";

function responseAppearsHtml(contentType: string | null, body: string): boolean {
  const normalizedType = (contentType ?? "").toLowerCase();
  if (normalizedType.includes("text/html") || normalizedType.includes("application/xhtml+xml")) {
    return true;
  }

  const prefix = body.slice(0, 16_384).toLowerCase();
  return (
    /<!doctype\s+html/.test(prefix) ||
    /<html(?:\s|>)/.test(prefix) ||
    (/<head(?:\s|>)/.test(prefix) && /<body(?:\s|>)/.test(prefix))
  );
}

async function fetchHomepageWithHttpFallback(
  target: ValidatedWebsiteTarget,
): Promise<HtmlFetchResult> {
  try {
    return await fetchWebsiteHtml(target);
  } catch (error) {
    const canFallback =
      target.protocol === "https:" &&
      error instanceof WebsiteAnalyzerError &&
      (error.code === "FETCH_NETWORK_ERROR" || error.code === "FETCH_TIMEOUT");

    if (!canFallback) throw error;

    const fallback = new URL(target.normalizedUrl);
    fallback.protocol = "http:";
    fallback.port = "";
    const httpTarget = await validateWebsiteUrl(fallback.toString());
    return await fetchWebsiteHtml(httpTarget);
  }
}

export async function prepareWebsiteAnalysis(rawUrl: string): Promise<AnalyzerFetchParseResponse> {
  const target = await validateWebsiteUrl(rawUrl);
  const [fetchResult, transportSecurity] = await Promise.all([
    fetchHomepageWithHttpFallback(target),
    collectTransportSecurityEvidence(target),
  ]);
  const pageFacts = responseAppearsHtml(fetchResult.contentType, fetchResult.html)
    ? extractPageFacts(fetchResult.html)
    : null;
  const batch1Findings = runTechnicalHealthBatch1({
    target,
    fetchResult,
    pageFacts,
  });
  const batch2Findings = runTechnicalHealthBatch2({
    transport: transportSecurity,
    pageFacts,
    finalUrl: fetchResult.finalUrl,
  });

  const fetchMetadata = {
    requestedUrl: fetchResult.requestedUrl,
    finalUrl: fetchResult.finalUrl,
    status: fetchResult.status,
    contentType: fetchResult.contentType,
    redirectCount: fetchResult.redirectCount,
    redirects: fetchResult.redirects,
    byteLength: fetchResult.byteLength,
    fetchedAt: fetchResult.fetchedAt,
  };

  return {
    ok: true,
    analyzerVersion: WEBSITE_ANALYZER_VERSION,
    status: "RUNNING",
    target,
    fetch: fetchMetadata,
    pageFacts,
    transportSecurity,
    technicalHealthFindings: [...batch1Findings, ...batch2Findings],
    implementationStage: "TECHNICAL_HEALTH_BATCH_2",
    nextStage: "TECHNICAL_HEALTH_BATCH_3",
  };
}
