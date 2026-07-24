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
  | "INTERNAL_ERROR";

export type ValidatedWebsiteTarget = {
  requestedUrl: string;
  normalizedUrl: string;
  protocol: "http:" | "https:";
  hostname: string;
  port: string | null;
  resolvedAddresses: string[];
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

export type AnalyzerErrorResponse = {
  ok: false;
  error: {
    code: AnalyzerFailureCode;
    message: string;
  };
};
