import "server-only";

import type { CrawlabilityEvidence, InvalidLinkEvidence, LinkFact, LinkIntegrityEvidence, LinkProbeEvidence, PageFacts, UnsupportedProtocolEvidence } from "@/lib/website-analyzer/types";
import { validateWebsiteUrl } from "@/lib/website-analyzer/url";

const EXTERNAL_PROBE_LIMIT = 20;
const PROBE_TIMEOUT_MS = 6_000;
const MAX_REDIRECTS = 5;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const ALLOWED_NON_HTTP_PROTOCOLS = new Set(["mailto:", "tel:"]);

function hostnameBase(hostname: string): string { return hostname.toLowerCase().replace(/^www\./, ""); }
function isSameSite(url: string, siteUrl: string): boolean { return hostnameBase(new URL(url).hostname) === hostnameBase(new URL(siteUrl).hostname); }

function classifyLinks(pageUrl: string, links: LinkFact[], siteUrl: string, output: { internal: Set<string>; external: Set<string>; invalid: InvalidLinkEvidence[]; unsupported: UnsupportedProtocolEvidence[] }) {
  for (const link of links) {
    const href = link.href;
    if (href === null) { output.invalid.push({ pageUrl, href: null, reason: "missing" }); continue; }
    if (!href.trim() || href.trim() === "#") { output.invalid.push({ pageUrl, href, reason: "empty" }); continue; }
    let parsed: URL;
    try { parsed = new URL(href, pageUrl); } catch { output.invalid.push({ pageUrl, href, reason: "malformed" }); continue; }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      if (!ALLOWED_NON_HTTP_PROTOCOLS.has(parsed.protocol)) output.unsupported.push({ pageUrl, href, protocol: parsed.protocol || "unknown" });
      continue;
    }
    parsed.hash = "";
    const normalized = parsed.toString();
    if (isSameSite(normalized, siteUrl)) output.internal.add(normalized); else output.external.add(normalized);
  }
}

async function probeExternal(url: string): Promise<LinkProbeEvidence> {
  try {
    let target = await validateWebsiteUrl(url);
    for (let attempt = 0; attempt <= MAX_REDIRECTS; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
      try {
        const response = await fetch(target.normalizedUrl, {
          method: "GET", redirect: "manual", cache: "no-store", signal: controller.signal,
          headers: { "User-Agent": "TEQQI-OS-Website-Analyzer/1.0 (+https://theteqqi.com)", Accept: "text/html,*/*;q=0.1" },
        });
        if (REDIRECT_STATUSES.has(response.status)) {
          await response.body?.cancel();
          const location = response.headers.get("location");
          if (!location) return { url, kind: "external", reachable: false, statusCode: response.status, finalUrl: target.normalizedUrl, error: "Redirect response omitted Location." };
          if (attempt === MAX_REDIRECTS) return { url, kind: "external", reachable: false, statusCode: response.status, finalUrl: target.normalizedUrl, error: "External link exceeded redirect limit." };
          target = await validateWebsiteUrl(new URL(location, target.normalizedUrl).toString());
          continue;
        }
        await response.body?.cancel();
        return { url, kind: "external", reachable: response.status < 400, statusCode: response.status, finalUrl: target.normalizedUrl, error: null };
      } finally { clearTimeout(timer); }
    }
  } catch (error) {
    const timeout = error instanceof Error && error.name === "AbortError";
    return { url, kind: "external", reachable: timeout ? null : false, statusCode: null, finalUrl: null, error: timeout ? "External link probe timed out." : error instanceof Error ? error.message : "External link probe failed." };
  }
  return { url, kind: "external", reachable: null, statusCode: null, finalUrl: null, error: "External link probe ended without a conclusive response." };
}

export async function collectLinkIntegrityEvidence(input: { finalUrl: string; homepageFacts: PageFacts | null; crawlability: CrawlabilityEvidence }): Promise<LinkIntegrityEvidence> {
  const internal = new Set<string>(); const external = new Set<string>(); const invalid: InvalidLinkEvidence[] = []; const unsupported: UnsupportedProtocolEvidence[] = [];
  let totalLinks = 0; let sourcePageCount = 0;
  if (input.homepageFacts) { sourcePageCount += 1; totalLinks += input.homepageFacts.links.length; classifyLinks(input.finalUrl, input.homepageFacts.links, input.finalUrl, { internal, external, invalid, unsupported }); }
  for (const page of input.crawlability.internalCrawl.pages) {
    if (!page.links || !page.finalUrl) continue;
    sourcePageCount += 1; totalLinks += page.links.length; classifyLinks(page.finalUrl, page.links, input.finalUrl, { internal, external, invalid, unsupported });
  }
  const pageByUrl = new Map(input.crawlability.internalCrawl.pages.map((page) => [page.url, page]));
  const internalProbes: LinkProbeEvidence[] = [...internal].map((url) => {
    if (url === input.finalUrl) return { url, kind: "internal", reachable: true, statusCode: 200, finalUrl: input.finalUrl, error: null };
    const page = pageByUrl.get(url);
    if (!page) return { url, kind: "internal", reachable: null, statusCode: null, finalUrl: null, error: "Link was discovered but not sampled within the crawl limit." };
    return { url, kind: "internal", reachable: page.reachable, statusCode: page.statusCode, finalUrl: page.finalUrl, error: page.error };
  });
  const externalUrls = [...external];
  const externalProbes = await Promise.all(externalUrls.slice(0, EXTERNAL_PROBE_LIMIT).map(probeExternal));
  return { sourcePageCount, totalLinks, internalLinks: [...internal], externalLinks: externalUrls, internalProbes, externalProbes, invalidLinks: invalid, unsupportedProtocols: unsupported, externalProbeLimit: EXTERNAL_PROBE_LIMIT, externalProbeTruncated: externalUrls.length > EXTERNAL_PROBE_LIMIT };
}
