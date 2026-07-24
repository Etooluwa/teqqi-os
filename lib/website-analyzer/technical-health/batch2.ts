import "server-only";

import type {
  AnalyzerFinding,
  PageFacts,
  TransportSecurityEvidence,
} from "@/lib/website-analyzer/types";

const DETECTOR_VERSION = "1.0.0";
const CERTIFICATE_WARNING_DAYS = 30;

function finding(input: Omit<AnalyzerFinding, "category" | "detectorVersion">): AnalyzerFinding {
  return {
    ...input,
    category: "TECHNICAL_HEALTH",
    detectorVersion: DETECTOR_VERSION,
  };
}

function evaluateTech006(transport: TransportSecurityEvidence): AnalyzerFinding {
  const httpsAvailable = transport.https.available || transport.tls.connected;

  if (!httpsAvailable) {
    return finding({
      ruleId: "TECH-006",
      status: "FAIL",
      confidence: "HIGH",
      applicable: true,
      summary: "HTTPS could not be reached for the website hostname.",
      result: { httpsAvailable: false },
      evidence: {
        httpsProbe: transport.https,
        tlsConnected: transport.tls.connected,
        tlsError: transport.tls.error,
      },
    });
  }

  if (!transport.https.available && transport.tls.connected) {
    return finding({
      ruleId: "TECH-006",
      status: "WARNING",
      confidence: "MEDIUM",
      applicable: true,
      summary: "A TLS service is available, but a normal HTTPS page request could not be completed.",
      result: { httpsAvailable: true, httpResponseAvailable: false },
      evidence: {
        httpsProbe: transport.https,
        tlsConnected: transport.tls.connected,
      },
    });
  }

  return finding({
    ruleId: "TECH-006",
    status: "PASS",
    confidence: "HIGH",
    applicable: true,
    summary: "The website is available over HTTPS.",
    result: {
      httpsAvailable: true,
      statusCode: transport.https.statusCode,
      finalUrl: transport.https.finalUrl,
    },
    evidence: { httpsProbe: transport.https },
  });
}

function evaluateTech007(transport: TransportSecurityEvidence): AnalyzerFinding {
  if (!transport.http.available) {
    return finding({
      ruleId: "TECH-007",
      status: "UNKNOWN",
      confidence: "LOW",
      applicable: true,
      summary: "The analyzer could not reliably determine how the HTTP endpoint behaves.",
      result: { redirectsToHttps: null },
      evidence: { httpProbe: transport.http },
    });
  }

  const finalUrl = transport.http.finalUrl;
  const redirectsToHttps = Boolean(finalUrl && new URL(finalUrl).protocol === "https:");

  if (redirectsToHttps) {
    return finding({
      ruleId: "TECH-007",
      status: "PASS",
      confidence: "HIGH",
      applicable: true,
      summary: "HTTP requests are redirected to HTTPS.",
      result: {
        redirectsToHttps: true,
        finalUrl,
        redirectCount: transport.http.redirects.length,
      },
      evidence: { httpProbe: transport.http },
    });
  }

  return finding({
    ruleId: "TECH-007",
    status: "FAIL",
    confidence: "HIGH",
    applicable: true,
    summary: "The HTTP endpoint does not redirect visitors to HTTPS.",
    result: {
      redirectsToHttps: false,
      finalUrl,
      statusCode: transport.http.statusCode,
    },
    evidence: { httpProbe: transport.http },
  });
}

function evaluateTech008(transport: TransportSecurityEvidence): AnalyzerFinding {
  if (!transport.tls.connected) {
    return finding({
      ruleId: "TECH-008",
      status: "UNKNOWN",
      confidence: "MEDIUM",
      applicable: true,
      summary: "A TLS certificate could not be inspected because a TLS connection could not be established.",
      result: { tlsCertificateValid: null },
      evidence: { tls: transport.tls },
    });
  }

  if (!transport.tls.authorized) {
    return finding({
      ruleId: "TECH-008",
      status: "FAIL",
      confidence: "HIGH",
      applicable: true,
      summary: "The TLS certificate is not trusted or valid for the requested hostname.",
      result: {
        tlsCertificateValid: false,
        authorizationError: transport.tls.authorizationError,
      },
      evidence: { tls: transport.tls },
    });
  }

  return finding({
    ruleId: "TECH-008",
    status: "PASS",
    confidence: "HIGH",
    applicable: true,
    summary: "The TLS certificate is valid and trusted for the website hostname.",
    result: {
      tlsCertificateValid: true,
      protocol: transport.tls.protocol,
      cipher: transport.tls.cipher,
    },
    evidence: { tls: transport.tls },
  });
}

