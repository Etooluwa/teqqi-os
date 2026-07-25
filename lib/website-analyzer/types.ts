import { WEBSITE_ANALYZER_VERSION } from "@/lib/website-analyzer/version";

export type AnalyzerCategory = "TECHNICAL_HEALTH" | "SEO" | "PERFORMANCE" | "CONVERSION_UX" | "ACCESSIBILITY" | "CONTENT_QUALITY";
export type AuditStatus = "PENDING" | "RUNNING" | "COMPLETED" | "PARTIAL" | "FAILED";
export type RuleStatus = "PASS" | "WARNING" | "FAIL" | "UNKNOWN" | "NOT_APPLICABLE";
export type ConfidenceLevel = "HIGH" | "MEDIUM" | "LOW";
export type AnalyzerFailureCode = "INVALID_REQUEST" | "INVALID_URL" | "UNSUPPORTED_PROTOCOL" | "URL_CREDENTIALS_NOT_ALLOWED" | "UNSAFE_HOST" | "DNS_RESOLUTION_FAILED" | "UNSAFE_RESOLVED_ADDRESS" | "FETCH_TIMEOUT" | "FETCH_NETWORK_ERROR" | "TOO_MANY_REDIRECTS" | "REDIRECT_LOCATION_MISSING" | "UNSUPPORTED_CONTENT_TYPE" | "RESPONSE_TOO_LARGE" | "INTERNAL_ERROR";

export type ValidatedWebsiteTarget = { requestedUrl: string; normalizedUrl: string; protocol: "http:" | "https:"; hostname: string; port: string | null; resolvedAddresses: string[] };
export type RedirectHop = { fromUrl: string; toUrl: string; status: number };
export type HtmlFetchResult = { requestedUrl: string; finalUrl: string; status: number; contentType: string | null; redirectCount: number; redirects: RedirectHop[]; html: string; byteLength: number; fetchedAt: string };
export type HeadingFact = { level: 1 | 2 | 3 | 4 | 5 | 6; text: string; id: string | null };
export type LinkFact = { href: string | null; text: string; rel: string[]; target: string | null; ariaLabel: string | null; accessibleName: string };
export type ImageFact = { src: string | null; alt: string | null; hasAltAttribute: boolean; width: string | null; height: string | null };
export type ButtonFact = { text: string; type: string | null; ariaLabel: string | null; accessibleName: string };
export type FormControlFact = { tag: "input" | "select" | "textarea" | "button"; type: string | null; id: string | null; name: string | null; ariaLabel: string | null; ariaLabelledBy: string | null; placeholder: string | null; hasAssociatedLabel: boolean; accessibleName: string };
export type FormFact = { action: string | null; method: string | null; id: string | null; controls: FormControlFact[]; submitControlCount: number };
export type LandmarkFacts = { headerCount: number; navCount: number; mainCount: number; footerCount: number; asideCount: number };
export type ActiveResourceReference = { tag: "script" | "link" | "iframe" | "object" | "embed" | "form"; attribute: "src" | "href" | "data" | "action"; url: string };

export type PageFacts = {
  parser: "CHEERIO_PARSE5";
  document: { hasHtml: boolean; hasHead: boolean; hasBody: boolean };
  title: string | null; titleCount: number; metaDescription: string | null; metaDescriptionCount: number;
  metaRobots: string | null; canonicalUrl: string | null; canonicalCount: number; htmlLang: string | null;
  viewportContent: string | null; headings: HeadingFact[]; h1Texts: string[]; h2Texts: string[]; h3Texts: string[];
  links: LinkFact[]; images: ImageFact[]; buttons: ButtonFact[]; forms: FormFact[]; landmarks: LandmarkFacts;
  activeResourceReferences: ActiveResourceReference[]; jsonLdBlocks: string[]; jsonLdBlockCount: number;
  scriptCount: number; iframeCount: number; bodyTextCharacterCount: number; bodyTextWordCount: number; bodyTextSample: string;
};

export type HttpProbeEvidence = { attemptedUrl: string; available: boolean; statusCode: number | null; finalUrl: string | null; redirects: RedirectHop[]; error: string | null };
export type TlsCertificateEvidence = { connected: boolean; authorized: boolean; authorizationError: string | null; protocol: string | null; cipher: string | null; validFrom: string | null; validTo: string | null; daysRemaining: number | null; subject: Record<string, string>; issuer: Record<string, string>; error: string | null };
export type TransportSecurityEvidence = { https: HttpProbeEvidence; http: HttpProbeEvidence; tls: TlsCertificateEvidence };
export type RedirectConsistencyEvidence = { requestedUrl: string; normalizedUrl: string; finalUrl: string; redirectCount: number; redirects: RedirectHop[]; requestedHostname: string; finalHostname: string; requestedHostnameBase: string; finalHostnameBase: string; hostnameVariantChanged: boolean; destinationSameSite: boolean; repeatedUrlDetected: boolean; normalizedInputChanged: boolean };

