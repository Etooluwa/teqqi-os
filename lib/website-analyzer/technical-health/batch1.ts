import "server-only";

import type {
  AnalyzerFinding,
  HtmlFetchResult,
  PageFacts,
  ValidatedWebsiteTarget,
} from "@/lib/website-analyzer/types";

const DETECTOR_VERSION = "1.0.0";

const MEANINGFUL_CONTENT_THRESHOLDS = {
  strongWordCount: 75,
  structuredWordCount: 35,
  minimumWordCount: 15,
} as const;

const CTA_TERMS = [
  "contact",
  "call",
  "book",
  "schedule",
  "request quote",
  "get quote",
  "buy",
  "shop",
  "order",
  "register",
  "sign up",
  "get started",
];

const STRONG_PARKING_PHRASES = [
  "this domain is for sale",
  "domain is for sale",
  "buy this domain",
  "domain expired",
  "domain has expired",
  "website suspended",
  "account suspended",
];

const PARKING_PROVIDER_FINGERPRINTS = ["parkingcrew", "sedo", "afternic", "bodis"];
const PLACEHOLDER_PHRASES = ["coming soon", "under construction", "website coming soon", "site coming soon"];

function finding(input: Omit<AnalyzerFinding, "category" | "detectorVersion">): AnalyzerFinding {
  return {
    ...input,
    category: "TECHNICAL_HEALTH",
    detectorVersion: DETECTOR_VERSION,
  };
}

function contentTypeIsHtml(contentType: string | null): boolean {
  if (!contentType) return false;
  const normalized = contentType.toLowerCase();
  return normalized.includes("text/html") || normalized.includes("application/xhtml+xml");
}

function hasStrongHtmlMarkers(body: string): boolean {
  const prefix = body.slice(0, 16_384).toLowerCase();
  return (
    /<!doctype\s+html/.test(prefix) ||
    /<html(?:\s|>)/.test(prefix) ||
    (/<head(?:\s|>)/.test(prefix) && /<body(?:\s|>)/.test(prefix))
  );
}

function evaluateTech001(target: ValidatedWebsiteTarget): AnalyzerFinding {
  const resolved = target.resolvedAddresses.length > 0;
  return finding({
    ruleId: "TECH-001",
    status: resolved ? "PASS" : "FAIL",
    confidence: "HIGH",
    applicable: true,
    summary: resolved ? "The domain resolves to a public IP address." : "The domain does not resolve.",
    result: {
      hostname: target.hostname,
      resolved,
      addresses: target.resolvedAddresses,
    },
    evidence: {
      hostname: target.hostname,
      resolvedAddresses: target.resolvedAddresses,
    },
  });
}

function evaluateTech002(fetchResult: HtmlFetchResult): AnalyzerFinding {
  const statusCode = fetchResult.status;
  let status: AnalyzerFinding["status"] = "PASS";
  let summary = "The homepage returned a valid non-error HTTP response.";

  if ([401, 403, 429].includes(statusCode)) {
    status = "WARNING";
    summary = "The homepage responded with an access-control or rate-limit response.";
  } else if (statusCode >= 400) {
    status = "FAIL";
    summary = `The homepage returned HTTP ${statusCode}.`;
  }

  return finding({
    ruleId: "TECH-002",
    status,
    confidence: "HIGH",
    applicable: true,
    summary,
    result: {
      finalUrl: fetchResult.finalUrl,
      statusCode,
      redirectCount: fetchResult.redirectCount,
    },
    evidence: {
      requestedUrl: fetchResult.requestedUrl,
      finalUrl: fetchResult.finalUrl,
      statusCode,
      redirects: fetchResult.redirects,
      responseBytes: fetchResult.byteLength,
      contentType: fetchResult.contentType,
    },
  });
}

