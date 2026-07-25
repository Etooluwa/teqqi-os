import "server-only";

import type {
  AnalyzerFinding,
  CrawlabilityEvidence,
  LinkFact,
  SeoEvidence,
  SeoPageEvidence,
} from "@/lib/website-analyzer/types";

const DETECTOR_VERSION = "1.0.0";
const GENERIC_ANCHORS = new Set([
  "click here",
  "here",
  "read more",
  "learn more",
  "more",
  "details",
  "link",
  "this",
]);
const GENERIC_IMAGE_NAMES = /^(image|img|photo|picture|pic|untitled|download|screenshot|asset)[-_\d]*$/i;

function finding(input: Omit<AnalyzerFinding, "category" | "detectorVersion">): AnalyzerFinding {
  return { ...input, category: "SEO", detectorVersion: DETECTOR_VERSION };
}

function affectedStatus(input: {
  affected: number;
  total: number;
  homepageAffected?: boolean;
  failRatio?: number;
  failCount?: number;
}): AnalyzerFinding["status"] {
  const { affected, total, homepageAffected = false, failRatio = 0.25, failCount = 2 } = input;
  if (affected === 0) return "PASS";
  const ratio = total > 0 ? affected / total : 0;
  if (homepageAffected || affected >= failCount || ratio >= failRatio) return "FAIL";
  return "WARNING";
}

function sameSite(left: string, right: string): boolean {
  try {
    const normalize = (hostname: string) => hostname.toLowerCase().replace(/^www\./, "");
    return normalize(new URL(left).hostname) === normalize(new URL(right).hostname);
  } catch {
    return false;
  }
}

function normalizeUrl(raw: string, base: string): string | null {
  try {
    const url = new URL(raw, base);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    url.hash = "";
    if ((url.protocol === "https:" && url.port === "443") || (url.protocol === "http:" && url.port === "80")) url.port = "";
    if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    return url.toString();
  } catch {
    return null;
  }
}

function normalizedText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function contentTokens(page: SeoPageEvidence): Set<string> {
  return new Set(normalizedText(page.facts.bodyTextSample).split(" ").filter((token) => token.length >= 3));
}

function jaccard(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 && right.size === 0) return 1;
  let intersection = 0;
  for (const token of left) if (right.has(token)) intersection += 1;
  const union = left.size + right.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function seo015(evidence: SeoEvidence): AnalyzerFinding {
  const pagesWithImages = evidence.pages.filter((page) => page.facts.images.length > 0);
  if (pagesWithImages.length === 0) {
    return finding({ ruleId: "SEO-015", status: "NOT_APPLICABLE", confidence: "HIGH", applicable: false, summary: "Image alt-attribute evaluation is not applicable because no images were found.", result: { pagesEvaluated: evidence.pages.length, imagesEvaluated: 0 }, evidence: { pages: [] } });
  }

  const pages = pagesWithImages.map((page) => {
    const images = page.facts.images.map((image) => ({ src: image.src, alt: image.alt, hasAltAttribute: image.hasAltAttribute }));
    const missingAttribute = images.filter((image) => !image.hasAltAttribute);
    const emptyAlt = images.filter((image) => image.hasAltAttribute && image.alt === "");
    return { url: page.finalUrl, isHomepage: page.isHomepage, imageCount: images.length, missingAltAttributeCount: missingAttribute.length, emptyAltCount: emptyAlt.length, images };
  });
  const imageCount = pages.reduce((sum, page) => sum + page.imageCount, 0);
  const missingCount = pages.reduce((sum, page) => sum + page.missingAltAttributeCount, 0);
  const affectedPages = pages.filter((page) => page.missingAltAttributeCount > 0);
  const homepageAffected = affectedPages.some((page) => page.isHomepage);
  const status = affectedStatus({ affected: missingCount, total: imageCount, homepageAffected, failRatio: 0.2, failCount: 3 });
  const summary = status === "PASS" ? "All analyzed images include an alt attribute." : status === "FAIL" ? `${missingCount} analyzed images are missing alt attributes.` : "A small number of analyzed images are missing alt attributes.";

  return finding({ ruleId: "SEO-015", status, confidence: "HIGH", applicable: true, summary, result: { pagesEvaluated: pages.length, imagesEvaluated: imageCount, imagesMissingAltAttribute: missingCount, imagesWithEmptyAlt: pages.reduce((sum, page) => sum + page.emptyAltCount, 0), affectedPages: affectedPages.length }, evidence: { pages } });
}

