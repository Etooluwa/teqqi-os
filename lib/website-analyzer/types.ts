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

export type HeadingFact = {
  level: 1 | 2 | 3 | 4 | 5 | 6;
  text: string;
  id: string | null;
};

export type LinkFact = {
  href: string | null;
  text: string;
  rel: string[];
  target: string | null;
  ariaLabel: string | null;
  accessibleName: string;
};

export type ImageFact = {
  src: string | null;
  alt: string | null;
  hasAltAttribute: boolean;
  width: string | null;
  height: string | null;
};

export type ButtonFact = {
  text: string;
  type: string | null;
  ariaLabel: string | null;
  accessibleName: string;
};

export type FormControlFact = {
  tag: "input" | "select" | "textarea" | "button";
  type: string | null;
  id: string | null;
  name: string | null;
  ariaLabel: string | null;
  ariaLabelledBy: string | null;
  placeholder: string | null;
  hasAssociatedLabel: boolean;
  accessibleName: string;
};

export type FormFact = {
  action: string | null;
  method: string | null;
  id: string | null;
  controls: FormControlFact[];
  submitControlCount: number;
};

export type LandmarkFacts = {
  headerCount: number;
  navCount: number;
  mainCount: number;
  footerCount: number;
  asideCount: number;
};

export type ActiveResourceReference = {
  tag: "script" | "link" | "iframe" | "object" | "embed" | "form";
  attribute: "src" | "href" | "data" | "action";
  url: string;
};

export type PageFacts = {
  parser: "CHEERIO_PARSE5";
  document: {
    hasHtml: boolean;
    hasHead: boolean;
    hasBody: boolean;
  };
  title: string | null;
  titleCount: number;
  metaDescription: string | null;
  metaDescriptionCount: number;
  metaRobots: string | null;
  canonicalUrl: string | null;
  canonicalCount: number;
  htmlLang: string | null;
  viewportContent: string | null;
  headings: HeadingFact[];
  h1Texts: string[];
  h2Texts: string[];
  h3Texts: string[];
  links: LinkFact[];
  images: ImageFact[];
  buttons: ButtonFact[];
  forms: FormFact[];
  landmarks: LandmarkFacts;
  activeResourceReferences: ActiveResourceReference[];
  jsonLdBlocks: string[];
  jsonLdBlockCount: number;
  scriptCount: number;
  iframeCount: number;
  bodyTextCharacterCount: number;
  bodyTextWordCount: number;
  bodyTextSample: string;
};

export type HttpProbeEvidence = {
  attemptedUrl: string;
  available: boolean;
  statusCode: number | null;
  finalUrl: string | null;
  redirects: RedirectHop[];
  error: string | null;
};

export type TlsCertificateEvidence = {
  connected: boolean;
  authorized: boolean;
  authorizationError: string | null;
  protocol: string | null;
  cipher: string | null;
  validFrom: string | null;
  validTo: string | null;
  daysRemaining: number | null;
  subject: Record<string, string>;
  issuer: Record<string, string>;
  error: string | null;
};

export type TransportSecurityEvidence = {
  https: HttpProbeEvidence;
  http: HttpProbeEvidence;
  tls: TlsCertificateEvidence;
};

export type TechnicalHealthRuleId =
  | "TECH-001"
  | "TECH-002"
  | "TECH-003"
  | "TECH-004"
  | "TECH-005"
  | "TECH-006"
  | "TECH-007"
  | "TECH-008"
  | "TECH-009"
  | "TECH-010"
  | `TECH-${string}`;

export type AnalyzerFinding = {
  ruleId: TechnicalHealthRuleId | string;
  category: AnalyzerCategory;
  status: RuleStatus;
  confidence: ConfidenceLevel;
  applicable: boolean;
  summary: string;
  result: Record<string, unknown>;
  evidence: Record<string, unknown>;
  detectorVersion: string;
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
  pageFacts: PageFacts | null;
  transportSecurity: TransportSecurityEvidence;
  technicalHealthFindings: AnalyzerFinding[];
  implementationStage: "TECHNICAL_HEALTH_BATCH_2";
  nextStage: "TECHNICAL_HEALTH_BATCH_3";
};

export type AnalyzerErrorResponse = {
  ok: false;
  error: {
    code: AnalyzerFailureCode;
    message: string;
  };
};