function evaluateTech003(fetchResult: HtmlFetchResult): AnalyzerFinding {
  const declaredHtml = contentTypeIsHtml(fetchResult.contentType);
  const htmlMarkers = hasStrongHtmlMarkers(fetchResult.html);
  const hasBody = fetchResult.byteLength > 0 && fetchResult.html.trim().length > 0;

  if (!hasBody) {
    return finding({
      ruleId: "TECH-003",
      status: "FAIL",
      confidence: "HIGH",
      applicable: true,
      summary: "The homepage response body is empty.",
      result: { declaredMimeType: fetchResult.contentType, detectedType: "empty" },
      evidence: { contentType: fetchResult.contentType, inspectedBytes: fetchResult.byteLength },
    });
  }

  if (declaredHtml && htmlMarkers) {
    return finding({
      ruleId: "TECH-003",
      status: "PASS",
      confidence: "HIGH",
      applicable: true,
      summary: "The homepage returned an HTML document.",
      result: { declaredMimeType: fetchResult.contentType, detectedType: "html" },
      evidence: { contentType: fetchResult.contentType, htmlMarkers: true },
    });
  }

  if (htmlMarkers) {
    return finding({
      ruleId: "TECH-003",
      status: "WARNING",
      confidence: "MEDIUM",
      applicable: true,
      summary: "The response appears to be HTML but the declared content type is missing or inconsistent.",
      result: { declaredMimeType: fetchResult.contentType, detectedType: "html" },
      evidence: { contentType: fetchResult.contentType, htmlMarkers: true },
    });
  }

  if (declaredHtml) {
    return finding({
      ruleId: "TECH-003",
      status: "WARNING",
      confidence: "MEDIUM",
      applicable: true,
      summary: "The response declares HTML but strong HTML document markers were not found.",
      result: { declaredMimeType: fetchResult.contentType, detectedType: "uncertain" },
      evidence: { contentType: fetchResult.contentType, htmlMarkers: false },
    });
  }

  return finding({
    ruleId: "TECH-003",
    status: "FAIL",
    confidence: "HIGH",
    applicable: true,
    summary: `The homepage did not return HTML${fetchResult.contentType ? ` (${fetchResult.contentType})` : ""}.`,
    result: { declaredMimeType: fetchResult.contentType, detectedType: "non_html" },
    evidence: { contentType: fetchResult.contentType, htmlMarkers: false },
  });
}

function evaluateTech004(pageFacts: PageFacts | null): AnalyzerFinding {
  if (!pageFacts) {
    return finding({
      ruleId: "TECH-004",
      status: "NOT_APPLICABLE",
      confidence: "HIGH",
      applicable: false,
      summary: "Parking detection is not applicable because the homepage was not confirmed as HTML.",
      result: {},
      evidence: {},
    });
  }

  const searchable = `${pageFacts.title ?? ""} ${pageFacts.bodyTextSample}`.toLowerCase();
  const matchedPhrases = STRONG_PARKING_PHRASES.filter((phrase) => searchable.includes(phrase));
  const providerFingerprints = PARKING_PROVIDER_FINGERPRINTS.filter((provider) => searchable.includes(provider));
  const strongSignalCount = matchedPhrases.length + providerFingerprints.length;

  if (strongSignalCount >= 2 || (matchedPhrases.length >= 1 && providerFingerprints.length >= 1)) {
    return finding({
      ruleId: "TECH-004",
      status: "FAIL",
      confidence: "HIGH",
      applicable: true,
      summary: "Multiple strong signals indicate that the domain is parked, expired, suspended or for sale.",
      result: { classification: "parked_or_placeholder", matchedSignalCount: strongSignalCount },
      evidence: { matchedPhrases, providerFingerprints, title: pageFacts.title },
    });
  }

  if (strongSignalCount === 1) {
    return finding({
      ruleId: "TECH-004",
      status: "WARNING",
      confidence: "MEDIUM",
      applicable: true,
      summary: "A possible parking or placeholder signal was detected, but the classification is not conclusive.",
      result: { classification: "uncertain", matchedSignalCount: strongSignalCount },
      evidence: { matchedPhrases, providerFingerprints, title: pageFacts.title },
    });
  }

  return finding({
    ruleId: "TECH-004",
    status: "PASS",
    confidence: pageFacts.bodyTextWordCount >= 35 ? "HIGH" : "MEDIUM",
    applicable: true,
    summary: "No strong parking, expiry, suspension or for-sale signals were detected.",
    result: { classification: "active_or_unclassified", matchedSignalCount: 0 },
    evidence: { title: pageFacts.title, visibleWordCount: pageFacts.bodyTextWordCount },
  });
}

