import { WEBSITE_ANALYZER_VERSION } from "@/lib/website-analyzer/version";

export type AnalyzerCategory =
  | "TECHNICAL_HEALTH"
  | "SEO"
  | "PERFORMANCE"
  | "CONVERSION_UX"
  | "ACCESSIBILITY"
  | "CONTENT_QUALITY";

export type AuditStatus = "PENDING" | "RUNNING" | "COMPLETED" | "PARTIAL" | "FAILED";

export type RuleStatus = "PASS" | "WARNING" | "FAIL" | "UNKNOWN" | "NOT_APPLICABLE";

export type ConfidenceLevel = "HIGH" | "MEDIUM" | "LOW";

export type AnalyzerFailureCode =
  | "INVALID_REQUEST"
  | "INVALID_URL"
  | "UNSUPPORTED_PROTOCOL"
  | "URL_CREDENTIALS_NOT_ALLOWED"
  | "UNSAFE_HOST"
  | "DNS_RESOLUTION_FAILED"
  | "UNSAFE_RESOLVED_ADDRESS"
  | "FETCH_TIMEOUT"
  | "FETCH_NETWORK_ERROR"
  | "TOO_MANY_REDIRECTS"
  | "REDIRECT_LOCATION_MISSING"
  | "UNSUPPORTED_CONTENT_TYPE"
  | "RESPONSE_TOO_LARGE"
  | "INTERNAL_ERROR";

export type ValidatedWebsiteTarget = {
  requestedUrl: string;
  normalizedUrl: string;
  protocol: "http:" | "https:";
  hostname: string;
  port: string | null;
  resolvedAddresses: string[];
};

export type RedirectHop = {
  fromUrl: string;
  toUrl: string;
  status: number;
};

export type HtmlFetchResult = {
  requestedUrl: string;
  finalUrl: string;
  status: number;
  contentType: string | null;
  redirectCount: number;
  redirects: RedirectHop[];
  html: string;
  byteLength: number;
  fetchedAt: string;
};

export type PageFacts = {
  title: string | null;
  metaDescription: string | null;
  canonicalUrl: string | null;
  htmlLang: string | null;
  viewportContent: string | null;
  h1Texts: string[];
  h2Texts: string[];
  h3Texts: string[];
  links: Array<{ href: string | null; text: string }>;
  images: Array<{ src: string | null; alt: string | null }>;
  buttons: Array<{ text: string }>;
  forms: Array<{ action: string | null; method: string | null; inputTypes: string[] }>;
  jsonLdBlocks: string[];
};

export type AnalyzerAuditEnvelope = {
  analyzerVersion: typeof WEBSITE_ANALYZER_VERSION;
  status: AuditStatus;
  requestedUrl: string;
  normalizedUrl: string;
  createdAt: string;
};

export type AnalyzeWebsiteRequest = {
  url: string;
};

export type AnalyzerFoundationResponse = {
  ok: true;
  analyzerVersion: typeof WEBSITE_ANALYZER_VERSION;
  status: AuditStatus;
  target: ValidatedWebsiteTarget;
  implementationStage: "ANALYZER_FOUNDATION";
  nextStage: "FETCH_AND_PARSE";
};

export type AnalyzerFetchParseResponse = {
  ok: true;
  analyzerVersion: typeof WEBSITE_ANALYZER_VERSION;
  status: "RUNNING";
  target: ValidatedWebsiteTarget;
  fetch: Omit<HtmlFetchResult, "html">;
  pageFacts: PageFacts;
  implementationStage: "FETCH_AND_PARSE";
  nextStage: "TECHNICAL_HEALTH_RULES";
};

export type AnalyzerErrorResponse = {
  ok: false;
  error: {
    code: AnalyzerFailureCode;
    message: string;
  };
};