function imageFilename(src: string | null, base: string): string | null {
  if (!src) return null;
  try {
    const url = new URL(src, base);
    const part = url.pathname.split("/").filter(Boolean).pop();
    if (!part) return null;
    return decodeURIComponent(part).replace(/\.[a-z0-9]+$/i, "");
  } catch {
    return null;
  }
}

function seo016(evidence: SeoEvidence): AnalyzerFinding {
  const images = evidence.pages.flatMap((page) => page.facts.images.map((image) => {
    const filename = imageFilename(image.src, page.finalUrl);
    const missingSrc = !image.src;
    const dataUri = Boolean(image.src?.startsWith("data:"));
    const genericFilename = Boolean(filename && GENERIC_IMAGE_NAMES.test(filename));
    const dimensionsMissing = !image.width || !image.height;
    return { pageUrl: page.finalUrl, isHomepage: page.isHomepage, src: image.src, filename, width: image.width, height: image.height, missingSrc, dataUri, genericFilename, dimensionsMissing };
  }));

  if (images.length === 0) return finding({ ruleId: "SEO-016", status: "NOT_APPLICABLE", confidence: "HIGH", applicable: false, summary: "Image SEO hygiene is not applicable because no images were found.", result: { imagesEvaluated: 0 }, evidence: { images: [] } });

  const severe = images.filter((image) => image.missingSrc || image.dataUri);
  const weak = images.filter((image) => image.genericFilename || image.dimensionsMissing);
  const homepageSevere = severe.some((image) => image.isHomepage);
  const status: AnalyzerFinding["status"] = severe.length > 0 ? affectedStatus({ affected: severe.length, total: images.length, homepageAffected: homepageSevere, failRatio: 0.1, failCount: 2 }) : weak.length > 0 ? "WARNING" : "PASS";
  const summary = status === "PASS" ? "Analyzed images have usable source references and no obvious hygiene problems." : status === "FAIL" ? "One or more analyzed images have severe source or delivery hygiene problems." : "Analyzed images contain non-critical SEO hygiene warnings.";
  return finding({ ruleId: "SEO-016", status, confidence: "HIGH", applicable: true, summary, result: { imagesEvaluated: images.length, severeIssues: severe.length, genericFilenameCount: images.filter((image) => image.genericFilename).length, dimensionsMissingCount: images.filter((image) => image.dimensionsMissing).length }, evidence: { images: images.filter((image) => image.missingSrc || image.dataUri || image.genericFilename || image.dimensionsMissing).slice(0, 100), signals: ["missing_src", "data_uri", "generic_filename", "missing_explicit_dimensions"] } });
}

function internalLinkEvidence(page: SeoPageEvidence, link: LinkFact) {
  const normalized = link.href ? normalizeUrl(link.href, page.finalUrl) : null;
  if (!normalized || !sameSite(normalized, page.finalUrl)) return null;
  const anchor = (link.accessibleName || link.text || "").trim();
  const normalizedAnchor = anchor.toLowerCase().replace(/\s+/g, " ");
  return { pageUrl: page.finalUrl, targetUrl: normalized, anchor, empty: !anchor, generic: GENERIC_ANCHORS.has(normalizedAnchor) };
}

function seo017(evidence: SeoEvidence): AnalyzerFinding {
  const links = evidence.pages.flatMap((page) => page.facts.links.map((link) => internalLinkEvidence(page, link)).filter((item): item is NonNullable<typeof item> => Boolean(item)));
  if (links.length === 0) return finding({ ruleId: "SEO-017", status: "NOT_APPLICABLE", confidence: "HIGH", applicable: false, summary: "Internal anchor-quality evaluation is not applicable because no analyzable internal links were found.", result: { linksEvaluated: 0 }, evidence: { links: [] } });
  const affected = links.filter((link) => link.empty || link.generic);
  const status = affectedStatus({ affected: affected.length, total: links.length, failRatio: 0.25, failCount: 5 });
  const summary = status === "PASS" ? "Analyzed internal links use non-empty, non-generic anchor text." : status === "FAIL" ? "A significant share of analyzed internal links use empty or generic anchor text." : "A small number of internal links use weak anchor text.";
  return finding({ ruleId: "SEO-017", status, confidence: "HIGH", applicable: true, summary, result: { linksEvaluated: links.length, weakAnchorLinks: affected.length, emptyAnchorLinks: affected.filter((link) => link.empty).length, genericAnchorLinks: affected.filter((link) => link.generic).length }, evidence: { affectedLinks: affected.slice(0, 100), genericAnchorPhrases: [...GENERIC_ANCHORS] } });
}