function countCtas(pageFacts: PageFacts): number {
  const values = [
    ...pageFacts.links.map((link) => link.accessibleName || link.text),
    ...pageFacts.buttons.map((button) => button.accessibleName || button.text),
  ].map((value) => value.toLowerCase());

  return values.filter((value) => CTA_TERMS.some((term) => value.includes(term))).length;
}

function evaluateTech005(pageFacts: PageFacts | null): AnalyzerFinding {
  if (!pageFacts) {
    return finding({
      ruleId: "TECH-005",
      status: "NOT_APPLICABLE",
      confidence: "HIGH",
      applicable: false,
      summary: "Meaningful-content evaluation is not applicable because the homepage was not confirmed as HTML.",
      result: {},
      evidence: {},
    });
  }

  const text = pageFacts.bodyTextSample.toLowerCase();
  const placeholderMatches = PLACEHOLDER_PHRASES.filter((phrase) => text.includes(phrase));
  const headingCount = pageFacts.headings.length;
  const ctaCount = countCtas(pageFacts);
  const mediaCount = pageFacts.images.length + pageFacts.iframeCount;
  const navigationCount = pageFacts.landmarks.navCount;
  const words = pageFacts.bodyTextWordCount;
  const structuredSignals = headingCount + ctaCount + mediaCount + navigationCount;

  let status: AnalyzerFinding["status"];
  let confidence: AnalyzerFinding["confidence"];
  let summary: string;

  if (placeholderMatches.length > 0 && words < MEANINGFUL_CONTENT_THRESHOLDS.structuredWordCount) {
    status = "FAIL";
    confidence = "HIGH";
    summary = "The homepage appears to be an under-construction or placeholder page with little meaningful content.";
  } else if (words >= MEANINGFUL_CONTENT_THRESHOLDS.strongWordCount) {
    status = "PASS";
    confidence = "HIGH";
    summary = "The homepage contains substantial visible content.";
  } else if (
    words >= MEANINGFUL_CONTENT_THRESHOLDS.structuredWordCount &&
    structuredSignals >= 2
  ) {
    status = "PASS";
    confidence = "MEDIUM";
    summary = "The homepage contains sufficient visible and structured content to function as an active website.";
  } else if (words >= MEANINGFUL_CONTENT_THRESHOLDS.minimumWordCount || structuredSignals >= 2) {
    status = "WARNING";
    confidence = "MEDIUM";
    summary = "The homepage contains limited or structure-dependent content and may require rendered-page evidence for a stronger conclusion.";
  } else {
    status = "FAIL";
    confidence = "HIGH";
    summary = "The homepage contains too little visible or structured content to represent a meaningful active website.";
  }

  return finding({
    ruleId: "TECH-005",
    status,
    confidence,
    applicable: true,
    summary,
    result: {
      meaningfulContent: status === "PASS",
      visibleWordCount: words,
      headingCount,
      ctaCount,
      mediaCount,
      navigationCount,
    },
    evidence: {
      thresholds: MEANINGFUL_CONTENT_THRESHOLDS,
      placeholderMatches,
      parser: pageFacts.parser,
    },
  });
}

export function runTechnicalHealthBatch1(input: {
  target: ValidatedWebsiteTarget;
  fetchResult: HtmlFetchResult;
  pageFacts: PageFacts | null;
}): AnalyzerFinding[] {
  return [
    evaluateTech001(input.target),
    evaluateTech002(input.fetchResult),
    evaluateTech003(input.fetchResult),
    evaluateTech004(input.pageFacts),
    evaluateTech005(input.pageFacts),
  ];
}
