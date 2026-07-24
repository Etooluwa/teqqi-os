import "server-only";

import { fetchWebsiteHtml } from "@/lib/website-analyzer/fetch";
import { extractPageFacts } from "@/lib/website-analyzer/html";
import type { AnalyzerFetchParseResponse } from "@/lib/website-analyzer/types";
import { validateWebsiteUrl } from "@/lib/website-analyzer/url";
import { WEBSITE_ANALYZER_VERSION } from "@/lib/website-analyzer/version";

export async function prepareWebsiteAnalysis(rawUrl: string): Promise<AnalyzerFetchParseResponse> {
  const target = await validateWebsiteUrl(rawUrl);
  const fetchResult = await fetchWebsiteHtml(target);
  const pageFacts = extractPageFacts(fetchResult.html);

  const { html: _html, ...fetchMetadata } = fetchResult;

  return {
    ok: true,
    analyzerVersion: WEBSITE_ANALYZER_VERSION,
    status: "RUNNING",
    target,
    fetch: fetchMetadata,
    pageFacts,
    implementationStage: "FETCH_AND_PARSE",
    nextStage: "TECHNICAL_HEALTH_RULES",
  };
}