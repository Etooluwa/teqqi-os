import "server-only";

import { load } from "cheerio";

import { WebsiteAnalyzerError } from "@/lib/website-analyzer/errors";
import { fetchWebsiteHtml } from "@/lib/website-analyzer/fetch";
import { extractPageFacts } from "@/lib/website-analyzer/html";
import type {
  CrawlabilityEvidence,
  CrawledPageEvidence,
  InternalCrawlEvidence,
  PageFacts,
  RedirectHop,
  RobotsEvidence,
  SitemapEvidence,
  SitemapUrlProbe,
} from "@/lib/website-analyzer/types";
import { validateWebsiteUrl } from "@/lib/website-analyzer/url";

const RESOURCE_TIMEOUT_MS = 7_500;
const MAX_RESOURCE_BYTES = 1_000_000;
const MAX_REDIRECTS = 5;
const MAX_SITEMAP_URLS_TO_STORE = 100;
const MAX_SITEMAP_URLS_TO_PROBE = 10;
const MAX_CRAWL_PAGES = 20;
const MAX_CRAWL_DEPTH = 2;
const USER_AGENT = "TEQQI-OS-Website-Analyzer/1.0 (+https://theteqqi.com)";
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

function hostnameBase(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\./, "");
}

function sameSite(left: string, right: string): boolean {
  return hostnameBase(new URL(left).hostname) === hostnameBase(new URL(right).hostname);
}

function normalizeCrawlUrl(value: string, baseUrl: string): string | null {
  try {
    const url = new URL(value, baseUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

type PublicResourceResult = {
  requestedUrl: string;
  finalUrl: string;
  statusCode: number;
  contentType: string | null;
  body: string;
  redirects: RedirectHop[];
};

async function readTextWithLimit(response: Response): Promise<string> {
  if (!response.body) return "";

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > MAX_RESOURCE_BYTES) {
        await reader.cancel();
        throw new WebsiteAnalyzerError(
          "RESPONSE_TOO_LARGE",
          `Supporting resource exceeded the ${MAX_RESOURCE_BYTES} byte analysis limit.`,
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

  return new TextDecoder("utf-8", { fatal: false }).decode(merged);
}

async function fetchPublicResource(rawUrl: string): Promise<PublicResourceResult> {
  let current = await validateWebsiteUrl(rawUrl);
  const redirects: RedirectHop[] = [];

  for (let attempt = 0; attempt <= MAX_REDIRECTS; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), RESOURCE_TIMEOUT_MS);

    try {
      const response = await fetch(current.normalizedUrl, {
        method: "GET",
        redirect: "manual",
        cache: "no-store",
        signal: controller.signal,
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "text/plain,application/xml,text/xml,text/html;q=0.5,*/*;q=0.1",
        },
      });

      if (REDIRECT_STATUSES.has(response.status)) {
        if (attempt === MAX_REDIRECTS) {
          throw new WebsiteAnalyzerError("TOO_MANY_REDIRECTS", "Supporting resource exceeded the redirect limit.", 508);
        }
        const location = response.headers.get("location");
        if (!location) {
          throw new WebsiteAnalyzerError(
            "REDIRECT_LOCATION_MISSING",
            "Supporting resource redirected without a Location header.",
            502,
          );
        }
        const nextUrl = new URL(location, current.normalizedUrl).toString();
        const next = await validateWebsiteUrl(nextUrl);
        redirects.push({ fromUrl: current.normalizedUrl, toUrl: next.normalizedUrl, status: response.status });
        current = next;
        continue;
      }

      return {
        requestedUrl: rawUrl,
        finalUrl: current.normalizedUrl,
        statusCode: response.status,
        contentType: response.headers.get("content-type"),
        body: await readTextWithLimit(response),
        redirects,
      };
    } catch (error) {
      if (error instanceof WebsiteAnalyzerError) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        throw new WebsiteAnalyzerError("FETCH_TIMEOUT", "Supporting resource request timed out.", 504);
      }
      throw new WebsiteAnalyzerError("FETCH_NETWORK_ERROR", "Supporting resource request failed.", 502);
    } finally {
      clearTimeout(timer);
    }
  }

  throw new WebsiteAnalyzerError("TOO_MANY_REDIRECTS", "Supporting resource exceeded the redirect limit.", 508);
}

