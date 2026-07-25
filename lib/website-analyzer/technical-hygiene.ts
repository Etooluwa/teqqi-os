import "server-only";

import { load } from "cheerio";

import type {
  CrawlabilityEvidence,
  HtmlFetchResult,
  PageFacts,
  TechnicalHygieneEvidence,
  TechnicalResourceProbe,
} from "@/lib/website-analyzer/types";
import { validateWebsiteUrl } from "@/lib/website-analyzer/url";

const PROBE_TIMEOUT_MS = 6_000;
const MAX_REDIRECTS = 5;
const MAX_BODY_BYTES = 64_000;
const FIRST_PARTY_RESOURCE_LIMIT = 20;
const USER_AGENT = "TEQQI-OS-Website-Analyzer/1.0 (+https://theteqqi.com)";
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const NOT_FOUND_PATH = "/__teqqi_os_definitely_missing_404_probe__";

type ProbeWithBody = TechnicalResourceProbe & { bodySample: string };

function withoutBodySample(probe: ProbeWithBody): TechnicalResourceProbe {
  return {
    url: probe.url,
    reachable: probe.reachable,
    statusCode: probe.statusCode,
    finalUrl: probe.finalUrl,
    error: probe.error,
  };
}

function hostnameBase(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\./, "");
}

function sameSite(left: string, right: string): boolean {
  return hostnameBase(new URL(left).hostname) === hostnameBase(new URL(right).hostname);
}

async function readBodySample(response: Response): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      const remaining = MAX_BODY_BYTES - total;
      if (remaining <= 0) {
        await reader.cancel();
        break;
      }
      chunks.push(value.byteLength <= remaining ? value : value.slice(0, remaining));
      total += Math.min(value.byteLength, remaining);
      if (total >= MAX_BODY_BYTES) {
        await reader.cancel();
        break;
      }
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

async function safeProbe(rawUrl: string, captureBody = false): Promise<ProbeWithBody> {
  try {
    let target = await validateWebsiteUrl(rawUrl);
    for (let attempt = 0; attempt <= MAX_REDIRECTS; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
      try {
        const response = await fetch(target.normalizedUrl, {
          method: "GET",
          redirect: "manual",
          cache: "no-store",
          signal: controller.signal,
          headers: { "User-Agent": USER_AGENT, Accept: "text/html,image/*,*/*;q=0.1" },
        });
        if (REDIRECT_STATUSES.has(response.status)) {
          await response.body?.cancel();
          const location = response.headers.get("location");
          if (!location) {
            return { url: rawUrl, reachable: false, statusCode: response.status, finalUrl: target.normalizedUrl, error: "Redirect response omitted Location.", bodySample: "" };
          }
          if (attempt === MAX_REDIRECTS) {
            return { url: rawUrl, reachable: false, statusCode: response.status, finalUrl: target.normalizedUrl, error: "Resource exceeded redirect limit.", bodySample: "" };
          }
          target = await validateWebsiteUrl(new URL(location, target.normalizedUrl).toString());
          continue;
        }
        const bodySample = captureBody ? await readBodySample(response) : "";
        if (!captureBody) await response.body?.cancel();
        return {
          url: rawUrl,
          reachable: response.status < 400,
          statusCode: response.status,
          finalUrl: target.normalizedUrl,
          error: null,
          bodySample,
        };
      } finally {
        clearTimeout(timer);
      }
    }
  } catch (error) {
    const timeout = error instanceof Error && error.name === "AbortError";
    return {
      url: rawUrl,
      reachable: timeout ? null : false,
      statusCode: null,
      finalUrl: null,
      error: timeout ? "Resource probe timed out." : error instanceof Error ? error.message : "Resource probe failed.",
      bodySample: "",
    };
  }
  return { url: rawUrl, reachable: null, statusCode: null, finalUrl: null, error: "Resource probe ended inconclusively.", bodySample: "" };
}

function looksLikeNotFound(body: string): boolean | null {
  if (!body.trim()) return null;
  const text = load(body).text().replace(/\s+/g, " ").trim().toLowerCase();
  if (!text) return null;
  return /\b(404|page not found|not found|page doesn't exist|page does not exist|couldn't find|cannot be found)\b/.test(text);
}