function seo018(evidence: SeoEvidence): AnalyzerFinding {
  if (evidence.pages.length < 2) return finding({ ruleId: "SEO-018", status: "NOT_APPLICABLE", confidence: "MEDIUM", applicable: false, summary: "Orphan-page comparison requires at least two analyzed pages.", result: { pagesEvaluated: evidence.pages.length }, evidence: {} });
  const analyzed = new Map(evidence.pages.map((page) => [normalizeUrl(page.finalUrl, page.finalUrl), page] as const).filter(([url]) => Boolean(url)) as Array<[string, SeoPageEvidence]>);
  const inbound = new Map<string, number>();
  for (const url of analyzed.keys()) inbound.set(url, 0);
  for (const page of evidence.pages) {
    const source = normalizeUrl(page.finalUrl, page.finalUrl);
    for (const link of page.facts.links) {
      if (!link.href) continue;
      const target = normalizeUrl(link.href, page.finalUrl);
      if (!target || target === source || !analyzed.has(target)) continue;
      inbound.set(target, (inbound.get(target) ?? 0) + 1);
    }
  }
  const orphaned = [...analyzed.entries()].filter(([, page]) => !page.isHomepage).filter(([url]) => (inbound.get(url) ?? 0) === 0).map(([url, page]) => ({ url, depth: page.depth }));
  const status: AnalyzerFinding["status"] = orphaned.length === 0 ? "PASS" : evidence.crawlTruncated ? "UNKNOWN" : affectedStatus({ affected: orphaned.length, total: Math.max(1, analyzed.size - 1), failRatio: 0.2, failCount: 2 });
  const summary = status === "PASS" ? "Every analyzed non-homepage page has at least one inbound link from another analyzed page." : status === "UNKNOWN" ? "Potential orphan pages were found, but the bounded crawl was truncated so site-wide orphan status cannot be determined reliably." : status === "FAIL" ? "Multiple analyzed pages have no inbound links from the analyzed crawl graph." : "A sampled page has no inbound links from the analyzed crawl graph.";
  return finding({ ruleId: "SEO-018", status, confidence: status === "UNKNOWN" ? "LOW" : "MEDIUM", applicable: true, summary, result: { pagesEvaluated: analyzed.size, orphanCandidates: orphaned.length, crawlTruncated: evidence.crawlTruncated }, evidence: { inboundCounts: Object.fromEntries(inbound), orphanCandidates: orphaned, limitation: "Bounded crawl evidence cannot prove site-wide orphan status." } });
}

function seo019(evidence: SeoEvidence): AnalyzerFinding {
  if (evidence.pages.length === 0) return finding({ ruleId: "SEO-019", status: "NOT_APPLICABLE", confidence: "HIGH", applicable: false, summary: "Crawlable-text evaluation is not applicable because no HTML pages were available.", result: {}, evidence: {} });
  const pages = evidence.pages.map((page) => ({ url: page.finalUrl, isHomepage: page.isHomepage, wordCount: page.facts.bodyTextWordCount, characterCount: page.facts.bodyTextCharacterCount }));
  const severe = pages.filter((page) => page.wordCount < 25);
  const thin = pages.filter((page) => page.wordCount >= 25 && page.wordCount < 100);
  const homepageSevere = severe.some((page) => page.isHomepage);
  const status: AnalyzerFinding["status"] = severe.length > 0 ? affectedStatus({ affected: severe.length, total: pages.length, homepageAffected: homepageSevere, failRatio: 0.25, failCount: 2 }) : thin.length > 0 ? "WARNING" : "PASS";
  const summary = status === "PASS" ? "Analyzed pages expose a meaningful amount of crawlable text in source HTML." : status === "FAIL" ? "One or more analyzed pages expose very little crawlable text." : "Some analyzed pages expose relatively little crawlable text.";
  return finding({ ruleId: "SEO-019", status, confidence: "HIGH", applicable: true, summary, result: { pagesEvaluated: pages.length, severeLowTextPages: severe.length, thinTextPages: thin.length }, evidence: { thresholds: { severeWordCountBelow: 25, warningWordCountBelow: 100 }, pages } });
}

