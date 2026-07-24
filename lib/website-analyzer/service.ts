import "server-only";

import { createAuditEnvelope } from "@/lib/website-analyzer/audit";
import type { AnalyzerFoundationResponse } from "@/lib/website-analyzer/types";
import { validateWebsiteUrl } from "@/lib/website-analyzer/url";
import { WEBSITE_ANALYZER_VERSION } from "@/lib/website-analyzer/version";

export async function prepareWebsiteAnalysis(rawUrl: string): Promise<AnalyzerFoundationResponse> {
  const target = await validateWebsiteUrl(rawUrl);
  const audit = createAuditEnvelope({
    requestedUrl: target.requestedUrl,
    normalizedUrl: target.normalizedUrl,
  });

  return {
    ok: true,
    analyzerVersion: WEBSITE_ANALYZER_VERSION,
    status: audit.status,
    target,
    implementationStage: "ANALYZER_FOUNDATION",
    nextStage: "FETCH_AND_PARSE",
  };
}