export type RobotsEvidence = { url: string; reachable: boolean; statusCode: number | null; contentType: string | null; bodySample: string; userAgentStarPresent: boolean; globallyBlocked: boolean | null; sitemapUrls: string[]; error: string | null };
export type SitemapUrlProbe = { url: string; reachable: boolean; statusCode: number | null; finalUrl: string | null; error: string | null };
export type SitemapEvidence = { candidates: string[]; selectedUrl: string | null; present: boolean; statusCode: number | null; validXml: boolean; sitemapType: "urlset" | "sitemapindex" | "unknown" | null; discoveredUrls: string[]; checkedUrls: SitemapUrlProbe[]; error: string | null };
export type CrawledPageEvidence = { url: string; finalUrl: string | null; depth: number; reachable: boolean; statusCode: number | null; html: boolean; discoveredInternalLinks: number; links?: LinkFact[]; pageFacts?: PageFacts | null; error: string | null };
export type InternalCrawlEvidence = { maxPages: number; maxDepth: number; attemptedPages: number; reachablePages: number; htmlPages: number; pages: CrawledPageEvidence[]; truncated: boolean };
export type CrawlabilityEvidence = { robots: RobotsEvidence; sitemap: SitemapEvidence; internalCrawl: InternalCrawlEvidence };

export type LinkProbeEvidence = { url: string; kind: "internal" | "external"; reachable: boolean | null; statusCode: number | null; finalUrl: string | null; error: string | null };
export type InvalidLinkEvidence = { pageUrl: string; href: string | null; reason: "missing" | "empty" | "malformed" };
export type UnsupportedProtocolEvidence = { pageUrl: string; href: string; protocol: string };
export type LinkIntegrityEvidence = { sourcePageCount: number; totalLinks: number; internalLinks: string[]; externalLinks: string[]; internalProbes: LinkProbeEvidence[]; externalProbes: LinkProbeEvidence[]; invalidLinks: InvalidLinkEvidence[]; unsupportedProtocols: UnsupportedProtocolEvidence[]; externalProbeLimit: number; externalProbeTruncated: boolean };

export type TouchTargetEvidence = { selector: string; explicitWidthPx: number | null; explicitHeightPx: number | null; tooSmall: boolean | null };
export type MobileUsabilityEvidence = {
  method: "STATIC_HTML_CSS";
  mobileViewportWidthPx: number;
  viewport: { present: boolean; content: string | null; hasDeviceWidth: boolean; hasInitialScale: boolean; userScalableDisabled: boolean; maximumScaleRestricted: boolean };
  responsiveSignals: { mediaQueryCount: number; responsiveStylesheetHints: string[]; responsiveImageCount: number; fixedWidthOverflowCandidates: number };
  navigation: { navElementCount: number; navLinkCount: number; toggleCandidateCount: number; hasSemanticNavigation: boolean };
  essentialContent: { mainCount: number; h1Count: number; ctaCount: number; staticallyHiddenEssentialCount: number };
  touchTargets: { totalCandidates: number; explicitlyMeasured: number; explicitTooSmallCount: number; samples: TouchTargetEvidence[] };
  limitations: string[];
};

export type TechnicalResourceProbe = { url: string; reachable: boolean | null; statusCode: number | null; finalUrl: string | null; error: string | null };
export type TechnicalHygieneEvidence = {
  notFoundProbe: { requestedUrl: string; statusCode: number | null; finalUrl: string | null; bodySample: string; appearsNotFound: boolean | null; error: string | null };
  homepageServerError: boolean;
  crawledServerErrorUrls: string[];
  crawledClientErrorUrls: string[];
  favicon: { declaredUrls: string[]; conventionalUrl: string; probes: TechnicalResourceProbe[] };
  document: { doctypePresent: boolean; declaredCharset: string | null; charsetSource: "HTTP_HEADER" | "META_CHARSET" | "META_HTTP_EQUIV" | null };
  javascriptRuntime: { inspected: false; errorCount: null; limitation: string };
  firstPartyResources: { totalReferences: number; probedCount: number; failedCount: number; unknownCount: number; probes: TechnicalResourceProbe[]; probeLimit: number; truncated: boolean };
};

