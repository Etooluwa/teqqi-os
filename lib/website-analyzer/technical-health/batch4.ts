import "server-only";

import type { AnalyzerFinding, CrawlabilityEvidence, PageFacts } from "@/lib/website-analyzer/types";

const DETECTOR_VERSION = "1.0.0";

function finding(input: Omit<AnalyzerFinding, "category" | "detectorVersion">): AnalyzerFinding {
  return {
    ...input,
    category: "TECHNICAL_HEALTH",
    detectorVersion: DETECTOR_VERSION,
  };
}

function evaluateTech016(evidence: CrawlabilityEvidence): AnalyzerFinding {
  const robots = evidence.robots;

  if (robots.reachable) {
    return finding({
      ruleId: "TECH-016",
      status: "PASS",
      confidence: "HIGH",
      applicable: true,
      summary: "A reachable robots.txt file is present at the site root.",
      result: { robotsPresent: true, statusCode: robots.statusCode },
      evidence: { robots },
    });
  }

  if (robots.statusCode !== null) {
    return finding({
      ruleId: "TECH-016",
      status: "FAIL",
      confidence: "HIGH",
      applicable: true,
      summary: `robots.txt is not available at the site root (HTTP ${robots.statusCode}).`,
      result: { robotsPresent: false, statusCode: robots.statusCode },
      evidence: { robots },
    });
  }

  return finding({
    ruleId: "TECH-016",
    status: "UNKNOWN",
    confidence: "LOW",
    applicable: true,
    summary: "robots.txt availability could not be determined reliably.",
    result: { robotsPresent: null },
    evidence: { robots },
  });
}

function evaluateTech017(evidence: CrawlabilityEvidence): AnalyzerFinding {
  const robots = evidence.robots;

  if (robots.globallyBlocked === true) {
    return finding({
      ruleId: "TECH-017",
      status: "FAIL",
      confidence: "HIGH",
      applicable: true,
      summary: "robots.txt contains a global crawl block for the wildcard user agent.",
      result: { globallyBlocked: true },
      evidence: { robots },
    });
  }

  if (robots.globallyBlocked === false) {
    return finding({
      ruleId: "TECH-017",
      status: "PASS",
      confidence: "HIGH",
      applicable: true,
      summary: robots.reachable
        ? "robots.txt does not globally block the website from crawling."
        : "No reachable robots.txt restriction was found that globally blocks crawling.",
      result: { globallyBlocked: false },
      evidence: { robots },
    });
  }

  return finding({
    ruleId: "TECH-017",
    status: "UNKNOWN",
    confidence: "LOW",
    applicable: true,
    summary: "Global robots crawl-block behavior could not be determined reliably.",
    result: { globallyBlocked: null },
    evidence: { robots },
  });
}

function evaluateTech018(evidence: CrawlabilityEvidence): AnalyzerFinding {
  const sitemap = evidence.sitemap;

  if (sitemap.present && sitemap.validXml) {
    return finding({
      ruleId: "TECH-018",
      status: "PASS",
      confidence: "HIGH",
      applicable: true,
      summary: "A valid XML sitemap was discovered.",
      result: {
        sitemapPresent: true,
        sitemapUrl: sitemap.selectedUrl,
        sitemapType: sitemap.sitemapType,
        discoveredUrlCount: sitemap.discoveredUrls.length,
      },
      evidence: { sitemap },
    });
  }

  if (sitemap.error) {
    return finding({
      ruleId: "TECH-018",
      status: "UNKNOWN",
      confidence: "LOW",
      applicable: true,
      summary: "Sitemap availability could not be determined reliably.",
      result: { sitemapPresent: null },
      evidence: { sitemap },
    });
  }

  return finding({
    ruleId: "TECH-018",
    status: "FAIL",
    confidence: "HIGH",
    applicable: true,
    summary: "No valid XML sitemap was discovered from robots.txt or the conventional sitemap location.",
    result: { sitemapPresent: false, candidates: sitemap.candidates },
    evidence: { sitemap },
  });
}

