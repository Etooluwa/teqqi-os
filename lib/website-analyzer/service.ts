import "server-only";

import { collectCrawlabilityEvidence } from "@/lib/website-analyzer/crawlability";
import { WebsiteAnalyzerError } from "@/lib/website-analyzer/errors";
import { fetchWebsiteHtml } from "@/lib/website-analyzer/fetch";
import { extractPageFacts } from "@/lib/website-analyzer/html";
import { collectLinkIntegrityEvidence } from "@/lib/website-analyzer/link-integrity";
import { collectMobileUsabilityEvidence } from "@/lib/website-analyzer/mobile-usability";
import { collectPerformanceEvidence } from "@/lib/website-analyzer/performance/pagespeed";
import { runPerformanceRules } from "@/lib/website-analyzer/performance/rules";
import { runSeoBatch1 } from "@/lib/website-analyzer/seo/batch1";
import { runSeoBatch2 } from "@/lib/website-analyzer/seo/batch2";
import { runSeoBatch3 } from "@/lib/website-analyzer/seo/batch3";
import { collectSeoEvidence } from "@/lib/website-analyzer/seo/evidence";
import { runRemainingSeoRules } from "@/lib/website-analyzer/seo/remaining";
import { collectTechnicalHygieneEvidence } from "@/lib/website-analyzer/technical-hygiene";
import { runTechnicalHealthBatch1 } from "@/lib/website-analyzer/technical-health/batch1";
import { runTechnicalHealthBatch2 } from "@/lib/website-analyzer/technical-health/batch2";
import { runTechnicalHealthBatch3 } from "@/lib/website-analyzer/technical-health/batch3";
import { runTechnicalHealthBatch4 } from "@/lib/website-analyzer/technical-health/batch4";
import { runTechnicalHealthBatch5 } from "@/lib/website-analyzer/technical-health/batch5";
import { runTechnicalHealthBatch6 } from "@/lib/website-analyzer/technical-health/batch6";
import { runTechnicalHealthBatch7 } from "@/lib/website-analyzer/technical-health/batch7";
import { collectTransportSecurityEvidence } from "@/lib/website-analyzer/transport";
import type { AnalyzerFetchParseResponse, HtmlFetchResult, RedirectConsistencyEvidence, ValidatedWebsiteTarget } from "@/lib/website-analyzer/types";
import { validateWebsiteUrl } from "@/lib/website-analyzer/url";
import { WEBSITE_ANALYZER_VERSION } from "@/lib/website-analyzer/version";

function responseAppearsHtml(contentType: string | null, body: string): boolean {
  const normalizedType = (contentType ?? "").toLowerCase();
  if (normalizedType.includes("text/html") || normalizedType.includes("application/xhtml+xml")) return true;
  const prefix = body.slice(0, 16_384).toLowerCase();
  return /<!doctype\s+html/.test(prefix) || /<html(?:\s|>)/.test(prefix) || (/<head(?:\s|>)/.test(prefix) && /<body(?:\s|>)/.test(prefix));
}

async function fetchHomepageWithHttpFallback(target: ValidatedWebsiteTarget): Promise<HtmlFetchResult> {
  try { return await fetchWebsiteHtml(target); } catch (error) {
    const canFallback = target.protocol === "https:" && error instanceof WebsiteAnalyzerError && (error.code === "FETCH_NETWORK_ERROR" || error.code === "FETCH_TIMEOUT");
    if (!canFallback) throw error;
    const fallback = new URL(target.normalizedUrl); fallback.protocol = "http:"; fallback.port = "";
    return await fetchWebsiteHtml(await validateWebsiteUrl(fallback.toString()));
  }
}

function hostnameBase(hostname: string): string { return hostname.toLowerCase().replace(/^www\./, ""); }
function buildRedirectConsistencyEvidence(rawUrl: string, target: ValidatedWebsiteTarget, fetchResult: HtmlFetchResult): RedirectConsistencyEvidence {
  const final = new URL(fetchResult.finalUrl); const requestedHostname = target.hostname.toLowerCase(); const finalHostname = final.hostname.toLowerCase();
  const requestedHostnameBase = hostnameBase(requestedHostname); const finalHostnameBase = hostnameBase(finalHostname);
  const pathUrls = [target.normalizedUrl, ...fetchResult.redirects.map((hop) => hop.toUrl)].map((url) => { try { return new URL(url).toString(); } catch { return url; } });
  return { requestedUrl: rawUrl, normalizedUrl: target.normalizedUrl, finalUrl: fetchResult.finalUrl, redirectCount: fetchResult.redirectCount, redirects: fetchResult.redirects, requestedHostname, finalHostname, requestedHostnameBase, finalHostnameBase, hostnameVariantChanged: requestedHostnameBase === finalHostnameBase && requestedHostname !== finalHostname, destinationSameSite: requestedHostnameBase === finalHostnameBase, repeatedUrlDetected: new Set(pathUrls).size !== pathUrls.length, normalizedInputChanged: rawUrl.trim() !== target.normalizedUrl };
}