export type SeoPageEvidence = { url: string; finalUrl: string; isHomepage: boolean; depth: number; statusCode: number; facts: PageFacts };
export type SeoEvidence = { pages: SeoPageEvidence[]; pageCount: number; crawlTruncated: boolean };

export type PerformanceAuditEvidence = {
  id: string;
  score: number | null;
  numericValue: number | null;
  numericUnit: string | null;
  displayValue: string | null;
  title: string | null;
  description: string | null;
  details: Record<string, unknown> | null;
};
export type PerformanceEvidence = {
  source: "PAGESPEED_INSIGHTS_LIGHTHOUSE";
  strategy: "mobile";
  available: boolean;
  analyzedUrl: string;
  finalUrl: string | null;
  analysisTimestamp: string | null;
  lighthouseVersion: string | null;
  performanceScore: number | null;
  audits: Record<string, PerformanceAuditEvidence>;
  error: string | null;
};

export type TechnicalHealthRuleId =
  | "TECH-001" | "TECH-002" | "TECH-003" | "TECH-004" | "TECH-005" | "TECH-006" | "TECH-007"
  | "TECH-008" | "TECH-009" | "TECH-010" | "TECH-011" | "TECH-012" | "TECH-013" | "TECH-014"
  | "TECH-015" | "TECH-016" | "TECH-017" | "TECH-018" | "TECH-019" | "TECH-020" | "TECH-021"
  | "TECH-022" | "TECH-023" | "TECH-024" | "TECH-025" | "TECH-026" | "TECH-027" | "TECH-028" | "TECH-029"
  | "TECH-030" | "TECH-031" | "TECH-032" | "TECH-033" | "TECH-034" | "TECH-035" | "TECH-036" | "TECH-037" | "TECH-038" | `TECH-${string}`;
export type SeoRuleId =
  | "SEO-001" | "SEO-002" | "SEO-003" | "SEO-004" | "SEO-005" | "SEO-006" | "SEO-007" | "SEO-008"
  | "SEO-009" | "SEO-010" | "SEO-011" | "SEO-012" | "SEO-013" | "SEO-014" | "SEO-015" | "SEO-016"
  | "SEO-017" | "SEO-018" | "SEO-019" | "SEO-020" | "SEO-021" | "SEO-022" | "SEO-023" | "SEO-024"
  | `SEO-${string}`;
export type PerformanceRuleId =
  | "PERF-001" | "PERF-002" | "PERF-003" | "PERF-004" | "PERF-005" | "PERF-006" | "PERF-007" | "PERF-008"
  | "PERF-009" | "PERF-010" | "PERF-011" | "PERF-012" | "PERF-013" | "PERF-014" | "PERF-015" | "PERF-016"
  | `PERF-${string}`;

export type AnalyzerFinding = { ruleId: TechnicalHealthRuleId | SeoRuleId | PerformanceRuleId | string; category: AnalyzerCategory; status: RuleStatus; confidence: ConfidenceLevel; applicable: boolean; summary: string; result: Record<string, unknown>; evidence: Record<string, unknown>; detectorVersion: string };
export type AnalyzerAuditEnvelope = { analyzerVersion: typeof WEBSITE_ANALYZER_VERSION; status: AuditStatus; requestedUrl: string; normalizedUrl: string; createdAt: string };
export type AnalyzeWebsiteRequest = { url: string };
export type AnalyzerFoundationResponse = { ok: true; analyzerVersion: typeof WEBSITE_ANALYZER_VERSION; status: AuditStatus; target: ValidatedWebsiteTarget; implementationStage: "ANALYZER_FOUNDATION"; nextStage: "FETCH_AND_PARSE" };
export type AnalyzerFetchParseResponse = {
  ok: true; analyzerVersion: typeof WEBSITE_ANALYZER_VERSION; status: "RUNNING"; target: ValidatedWebsiteTarget;
  fetch: Omit<HtmlFetchResult, "html">; pageFacts: PageFacts | null; transportSecurity: TransportSecurityEvidence;
  redirectConsistency: RedirectConsistencyEvidence; crawlability: CrawlabilityEvidence; linkIntegrity: LinkIntegrityEvidence; mobileUsability: MobileUsabilityEvidence | null; technicalHygiene: TechnicalHygieneEvidence;
  seoEvidence: SeoEvidence; performanceEvidence: PerformanceEvidence; technicalHealthFindings: AnalyzerFinding[]; seoFindings: AnalyzerFinding[]; performanceFindings: AnalyzerFinding[];
  implementationStage: "PERFORMANCE_COMPLETE"; nextStage: "CONVERSION_UX";
};
export type AnalyzerErrorResponse = { ok: false; error: { code: AnalyzerFailureCode; message: string } };