function parseRobots(body: string, robotsUrl: string): Pick<RobotsEvidence, "userAgentStarPresent" | "globallyBlocked" | "sitemapUrls"> {
  const lines = body.split(/\r?\n/);
  let appliesToStar = false;
  let userAgentStarPresent = false;
  let globalDisallow = false;
  let globalAllowRoot = false;
  const sitemapUrls = new Set<string>();

  for (const rawLine of lines) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const separator = line.indexOf(":");
    if (separator < 0) continue;
    const key = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();

    if (key === "user-agent") {
      appliesToStar = value === "*";
      if (appliesToStar) userAgentStarPresent = true;
      continue;
    }

    if (key === "sitemap") {
      const normalized = normalizeCrawlUrl(value, robotsUrl);
      if (normalized) sitemapUrls.add(normalized);
      continue;
    }

    if (!appliesToStar) continue;
    if (key === "disallow" && value === "/") globalDisallow = true;
    if (key === "allow" && value === "/") globalAllowRoot = true;
  }

  return {
    userAgentStarPresent,
    globallyBlocked: userAgentStarPresent ? globalDisallow && !globalAllowRoot : false,
    sitemapUrls: [...sitemapUrls],
  };
}

async function collectRobotsEvidence(finalUrl: string): Promise<RobotsEvidence> {
  const robotsUrl = new URL("/robots.txt", finalUrl).toString();

  try {
    const response = await fetchPublicResource(robotsUrl);
    const reachable = response.statusCode >= 200 && response.statusCode < 400;
    const parsed = reachable
      ? parseRobots(response.body, response.finalUrl)
      : { userAgentStarPresent: false, globallyBlocked: null, sitemapUrls: [] as string[] };

    return {
      url: response.finalUrl,
      reachable,
      statusCode: response.statusCode,
      contentType: response.contentType,
      bodySample: response.body.slice(0, 8_000),
      userAgentStarPresent: parsed.userAgentStarPresent,
      globallyBlocked: parsed.globallyBlocked,
      sitemapUrls: parsed.sitemapUrls,
      error: null,
    };
  } catch (error) {
    return {
      url: robotsUrl,
      reachable: false,
      statusCode: null,
      contentType: null,
      bodySample: "",
      userAgentStarPresent: false,
      globallyBlocked: null,
      sitemapUrls: [],
      error: error instanceof Error ? error.message : "robots.txt request failed",
    };
  }
}

function parseSitemapXml(body: string): {
  validXml: boolean;
  sitemapType: SitemapEvidence["sitemapType"];
  urls: string[];
} {
  try {
    const $ = load(body, { xmlMode: true });
    const hasUrlset = $("urlset").length > 0;
    const hasIndex = $("sitemapindex").length > 0;
    if (!hasUrlset && !hasIndex) return { validXml: false, sitemapType: "unknown", urls: [] };

    const urls = $("loc")
      .map((_, element) => $(element).text().trim())
      .get()
      .filter(Boolean)
      .slice(0, MAX_SITEMAP_URLS_TO_STORE);

    return {
      validXml: true,
      sitemapType: hasIndex ? "sitemapindex" : "urlset",
      urls,
    };
  } catch {
    return { validXml: false, sitemapType: "unknown", urls: [] };
  }
}

async function probeUrl(url: string): Promise<SitemapUrlProbe> {
  try {
    const response = await fetchPublicResource(url);
    return {
      url,
      reachable: response.statusCode >= 200 && response.statusCode < 400,
      statusCode: response.statusCode,
      finalUrl: response.finalUrl,
      error: null,
    };
  } catch (error) {
    return {
      url,
      reachable: false,
      statusCode: null,
      finalUrl: null,
      error: error instanceof Error ? error.message : "URL probe failed",
    };
  }
}

async function collectSitemapEvidence(finalUrl: string, robots: RobotsEvidence): Promise<SitemapEvidence> {
  const candidates = [...new Set([...robots.sitemapUrls, new URL("/sitemap.xml", finalUrl).toString()])];

  for (const candidate of candidates) {
    try {
      const response = await fetchPublicResource(candidate);
      if (response.statusCode < 200 || response.statusCode >= 400) continue;
      const parsed = parseSitemapXml(response.body);
      if (!parsed.validXml) continue;

      const pageUrls = parsed.sitemapType === "urlset"
        ? parsed.urls.filter((url) => normalizeCrawlUrl(url, response.finalUrl) !== null)
        : [];
      const checkedUrls = await Promise.all(pageUrls.slice(0, MAX_SITEMAP_URLS_TO_PROBE).map(probeUrl));

      return {
        candidates,
        selectedUrl: response.finalUrl,
        present: true,
        statusCode: response.statusCode,
        validXml: true,
        sitemapType: parsed.sitemapType,
        discoveredUrls: parsed.urls,
        checkedUrls,
        error: null,
      };
    } catch {
      // Try the next declared or conventional sitemap candidate.
    }
  }

  return {
    candidates,
    selectedUrl: null,
    present: false,
    statusCode: null,
    validXml: false,
    sitemapType: null,
    discoveredUrls: [],
    checkedUrls: [],
    error: null,
  };
}