function seo020(evidence: SeoEvidence): AnalyzerFinding {
  const comparable = evidence.pages.filter((page) => page.facts.bodyTextWordCount >= 50);
  if (comparable.length < 2) return finding({ ruleId: "SEO-020", status: "NOT_APPLICABLE", confidence: "MEDIUM", applicable: false, summary: "Duplicate-content comparison requires at least two pages with enough crawlable text.", result: { pagesEvaluated: comparable.length }, evidence: {} });
  const tokens = new Map(comparable.map((page) => [page.finalUrl, contentTokens(page)]));
  const pairs: Array<{ leftUrl: string; rightUrl: string; similarity: number; classification: "exact" | "near_duplicate" }> = [];
  for (let i = 0; i < comparable.length; i += 1) {
    for (let j = i + 1; j < comparable.length; j += 1) {
      const left = comparable[i];
      const right = comparable[j];
      const leftNormalized = normalizedText(left.facts.bodyTextSample);
      const rightNormalized = normalizedText(right.facts.bodyTextSample);
      if (leftNormalized && leftNormalized === rightNormalized) {
        pairs.push({ leftUrl: left.finalUrl, rightUrl: right.finalUrl, similarity: 1, classification: "exact" });
        continue;
      }
      const similarity = jaccard(tokens.get(left.finalUrl) ?? new Set(), tokens.get(right.finalUrl) ?? new Set());
      if (similarity >= 0.9) pairs.push({ leftUrl: left.finalUrl, rightUrl: right.finalUrl, similarity: Number(similarity.toFixed(3)), classification: "near_duplicate" });
    }
  }
  const affectedUrls = new Set(pairs.flatMap((pair) => [pair.leftUrl, pair.rightUrl]));
  const status: AnalyzerFinding["status"] = pairs.length === 0 ? "PASS" : affectedUrls.size >= 3 || affectedUrls.size / comparable.length >= 0.25 ? "FAIL" : "WARNING";
  const summary = status === "PASS" ? "No exact or high-similarity duplicate content was found in the analyzed sample." : status === "FAIL" ? "Duplicate or near-duplicate text affects multiple analyzed pages." : "A small duplicate or near-duplicate content pair was found.";
  return finding({ ruleId: "SEO-020", status, confidence: "MEDIUM", applicable: true, summary, result: { pagesEvaluated: comparable.length, duplicatePairs: pairs.length, affectedPages: affectedUrls.size }, evidence: { method: "normalized_exact_or_token_jaccard", nearDuplicateThreshold: 0.9, pairs } });
}

function seo021(evidence: SeoEvidence): AnalyzerFinding {
  if (evidence.pages.length === 0) return finding({ ruleId: "SEO-021", status: "NOT_APPLICABLE", confidence: "HIGH", applicable: false, summary: "Language-declaration evaluation is not applicable because no HTML pages were available.", result: {}, evidence: {} });
  const pages = evidence.pages.map((page) => ({ url: page.finalUrl, isHomepage: page.isHomepage, lang: page.facts.htmlLang }));
  const missing = pages.filter((page) => !page.lang);
  const invalid = pages.filter((page) => page.lang && !/^[a-zA-Z]{2,3}(?:-[a-zA-Z0-9]{2,8})*$/.test(page.lang));
  const affected = new Set([...missing.map((page) => page.url), ...invalid.map((page) => page.url)]);
  const homepageAffected = pages.some((page) => page.isHomepage && affected.has(page.url));
  const status = affectedStatus({ affected: affected.size, total: pages.length, homepageAffected, failRatio: 0.25, failCount: 2 });
  const summary = status === "PASS" ? "Every analyzed page declares a syntactically usable HTML language value." : status === "FAIL" ? "Language declarations are missing or malformed on important or multiple analyzed pages." : "A sampled page is missing or has a malformed language declaration.";
  return finding({ ruleId: "SEO-021", status, confidence: "HIGH", applicable: true, summary, result: { pagesEvaluated: pages.length, pagesMissingLang: missing.length, pagesWithMalformedLang: invalid.length }, evidence: { pages } });
}