function evaluateTech009(transport: TransportSecurityEvidence): AnalyzerFinding {
  if (!transport.tls.connected || !transport.tls.authorized) {
    return finding({
      ruleId: "TECH-009",
      status: "NOT_APPLICABLE",
      confidence: "HIGH",
      applicable: false,
      summary: "Certificate-expiry evaluation is not applicable because a valid TLS certificate was not established.",
      result: {},
      evidence: { tls: transport.tls },
    });
  }

  const daysRemaining = transport.tls.daysRemaining;
  if (daysRemaining === null) {
    return finding({
      ruleId: "TECH-009",
      status: "UNKNOWN",
      confidence: "LOW",
      applicable: true,
      summary: "The TLS certificate expiry date could not be determined reliably.",
      result: { daysRemaining: null },
      evidence: { tls: transport.tls },
    });
  }

  if (daysRemaining < 0) {
    return finding({
      ruleId: "TECH-009",
      status: "FAIL",
      confidence: "HIGH",
      applicable: true,
      summary: "The TLS certificate is expired.",
      result: { daysRemaining, expiryRisk: "expired" },
      evidence: { validTo: transport.tls.validTo },
    });
  }

  if (daysRemaining <= CERTIFICATE_WARNING_DAYS) {
    return finding({
      ruleId: "TECH-009",
      status: "WARNING",
      confidence: "HIGH",
      applicable: true,
      summary: `The TLS certificate expires within ${CERTIFICATE_WARNING_DAYS} days.`,
      result: { daysRemaining, expiryRisk: "near_expiry" },
      evidence: {
        validTo: transport.tls.validTo,
        warningThresholdDays: CERTIFICATE_WARNING_DAYS,
      },
    });
  }

  return finding({
    ruleId: "TECH-009",
    status: "PASS",
    confidence: "HIGH",
    applicable: true,
    summary: "The TLS certificate is not near expiry.",
    result: { daysRemaining, expiryRisk: "none" },
    evidence: {
      validTo: transport.tls.validTo,
      warningThresholdDays: CERTIFICATE_WARNING_DAYS,
    },
  });
}

function evaluateTech010(input: {
  pageFacts: PageFacts | null;
  finalUrl: string;
}): AnalyzerFinding {
  if (new URL(input.finalUrl).protocol !== "https:") {
    return finding({
      ruleId: "TECH-010",
      status: "NOT_APPLICABLE",
      confidence: "HIGH",
      applicable: false,
      summary: "Mixed active content is not applicable because the analyzed page is not served over HTTPS.",
      result: {},
      evidence: { finalUrl: input.finalUrl },
    });
  }

  if (!input.pageFacts) {
    return finding({
      ruleId: "TECH-010",
      status: "NOT_APPLICABLE",
      confidence: "HIGH",
      applicable: false,
      summary: "Mixed active content is not applicable because the homepage was not confirmed as HTML.",
      result: {},
      evidence: { finalUrl: input.finalUrl },
    });
  }

  const insecureResources = input.pageFacts.activeResourceReferences.filter((resource) =>
    resource.url.trim().toLowerCase().startsWith("http://"),
  );

  if (insecureResources.length > 0) {
    return finding({
      ruleId: "TECH-010",
      status: "FAIL",
      confidence: "HIGH",
      applicable: true,
      summary: "The HTTPS page references active resources over insecure HTTP.",
      result: {
        mixedActiveContent: true,
        insecureActiveResourceCount: insecureResources.length,
      },
      evidence: { insecureResources },
    });
  }

  return finding({
    ruleId: "TECH-010",
    status: "PASS",
    confidence: "HIGH",
    applicable: true,
    summary: "No statically detectable mixed active content was found on the homepage.",
    result: {
      mixedActiveContent: false,
      checkedActiveResourceCount: input.pageFacts.activeResourceReferences.length,
    },
    evidence: {
      activeResourceReferences: input.pageFacts.activeResourceReferences,
      inspectionMethod: "static_html",
    },
  });
}

export function runTechnicalHealthBatch2(input: {
  transport: TransportSecurityEvidence;
  pageFacts: PageFacts | null;
  finalUrl: string;
}): AnalyzerFinding[] {
  return [
    evaluateTech006(input.transport),
    evaluateTech007(input.transport),
    evaluateTech008(input.transport),
    evaluateTech009(input.transport),
    evaluateTech010({ pageFacts: input.pageFacts, finalUrl: input.finalUrl }),
  ];
}
