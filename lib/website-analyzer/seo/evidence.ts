import "server-only";

import { fetchWebsiteHtml } from "@/lib/website-analyzer/fetch";
import { extractPageFacts } from "@/lib/website-analyzer/html";
import type {
  CrawlabilityEvidence,
  HtmlFetchResult,
  PageFacts,
  SeoEvidence,
  SeoPageEvidence,
} from "@/lib/website-analyzer/types";
import { validateWebsiteUrl } from "@/lib/website-analyzer/url";

function isHtmlContentType(contentType: string | null): boolean {
  const value = (contentType ?? "").toLowerCase();
  return value.includes("text/html") || value.includes("application/xhtml+xml");
}

export async function collectSeoEvidence(input: {
  homepageFetch: HtmlFetchResult;
  homepageFacts: PageFacts | null;
  crawlability: CrawlabilityEvidence;
}): Promise<SeoEvidence> {
  const pages: SeoPageEvidence[] = [];

  if (input.homepageFacts) {
    pages.push({
      url: input.homepageFetch.requestedUrl,
      finalUrl: input.homepageFetch.finalUrl,
      isHomepage: true,
      depth: 0,
      statusCode: input.homepageFetch.status,
      facts: input.homepageFacts,
    });
  }

  for (const crawled of input.crawlability.internalCrawl.pages) {
    if (!crawled.html || !crawled.finalUrl || crawled.statusCode === null) continue;

    try {
      const target = await validateWebsiteUrl(crawled.finalUrl);
      const response = await fetchWebsiteHtml(target);
      if (!isHtmlContentType(response.contentType)) continue;

      pages.push({
        url: crawled.url,
        finalUrl: response.finalUrl,
        isHomepage: false,
        depth: crawled.depth,
        statusCode: response.status,
        facts: extractPageFacts(response.html),
      });
    } catch {
      // The shared crawl result remains authoritative for reachability. A page
      // that cannot be re-read for SEO facts is excluded rather than guessed.
    }
  }

  return {
    pages,
    pageCount: pages.length,
    crawlTruncated: input.crawlability.internalCrawl.truncated,
  };
}