function seo022(evidence: SeoEvidence): AnalyzerFinding {
  const blocks = evidence.pages.flatMap((page) => page.facts.jsonLdBlocks.map((raw, index) => ({ pageUrl: page.finalUrl, index, raw })));
  if (blocks.length === 0) return finding({ ruleId: "SEO-022", status: "NOT_APPLICABLE", confidence: "HIGH", applicable: false, summary: "Structured-data validity is not applicable because no JSON-LD blocks were found.", result: { blocksEvaluated: 0 }, evidence: { blocks: [] } });
  const evaluated = blocks.map((block) => {
    try {
      const parsed = JSON.parse(block.raw);
      const objects = Array.isArray(parsed) ? parsed : [parsed];
      const hasContext = objects.some((item) => item && typeof item === "object" && "@context" in item);
      const hasType = objects.some((item) => item && typeof item === "object" && "@type" in item);
      return { pageUrl: block.pageUrl, index: block.index, validJson: true, hasContext, hasType, error: null };
    } catch (error) {
      return { pageUrl: block.pageUrl, index: block.index, validJson: false, hasContext: false, hasType: false, error: error instanceof Error ? error.message : "Invalid JSON-LD" };
    }
  });
  const invalid = evaluated.filter((block) => !block.validJson);
  const weak = evaluated.filter((block) => block.validJson && (!block.hasContext || !block.hasType));
  const status: AnalyzerFinding["status"] = invalid.length > 0 ? "FAIL" : weak.length > 0 ? "WARNING" : "PASS";
  const summary = status === "PASS" ? "All analyzed JSON-LD blocks are valid JSON and include core structured-data markers." : status === "FAIL" ? "One or more JSON-LD blocks contain invalid JSON." : "JSON-LD is parseable, but some blocks are missing @context or @type markers.";
  return finding({ ruleId: "SEO-022", status, confidence: "HIGH", applicable: true, summary, result: { blocksEvaluated: evaluated.length, invalidJsonBlocks: invalid.length, weakBlocks: weak.length }, evidence: { blocks: evaluated } });
}

function seo023(evidence: SeoEvidence): AnalyzerFinding {
  if (evidence.pages.length === 0) return finding({ ruleId: "SEO-023", status: "NOT_APPLICABLE", confidence: "HIGH", applicable: false, summary: "URL-structure evaluation is not applicable because no analyzed pages were available.", result: {}, evidence: {} });
  const pages = evidence.pages.map((page) => {
    const url = new URL(page.finalUrl);
    const decodedPath = decodeURIComponent(url.pathname);
    const segments = decodedPath.split("/").filter(Boolean);
    const signals: string[] = [];
    if (/[A-Z]/.test(decodedPath)) signals.push("uppercase_path");
    if (/_/.test(decodedPath)) signals.push("underscore_path");
    if (/\s/.test(decodedPath) || /%20/i.test(url.pathname)) signals.push("space_in_path");
    if (segments.some((segment) => segment.length > 60)) signals.push("very_long_segment");
    if (url.pathname.length > 160) signals.push("very_long_path");
    if (url.searchParams.size > 4) signals.push("many_query_parameters");
    return { url: page.finalUrl, isHomepage: page.isHomepage, path: url.pathname, queryParameterCount: url.searchParams.size, signals };
  });
  const affected = pages.filter((page) => page.signals.length > 0);
  const severe = affected.filter((page) => page.signals.includes("space_in_path") || page.signals.includes("very_long_path") || page.signals.includes("very_long_segment"));
  const status: AnalyzerFinding["status"] = severe.length >= 2 || severe.some((page) => page.isHomepage) ? "FAIL" : affected.length > 0 ? "WARNING" : "PASS";
  const summary = status === "PASS" ? "Analyzed page URLs use simple, readable path structures." : status === "FAIL" ? "Multiple analyzed page URLs have severe structural hygiene problems." : "Some analyzed URLs contain non-critical readability or complexity signals.";
  return finding({ ruleId: "SEO-023", status, confidence: "HIGH", applicable: true, summary, result: { pagesEvaluated: pages.length, affectedPages: affected.length, severePages: severe.length }, evidence: { pages: affected.length > 0 ? affected : pages } });
}

