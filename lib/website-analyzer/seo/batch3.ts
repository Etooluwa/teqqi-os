import "server-only";

import type { AnalyzerFinding, CrawlabilityEvidence, SeoEvidence, SeoPageEvidence } from "@/lib/website-analyzer/types";

const DETECTOR_VERSION = "1.0.0";

function finding(input: Omit<AnalyzerFinding, "category" | "detectorVersion">): AnalyzerFinding {
  return { ...input, category: "SEO", detectorVersion: DETECTOR_VERSION };
}

function normalizeUrl(value: string, baseUrl: string): string | null {
  try {
    const url = new URL(value, baseUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function normalizeComparableUrl(value: string): string | null {
  try {
    const url = new URL(value);
    url.hash = "";
    url.hostname = url.hostname.toLowerCase();
    if ((url.protocol === "https:" && url.port === "443") || (url.protocol === "http:" && url.port === "80")) url.port = "";
    if (url.pathname !== "/" && url.pathname.endsWith("/")) url.pathname = url.pathname.replace(/\/+$/, "");
    return url.toString();
  } catch {
    return null;
  }
}

function robotsTokens(page: SeoPageEvidence): string[] {
  return (page.facts.metaRobots ?? "")
    .toLowerCase()
    .split(/[\s,]+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function pageCanonical(page: SeoPageEvidence): string | null {
  return page.facts.canonicalUrl ? normalizeUrl(page.facts.canonicalUrl, page.finalUrl) : null;
}

function seo010(evidence: SeoEvidence): AnalyzerFinding {
  if (evidence.pages.length === 0) return finding({ ruleId: "SEO-010", status: "NOT_APPLICABLE", confidence: "HIGH", applicable: false, summary: "Canonical-tag inspection is not applicable because no HTML pages were available.", result: {}, evidence: { pages: [] } });
  const pages = evidence.pages.map((page) => ({ url: page.finalUrl, isHomepage: page.isHomepage, canonicalCount: page.facts.canonicalCount, canonicalUrl: page.facts.canonicalUrl }));
  const missing = pages.filter((page) => page.canonicalCount === 0 || !page.canonicalUrl);
  const multiple = pages.filter((page) => page.canonicalCount > 1);
  const homepageMissing = missing.some((page) => page.isHomepage);
  const ratio = missing.length / pages.length;
  const status: AnalyzerFinding["status"] = homepageMissing || missing.length >= 2 || ratio >= 0.25 ? "FAIL" : missing.length > 0 || multiple.length > 0 ? "WARNING" : "PASS";
  return finding({ ruleId: "SEO-010", status, confidence: "HIGH", applicable: true, summary: status === "PASS" ? "Every analyzed HTML page declares exactly one canonical URL." : status === "FAIL" ? "Canonical tags are missing from the homepage or multiple analyzed pages." : "A sampled page is missing a canonical tag or contains multiple canonical declarations.", result: { pagesEvaluated: pages.length, pagesMissingCanonical: missing.length, multipleCanonicalPages: multiple.length, homepageMissing }, evidence: { pages, missingRatio: ratio } });
}

function seo011(evidence: SeoEvidence): AnalyzerFinding {
  const declared = evidence.pages.filter((page) => Boolean(page.facts.canonicalUrl));
  if (declared.length === 0) return finding({ ruleId: "SEO-011", status: "NOT_APPLICABLE", confidence: "HIGH", applicable: false, summary: "Canonical URL validation is not applicable because no canonical URLs were declared.", result: {}, evidence: { pages: [] } });
  const pages = declared.map((page) => {
    const resolved = pageCanonical(page);
    const valid = resolved !== null;
    const protocol = resolved ? new URL(resolved).protocol : null;
    return { url: page.finalUrl, rawCanonical: page.facts.canonicalUrl, resolvedCanonical: resolved, valid, supportedProtocol: protocol === "http:" || protocol === "https:" };
  });
  const invalid = pages.filter((page) => !page.valid || !page.supportedProtocol);
  const status: AnalyzerFinding["status"] = invalid.length === 0 ? "PASS" : invalid.length >= 2 || invalid.some((page) => page.url === evidence.pages.find((item) => item.isHomepage)?.finalUrl) ? "FAIL" : "WARNING";
  return finding({ ruleId: "SEO-011", status, confidence: "HIGH", applicable: true, summary: status === "PASS" ? "Declared canonical URLs are syntactically valid HTTP(S) URLs." : status === "FAIL" ? "One or more important canonical URLs are invalid or unsupported." : "A sampled canonical URL is invalid or unsupported.", result: { pagesEvaluated: pages.length, invalidCanonicalPages: invalid.length }, evidence: { pages } });
}

function seo012(evidence: SeoEvidence): AnalyzerFinding {
  const comparable = evidence.pages.filter((page) => pageCanonical(page));
  if (comparable.length === 0) return finding({ ruleId: "SEO-012", status: "NOT_APPLICABLE", confidence: "HIGH", applicable: false, summary: "Canonical consistency is not applicable because no valid canonical URLs were available.", result: {}, evidence: { pages: [] } });
  const pages = comparable.map((page) => {
    const canonical = pageCanonical(page)!;
    const current = normalizeComparableUrl(page.finalUrl);
    const normalizedCanonical = normalizeComparableUrl(canonical);
    const selfCanonical = current !== null && normalizedCanonical === current;
    return { url: page.finalUrl, canonicalUrl: canonical, selfCanonical };
  });
  const nonSelf = pages.filter((page) => !page.selfCanonical);
  const homepageNonSelf = nonSelf.some((page) => page.url === evidence.pages.find((item) => item.isHomepage)?.finalUrl);
  const ratio = nonSelf.length / pages.length;
  const status: AnalyzerFinding["status"] = nonSelf.length === 0 ? "PASS" : homepageNonSelf || nonSelf.length >= 2 || ratio >= 0.25 ? "FAIL" : "WARNING";
  return finding({ ruleId: "SEO-012", status, confidence: "HIGH", applicable: true, summary: status === "PASS" ? "Analyzed pages use self-consistent canonical URLs." : status === "FAIL" ? "Canonical targets are inconsistent on the homepage or multiple analyzed pages." : "A sampled page canonicalizes to a different URL.", result: { pagesEvaluated: pages.length, nonSelfCanonicalPages: nonSelf.length, homepageNonSelf, nonSelfRatio: ratio }, evidence: { pages } });
}

function seo013(evidence: SeoEvidence): AnalyzerFinding {
  if (evidence.pages.length === 0) return finding({ ruleId: "SEO-013", status: "NOT_APPLICABLE", confidence: "HIGH", applicable: false, summary: "Meta-robots indexability inspection is not applicable because no HTML pages were available.", result: {}, evidence: { pages: [] } });
  const pages = evidence.pages.map((page) => {
    const tokens = robotsTokens(page);
    return { url: page.finalUrl, isHomepage: page.isHomepage, metaRobots: page.facts.metaRobots, tokens, noindex: tokens.includes("noindex"), nofollow: tokens.includes("nofollow"), indexExplicit: tokens.includes("index") };
  });
  const noindex = pages.filter((page) => page.noindex);
  const homepageNoindex = noindex.some((page) => page.isHomepage);
  const status: AnalyzerFinding["status"] = homepageNoindex ? "FAIL" : noindex.length >= 2 || noindex.length / pages.length >= 0.25 ? "WARNING" : "PASS";
  return finding({ ruleId: "SEO-013", status, confidence: "HIGH", applicable: true, summary: status === "PASS" ? "No problematic meta-robots noindex directive was found in the analyzed sample." : status === "FAIL" ? "The homepage is explicitly marked noindex." : "One or more sampled pages are explicitly marked noindex.", result: { pagesEvaluated: pages.length, noindexPages: noindex.length, homepageNoindex }, evidence: { pages } });
}

function seo014(evidence: SeoEvidence, crawlability: CrawlabilityEvidence): AnalyzerFinding {
  if (evidence.pages.length === 0) return finding({ ruleId: "SEO-014", status: "NOT_APPLICABLE", confidence: "HIGH", applicable: false, summary: "Indexability conflict inspection is not applicable because no HTML pages were available.", result: {}, evidence: {} });
  const sitemapUrls = new Set(crawlability.sitemap.discoveredUrls.map((url) => normalizeComparableUrl(url)).filter((url): url is string => Boolean(url)));
  const conflicts: Array<{ url: string; signals: string[] }> = [];
  for (const page of evidence.pages) {
    const tokens = robotsTokens(page);
    const signals: string[] = [];
    const current = normalizeComparableUrl(page.finalUrl);
    const canonical = pageCanonical(page);
    const comparableCanonical = canonical ? normalizeComparableUrl(canonical) : null;
    if (tokens.includes("index") && tokens.includes("noindex")) signals.push("meta_robots_index_noindex_conflict");
    if (tokens.includes("follow") && tokens.includes("nofollow")) signals.push("meta_robots_follow_nofollow_conflict");
    if (tokens.includes("noindex") && current && sitemapUrls.has(current)) signals.push("noindex_page_in_sitemap");
    if (tokens.includes("noindex") && comparableCanonical && current && comparableCanonical === current) signals.push("noindex_with_self_canonical");
    if (signals.length > 0) conflicts.push({ url: page.finalUrl, signals });
  }
  if (crawlability.robots.globallyBlocked === true) conflicts.push({ url: crawlability.robots.url, signals: ["site_globally_blocked_by_robots"] });
  const homepageUrl = evidence.pages.find((page) => page.isHomepage)?.finalUrl;
  const homepageConflict = conflicts.some((conflict) => conflict.url === homepageUrl);
  const status: AnalyzerFinding["status"] = conflicts.length === 0 ? "PASS" : homepageConflict || crawlability.robots.globallyBlocked === true || conflicts.length >= 2 ? "FAIL" : "WARNING";
  return finding({ ruleId: "SEO-014", status, confidence: "HIGH", applicable: true, summary: status === "PASS" ? "No conflicting indexability signals were found in the analyzed evidence." : status === "FAIL" ? "Conflicting indexability signals affect the homepage, multiple pages, or the site-wide robots policy." : "A conflicting indexability signal was found on a sampled page.", result: { conflictCount: conflicts.length, homepageConflict, globallyBlocked: crawlability.robots.globallyBlocked === true }, evidence: { conflicts, sitemapPresent: crawlability.sitemap.present, robotsGloballyBlocked: crawlability.robots.globallyBlocked } });
}

export function runSeoBatch3(input: { evidence: SeoEvidence; crawlability: CrawlabilityEvidence }): AnalyzerFinding[] {
  return [seo010(input.evidence), seo011(input.evidence), seo012(input.evidence), seo013(input.evidence), seo014(input.evidence, input.crawlability)];
}