function internalLinks(pageFacts: PageFacts, pageUrl: string, siteUrl: string): string[] {
  const urls = new Set<string>();
  for (const link of pageFacts.links) {
    if (!link.href) continue;
    const normalized = normalizeCrawlUrl(link.href, pageUrl);
    if (!normalized || !sameSite(normalized, siteUrl)) continue;
    urls.add(normalized);
  }
  return [...urls];
}

async function crawlInternalPages(
  finalUrl: string,
  homepageFacts: PageFacts | null,
  robots: RobotsEvidence,
): Promise<InternalCrawlEvidence> {
  if (!homepageFacts || robots.globallyBlocked === true) {
    return {
      maxPages: MAX_CRAWL_PAGES,
      maxDepth: MAX_CRAWL_DEPTH,
      attemptedPages: 0,
      reachablePages: 0,
      htmlPages: 0,
      pages: [],
      truncated: false,
    };
  }

  const queue = internalLinks(homepageFacts, finalUrl, finalUrl)
    .filter((url) => url !== finalUrl)
    .map((url) => ({ url, depth: 1 }));
  const queued = new Set(queue.map((entry) => entry.url));
  const visited = new Set<string>([finalUrl]);
  const pages: CrawledPageEvidence[] = [];

  while (queue.length > 0 && pages.length < MAX_CRAWL_PAGES) {
    const entry = queue.shift();
    if (!entry || visited.has(entry.url)) continue;
    visited.add(entry.url);

    try {
      const target = await validateWebsiteUrl(entry.url);
      const response = await fetchWebsiteHtml(target);
      const finalSameSite = sameSite(response.finalUrl, finalUrl);
      const contentType = (response.contentType ?? "").toLowerCase();
      const html = finalSameSite && (contentType.includes("text/html") || contentType.includes("application/xhtml+xml"));
      let discoveredInternalLinks = 0;

      if (html && entry.depth < MAX_CRAWL_DEPTH) {
        const facts = extractPageFacts(response.html);
        const nextLinks = internalLinks(facts, response.finalUrl, finalUrl);
        discoveredInternalLinks = nextLinks.length;
        for (const nextUrl of nextLinks) {
          if (!visited.has(nextUrl) && !queued.has(nextUrl) && queue.length + pages.length < MAX_CRAWL_PAGES * 4) {
            queued.add(nextUrl);
            queue.push({ url: nextUrl, depth: entry.depth + 1 });
          }
        }
      }

      pages.push({
        url: entry.url,
        finalUrl: response.finalUrl,
        depth: entry.depth,
        reachable: response.status >= 200 && response.status < 400 && finalSameSite,
        statusCode: response.status,
        html,
        discoveredInternalLinks,
        error: finalSameSite ? null : "Redirected outside the analyzed site.",
      });
    } catch (error) {
      pages.push({
        url: entry.url,
        finalUrl: null,
        depth: entry.depth,
        reachable: false,
        statusCode: null,
        html: false,
        discoveredInternalLinks: 0,
        error: error instanceof Error ? error.message : "Internal page fetch failed",
      });
    }
  }

  return {
    maxPages: MAX_CRAWL_PAGES,
    maxDepth: MAX_CRAWL_DEPTH,
    attemptedPages: pages.length,
    reachablePages: pages.filter((page) => page.reachable).length,
    htmlPages: pages.filter((page) => page.html).length,
    pages,
    truncated: queue.length > 0,
  };
}

export async function collectCrawlabilityEvidence(input: {
  finalUrl: string;
  homepageFacts: PageFacts | null;
}): Promise<CrawlabilityEvidence> {
  const robots = await collectRobotsEvidence(input.finalUrl);
  const [sitemap, internalCrawl] = await Promise.all([
    collectSitemapEvidence(input.finalUrl, robots),
    crawlInternalPages(input.finalUrl, input.homepageFacts, robots),
  ]);

  return { robots, sitemap, internalCrawl };
}
