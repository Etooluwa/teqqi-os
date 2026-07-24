import "server-only";

import { fetchWebsiteHtml } from "@/lib/website-analyzer/fetch";
import { extractPageFacts } from "@/lib/website-analyzer/html";
import { runTechnicalHealthBatch1 } from "@/lib/website-analyzer/technical-health/batch1";
import type { AnalyzerFetchParseResponse } from "@/lib/website-analyzer/types";
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

export async function prepareWebsiteAnalysis(rawUrl: string): Promise<AnalyzerFetchParseResponse> {
  const target = await validateWebsiteUrl(rawUrl);
  const fetchResult = await fetchWebsiteHtml(target);
  const pageFacts = responseAppearsHtml(fetchResult.contentType, fetchResult.html)
    ? extractPageFacts(fetchResult.html)
    : null;
  const technicalHealthFindings = runTechnicalHealthBatch1({
    target,
    fetchResult,
    pageFacts,
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
    technicalHealthFindings,
    implementationStage: "TECHNICAL_HEALTH_BATCH_1",
    nextStage: "TECHNICAL_HEALTH_BATCH_2",
  };
}