function declaredCharset(fetchResult: HtmlFetchResult): TechnicalHygieneEvidence["document"] {
  const header = fetchResult.contentType ?? "";
  const headerMatch = /charset\s*=\s*["']?([^;\s"']+)/i.exec(header);
  if (headerMatch?.[1]) return { doctypePresent: /^\s*<!doctype\s+html\b/i.test(fetchResult.html), declaredCharset: headerMatch[1].toLowerCase(), charsetSource: "HTTP_HEADER" };

  const $ = load(fetchResult.html);
  const metaCharset = $("meta[charset]").first().attr("charset")?.trim();
  if (metaCharset) return { doctypePresent: /^\s*<!doctype\s+html\b/i.test(fetchResult.html), declaredCharset: metaCharset.toLowerCase(), charsetSource: "META_CHARSET" };

  const httpEquiv = $('meta[http-equiv="content-type" i]').first().attr("content") ?? "";
  const metaMatch = /charset\s*=\s*([^;\s]+)/i.exec(httpEquiv);
  return {
    doctypePresent: /^\s*<!doctype\s+html\b/i.test(fetchResult.html),
    declaredCharset: metaMatch?.[1]?.toLowerCase() ?? null,
    charsetSource: metaMatch?.[1] ? "META_HTTP_EQUIV" : null,
  };
}

function declaredFaviconUrls(html: string, finalUrl: string): string[] {
  const $ = load(html);
  const urls = new Set<string>();
  $("link[rel][href]").each((_, element) => {
    const rel = ($(element).attr("rel") ?? "").toLowerCase().split(/\s+/);
    if (!rel.some((token) => token === "icon" || token === "shortcut" || token === "apple-touch-icon")) return;
    const href = $(element).attr("href");
    if (!href) return;
    try {
      const url = new URL(href, finalUrl);
      if (["http:", "https:"].includes(url.protocol)) urls.add(url.toString());
    } catch {
      // Invalid declarations are ignored here; link-integrity rules cover malformed URLs.
    }
  });
  return [...urls];
}

function firstPartyResourceUrls(html: string, finalUrl: string): string[] {
  const $ = load(html);
  const urls = new Set<string>();
  const selectors: Array<[string, string]> = [
    ["script[src]", "src"], ["link[rel~='stylesheet'][href]", "href"], ["img[src]", "src"],
    ["iframe[src]", "src"], ["object[data]", "data"], ["embed[src]", "src"],
  ];
  for (const [selector, attribute] of selectors) {
    $(selector).each((_, element) => {
      const value = $(element).attr(attribute);
      if (!value) return;
      try {
        const url = new URL(value, finalUrl);
        if (["http:", "https:"].includes(url.protocol) && sameSite(url.toString(), finalUrl)) urls.add(url.toString());
      } catch {
        // Malformed resource URLs are outside this rule's availability scope.
      }
    });
  }
  return [...urls];
}

export async function collectTechnicalHygieneEvidence(input: {
  fetchResult: HtmlFetchResult;
  pageFacts: PageFacts | null;
  crawlability: CrawlabilityEvidence;
}): Promise<TechnicalHygieneEvidence> {
  const finalUrl = input.fetchResult.finalUrl;
  const notFoundUrl = new URL(NOT_FOUND_PATH, finalUrl).toString();
  const notFound = await safeProbe(notFoundUrl, true);

  const declaredIcons = input.pageFacts ? declaredFaviconUrls(input.fetchResult.html, finalUrl) : [];
  const conventionalUrl = new URL("/favicon.ico", finalUrl).toString();
  const iconCandidates = [...new Set([...declaredIcons, conventionalUrl])];
  const faviconProbes = await Promise.all(iconCandidates.slice(0, 5).map((url) => safeProbe(url)));

  const firstPartyUrls = input.pageFacts ? firstPartyResourceUrls(input.fetchResult.html, finalUrl) : [];
  const resourceProbes = await Promise.all(firstPartyUrls.slice(0, FIRST_PARTY_RESOURCE_LIMIT).map((url) => safeProbe(url)));
  const failedResources = resourceProbes.filter((probe) => probe.reachable === false).length;
  const unknownResources = resourceProbes.filter((probe) => probe.reachable === null).length;

  const crawlStatuses = input.crawlability.internalCrawl.pages;
  return {
    notFoundProbe: {
      requestedUrl: notFoundUrl,
      statusCode: notFound.statusCode,
      finalUrl: notFound.finalUrl,
      bodySample: notFound.bodySample.slice(0, 4_000),
      appearsNotFound: notFound.statusCode === null ? null : looksLikeNotFound(notFound.bodySample),
      error: notFound.error,
    },
    homepageServerError: input.fetchResult.status >= 500,
    crawledServerErrorUrls: crawlStatuses.filter((page) => (page.statusCode ?? 0) >= 500).map((page) => page.url),
    crawledClientErrorUrls: crawlStatuses.filter((page) => (page.statusCode ?? 0) >= 400 && (page.statusCode ?? 0) < 500).map((page) => page.url),
    favicon: { declaredUrls: declaredIcons, conventionalUrl, probes: faviconProbes.map(withoutBodySample) },
    document: declaredCharset(input.fetchResult),
    javascriptRuntime: {
      inspected: false,
      errorCount: null,
      limitation: "JavaScript runtime failures require an isolated rendered-browser execution environment and are not inferred from static HTML.",
    },
    firstPartyResources: {
      totalReferences: firstPartyUrls.length,
      probedCount: resourceProbes.length,
      failedCount: failedResources,
      unknownCount: unknownResources,
      probes: resourceProbes.map(withoutBodySample),
      probeLimit: FIRST_PARTY_RESOURCE_LIMIT,
      truncated: firstPartyUrls.length > FIRST_PARTY_RESOURCE_LIMIT,
    },
  };
}