export async function prepareWebsiteAnalysis(rawUrl: string): Promise<AnalyzerFetchParseResponse> {
  const target = await validateWebsiteUrl(rawUrl);
  const [fetchResult, transportSecurity] = await Promise.all([fetchHomepageWithHttpFallback(target), collectTransportSecurityEvidence(target)]);
  const pageFacts = responseAppearsHtml(fetchResult.contentType, fetchResult.html) ? extractPageFacts(fetchResult.html) : null;
  const mobileUsability = pageFacts ? collectMobileUsabilityEvidence(fetchResult.html) : null;
  const redirectConsistency = buildRedirectConsistencyEvidence(rawUrl, target, fetchResult);
  const crawlability = await collectCrawlabilityEvidence({ finalUrl: fetchResult.finalUrl, homepageFacts: pageFacts });
  const linkIntegrity = await collectLinkIntegrityEvidence({ finalUrl: fetchResult.finalUrl, homepageFacts: pageFacts, crawlability });
  const technicalHygiene = await collectTechnicalHygieneEvidence({ fetchResult, pageFacts, crawlability });
  const seoEvidence = await collectSeoEvidence({ homepageFetch: fetchResult, homepageFacts: pageFacts, crawlability });
  const performanceEvidence = await collectPerformanceEvidence(fetchResult.finalUrl);

  const batch1Findings = runTechnicalHealthBatch1({ target, fetchResult, pageFacts });
  const batch2Findings = runTechnicalHealthBatch2({ transport: transportSecurity, pageFacts, finalUrl: fetchResult.finalUrl });
  const batch3Findings = runTechnicalHealthBatch3(redirectConsistency);
  const batch4Findings = runTechnicalHealthBatch4({ evidence: crawlability, homepageFacts: pageFacts });
  const batch5Findings = runTechnicalHealthBatch5({ evidence: linkIntegrity, homepageFacts: pageFacts });
  const batch6Findings = runTechnicalHealthBatch6({ evidence: mobileUsability, pageFacts });
  const batch7Findings = runTechnicalHealthBatch7({ evidence: technicalHygiene, pageFacts });
  const seoBatch1Findings = runSeoBatch1(seoEvidence);
  const seoBatch2Findings = runSeoBatch2(seoEvidence);
  const seoBatch3Findings = runSeoBatch3({ evidence: seoEvidence, crawlability });
  const remainingSeoFindings = runRemainingSeoRules({ evidence: seoEvidence, crawlability });
  const performanceFindings = runPerformanceRules(performanceEvidence);

  const fetchMetadata = { requestedUrl: fetchResult.requestedUrl, finalUrl: fetchResult.finalUrl, status: fetchResult.status, contentType: fetchResult.contentType, redirectCount: fetchResult.redirectCount, redirects: fetchResult.redirects, byteLength: fetchResult.byteLength, fetchedAt: fetchResult.fetchedAt };
  return {
    ok: true,
    analyzerVersion: WEBSITE_ANALYZER_VERSION,
    status: "RUNNING",
    target,
    fetch: fetchMetadata,
    pageFacts,
    transportSecurity,
    redirectConsistency,
    crawlability,
    linkIntegrity,
    mobileUsability,
    technicalHygiene,
    seoEvidence,
    performanceEvidence,
    technicalHealthFindings: [...batch1Findings, ...batch2Findings, ...batch3Findings, ...batch4Findings, ...batch5Findings, ...batch6Findings, ...batch7Findings],
    seoFindings: [...seoBatch1Findings, ...seoBatch2Findings, ...seoBatch3Findings, ...remainingSeoFindings],
    performanceFindings,
    implementationStage: "PERFORMANCE_COMPLETE",
    nextStage: "CONVERSION_UX",
  };
}