function seo024(evidence: SeoEvidence, crawlability: CrawlabilityEvidence): AnalyzerFinding {
  const sitemap = crawlability.sitemap;
  if (!sitemap.present || !sitemap.validXml) return finding({ ruleId: "SEO-024", status: "NOT_APPLICABLE", confidence: "HIGH", applicable: false, summary: "Sitemap indexability consistency is not applicable because no valid XML sitemap was available.", result: { sitemapPresent: sitemap.present, sitemapValid: sitemap.validXml }, evidence: { sitemapUrl: sitemap.selectedUrl } });
  const analyzedByUrl = new Map<string, SeoPageEvidence>();
  for (const page of evidence.pages) {
    const normalized = normalizeUrl(page.finalUrl, page.finalUrl);
    if (normalized) analyzedByUrl.set(normalized, page);
  }
  const sitemapUrls = sitemap.discoveredUrls.map((url) => normalizeUrl(url, sitemap.selectedUrl ?? evidence.pages[0]?.finalUrl ?? url)).filter((url): url is string => Boolean(url));
  const matched = sitemapUrls.map((url) => ({ url, page: analyzedByUrl.get(url) })).filter((item): item is { url: string; page: SeoPageEvidence } => Boolean(item.page));
  if (matched.length === 0) return finding({ ruleId: "SEO-024", status: "UNKNOWN", confidence: "LOW", applicable: true, summary: "A sitemap exists, but none of its URLs overlapped with the bounded analyzed page sample.", result: { sitemapUrls: sitemapUrls.length, matchedAnalyzedPages: 0 }, evidence: { sitemapUrl: sitemap.selectedUrl, limitation: "Bounded crawl sample did not overlap sitemap URLs." } });
  const conflicts = matched.filter(({ page }) => {
    const robots = (page.facts.metaRobots ?? "").toLowerCase();
    const noindex = robots.split(/[,\s]+/).includes("noindex");
    const canonical = page.facts.canonicalUrl ? normalizeUrl(page.facts.canonicalUrl, page.finalUrl) : null;
    const self = normalizeUrl(page.finalUrl, page.finalUrl);
    const canonicalAway = Boolean(canonical && self && canonical !== self);
    return noindex || canonicalAway;
  }).map(({ url, page }) => ({ url, metaRobots: page.facts.metaRobots, canonicalUrl: page.facts.canonicalUrl }));
  const status: AnalyzerFinding["status"] = conflicts.length === 0 ? "PASS" : conflicts.length >= 2 || conflicts.length / matched.length >= 0.25 ? "FAIL" : "WARNING";
  const summary = status === "PASS" ? "Sitemap URLs overlapping the analyzed sample do not conflict with page indexability signals." : status === "FAIL" ? "Multiple sitemap URLs conflict with noindex or canonical signals." : "A sitemap URL conflicts with page-level indexability signals.";
  return finding({ ruleId: "SEO-024", status, confidence: "MEDIUM", applicable: true, summary, result: { sitemapUrls: sitemapUrls.length, matchedAnalyzedPages: matched.length, conflictingPages: conflicts.length }, evidence: { sitemapUrl: sitemap.selectedUrl, conflicts, limitation: "Only sitemap URLs overlapping the bounded analyzed page sample are evaluated." } });
}

export function runRemainingSeoRules(input: { evidence: SeoEvidence; crawlability: CrawlabilityEvidence }): AnalyzerFinding[] {
  const { evidence, crawlability } = input;
  return [
    seo015(evidence),
    seo016(evidence),
    seo017(evidence),
    seo018(evidence),
    seo019(evidence),
    seo020(evidence),
    seo021(evidence),
    seo022(evidence),
    seo023(evidence),
    seo024(evidence, crawlability),
  ];
}