function evaluateTech019(evidence: CrawlabilityEvidence): AnalyzerFinding {
  const sitemap = evidence.sitemap;

  if (!sitemap.present || !sitemap.validXml) {
    return finding({
      ruleId: "TECH-019",
      status: "NOT_APPLICABLE",
      confidence: "HIGH",
      applicable: false,
      summary: "Sitemap URL reachability is not applicable because no valid XML sitemap was discovered.",
      result: {},
      evidence: { sitemap },
    });
  }

  if (sitemap.checkedUrls.length === 0) {
    return finding({
      ruleId: "TECH-019",
      status: "UNKNOWN",
      confidence: "LOW",
      applicable: true,
      summary: "A sitemap was found, but no page URLs were available for a reliable reachability sample.",
      result: { checkedUrlCount: 0, reachableUrlCount: 0 },
      evidence: { sitemap },
    });
  }

  const reachable = sitemap.checkedUrls.filter((probe) => probe.reachable).length;
  const failed = sitemap.checkedUrls.length - reachable;

  if (failed === 0) {
    return finding({
      ruleId: "TECH-019",
      status: "PASS",
      confidence: "HIGH",
      applicable: true,
      summary: "All sampled sitemap page URLs were reachable.",
      result: { checkedUrlCount: sitemap.checkedUrls.length, reachableUrlCount: reachable, failedUrlCount: 0 },
      evidence: { checkedUrls: sitemap.checkedUrls, sitemapUrl: sitemap.selectedUrl },
    });
  }

  if (reachable > 0) {
    return finding({
      ruleId: "TECH-019",
      status: "WARNING",
      confidence: "HIGH",
      applicable: true,
      summary: "Some sampled sitemap page URLs were not reachable.",
      result: { checkedUrlCount: sitemap.checkedUrls.length, reachableUrlCount: reachable, failedUrlCount: failed },
      evidence: { checkedUrls: sitemap.checkedUrls, sitemapUrl: sitemap.selectedUrl },
    });
  }

  return finding({
    ruleId: "TECH-019",
    status: "FAIL",
    confidence: "HIGH",
    applicable: true,
    summary: "None of the sampled sitemap page URLs were reachable.",
    result: { checkedUrlCount: sitemap.checkedUrls.length, reachableUrlCount: 0, failedUrlCount: failed },
    evidence: { checkedUrls: sitemap.checkedUrls, sitemapUrl: sitemap.selectedUrl },
  });
}

function evaluateTech020(input: {
  evidence: CrawlabilityEvidence;
  homepageFacts: PageFacts | null;
}): AnalyzerFinding {
  const crawl = input.evidence.internalCrawl;

  if (!input.homepageFacts) {
    return finding({
      ruleId: "TECH-020",
      status: "NOT_APPLICABLE",
      confidence: "HIGH",
      applicable: false,
      summary: "Internal crawlability is not applicable because the homepage was not confirmed as HTML.",
      result: {},
      evidence: { internalCrawl: crawl },
    });
  }

  if (input.evidence.robots.globallyBlocked === true) {
    return finding({
      ruleId: "TECH-020",
      status: "NOT_APPLICABLE",
      confidence: "HIGH",
      applicable: false,
      summary: "Internal crawl sampling was not performed because robots.txt globally blocks crawling.",
      result: {},
      evidence: { internalCrawl: crawl, robots: input.evidence.robots },
    });
  }

  if (crawl.attemptedPages === 0) {
    return finding({
      ruleId: "TECH-020",
      status: "WARNING",
      confidence: "MEDIUM",
      applicable: true,
      summary: "No additional same-site pages were discovered from the homepage for crawlability sampling.",
      result: { attemptedPages: 0, reachablePages: 0 },
      evidence: { internalCrawl: crawl },
    });
  }

  if (crawl.reachablePages === crawl.attemptedPages) {
    return finding({
      ruleId: "TECH-020",
      status: "PASS",
      confidence: "HIGH",
      applicable: true,
      summary: "All sampled same-site pages were reachable within the configured crawl limits.",
      result: {
        attemptedPages: crawl.attemptedPages,
        reachablePages: crawl.reachablePages,
        maxPages: crawl.maxPages,
        maxDepth: crawl.maxDepth,
        truncated: crawl.truncated,
      },
      evidence: { internalCrawl: crawl },
    });
  }

  if (crawl.reachablePages > 0) {
    return finding({
      ruleId: "TECH-020",
      status: "WARNING",
      confidence: "HIGH",
      applicable: true,
      summary: "The internal crawl found a mixture of reachable and unreachable same-site pages.",
      result: {
        attemptedPages: crawl.attemptedPages,
        reachablePages: crawl.reachablePages,
        unreachablePages: crawl.attemptedPages - crawl.reachablePages,
      },
      evidence: { internalCrawl: crawl },
    });
  }

  return finding({
    ruleId: "TECH-020",
    status: "FAIL",
    confidence: "HIGH",
    applicable: true,
    summary: "None of the sampled same-site pages were reachable.",
    result: { attemptedPages: crawl.attemptedPages, reachablePages: 0 },
    evidence: { internalCrawl: crawl },
  });
}

export function runTechnicalHealthBatch4(input: {
  evidence: CrawlabilityEvidence;
  homepageFacts: PageFacts | null;
}): AnalyzerFinding[] {
  return [
    evaluateTech016(input.evidence),
    evaluateTech017(input.evidence),
    evaluateTech018(input.evidence),
    evaluateTech019(input.evidence),
    evaluateTech020(input),
  ];
}
