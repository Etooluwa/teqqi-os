import "server-only";

import type { AnalyzerFinding, PageFacts, TechnicalHygieneEvidence } from "@/lib/website-analyzer/types";

const DETECTOR_VERSION = "1.0.0";

function finding(input: Omit<AnalyzerFinding, "category" | "detectorVersion">): AnalyzerFinding {
  return { ...input, category: "TECHNICAL_HEALTH", detectorVersion: DETECTOR_VERSION };
}

function tech030(evidence: TechnicalHygieneEvidence): AnalyzerFinding {
  const probe = evidence.notFoundProbe;
  if (probe.statusCode === null) return finding({ ruleId: "TECH-030", status: "UNKNOWN", confidence: "LOW", applicable: true, summary: "The custom 404 experience could not be inspected reliably.", result: { custom404Confirmed: null }, evidence: { notFoundProbe: probe } });
  if ([404, 410].includes(probe.statusCode) && probe.appearsNotFound === true) return finding({ ruleId: "TECH-030", status: "PASS", confidence: "HIGH", applicable: true, summary: "A missing URL returns an appropriate not-found response with visible not-found messaging.", result: { custom404Confirmed: true, statusCode: probe.statusCode }, evidence: { notFoundProbe: probe } });
  if ([404, 410].includes(probe.statusCode)) return finding({ ruleId: "TECH-030", status: "WARNING", confidence: "MEDIUM", applicable: true, summary: "The website returns an appropriate 404/410 status, but a user-friendly custom not-found page could not be confirmed from the response text.", result: { custom404Confirmed: null, statusCode: probe.statusCode }, evidence: { notFoundProbe: probe } });
  return finding({ ruleId: "TECH-030", status: "WARNING", confidence: "MEDIUM", applicable: true, summary: "The missing-page response does not use a normal 404/410 status, so a conventional custom 404 experience was not confirmed.", result: { custom404Confirmed: false, statusCode: probe.statusCode }, evidence: { notFoundProbe: probe } });
}

function tech031(evidence: TechnicalHygieneEvidence): AnalyzerFinding {
  const probe = evidence.notFoundProbe;
  if (probe.statusCode === null) return finding({ ruleId: "TECH-031", status: "UNKNOWN", confidence: "LOW", applicable: true, summary: "Soft-404 behavior could not be determined reliably.", result: { soft404Detected: null }, evidence: { notFoundProbe: probe } });
  if ([404, 410].includes(probe.statusCode)) return finding({ ruleId: "TECH-031", status: "PASS", confidence: "HIGH", applicable: true, summary: "The synthetic missing URL returns a proper not-found HTTP status rather than a soft 404.", result: { soft404Detected: false, statusCode: probe.statusCode }, evidence: { notFoundProbe: probe } });
  if (probe.statusCode >= 200 && probe.statusCode < 300 && probe.appearsNotFound === true) return finding({ ruleId: "TECH-031", status: "FAIL", confidence: "HIGH", applicable: true, summary: "A missing URL returns a successful HTTP status while presenting not-found content, indicating a soft 404.", result: { soft404Detected: true, statusCode: probe.statusCode }, evidence: { notFoundProbe: probe } });
  if (probe.statusCode >= 200 && probe.statusCode < 400) return finding({ ruleId: "TECH-031", status: "WARNING", confidence: "MEDIUM", applicable: true, summary: "The synthetic missing URL did not return 404/410; soft-404 behavior is possible but not proven by static content.", result: { soft404Detected: null, statusCode: probe.statusCode }, evidence: { notFoundProbe: probe } });
  return finding({ ruleId: "TECH-031", status: "PASS", confidence: "MEDIUM", applicable: true, summary: "The synthetic missing URL does not return a successful response, and no soft 404 was detected.", result: { soft404Detected: false, statusCode: probe.statusCode }, evidence: { notFoundProbe: probe } });
}

function tech032(evidence: TechnicalHygieneEvidence): AnalyzerFinding {
  const urls = evidence.crawledServerErrorUrls;
  if (evidence.homepageServerError || urls.length > 0) return finding({ ruleId: "TECH-032", status: "FAIL", confidence: "HIGH", applicable: true, summary: "One or more analyzed first-party pages returned a 5xx server error.", result: { serverErrorsDetected: true, errorPageCount: urls.length + (evidence.homepageServerError ? 1 : 0) }, evidence: { homepageServerError: evidence.homepageServerError, crawledServerErrorUrls: urls } });
  return finding({ ruleId: "TECH-032", status: "PASS", confidence: "HIGH", applicable: true, summary: "No 5xx server errors were observed on the homepage or sampled internal pages.", result: { serverErrorsDetected: false, errorPageCount: 0 }, evidence: { homepageServerError: false, crawledServerErrorUrls: [] } });
}

function tech033(evidence: TechnicalHygieneEvidence): AnalyzerFinding {
  const urls = evidence.crawledClientErrorUrls;
  if (urls.length === 0) return finding({ ruleId: "TECH-033", status: "PASS", confidence: "HIGH", applicable: true, summary: "No 4xx client-error responses were observed among sampled internal pages.", result: { clientErrorsDetected: false, errorPageCount: 0 }, evidence: { crawledClientErrorUrls: [] } });
  return finding({ ruleId: "TECH-033", status: "FAIL", confidence: "HIGH", applicable: true, summary: "One or more sampled internal pages returned a 4xx client error.", result: { clientErrorsDetected: true, errorPageCount: urls.length }, evidence: { crawledClientErrorUrls: urls } });
}

function tech034(evidence: TechnicalHygieneEvidence): AnalyzerFinding {
  const probes = evidence.favicon.probes;
  const reachable = probes.filter((probe) => probe.reachable === true);
  if (reachable.length > 0) return finding({ ruleId: "TECH-034", status: "PASS", confidence: "HIGH", applicable: true, summary: "A reachable favicon or icon resource was discovered.", result: { faviconPresent: true, reachableUrl: reachable[0]?.finalUrl ?? reachable[0]?.url ?? null }, evidence: { favicon: evidence.favicon } });
  if (probes.some((probe) => probe.reachable === null)) return finding({ ruleId: "TECH-034", status: "UNKNOWN", confidence: "LOW", applicable: true, summary: "Favicon availability could not be determined reliably because one or more icon probes were inconclusive.", result: { faviconPresent: null }, evidence: { favicon: evidence.favicon } });
  return finding({ ruleId: "TECH-034", status: "FAIL", confidence: "HIGH", applicable: true, summary: "No reachable declared favicon or conventional /favicon.ico resource was found.", result: { faviconPresent: false }, evidence: { favicon: evidence.favicon } });
}

function tech035(evidence: TechnicalHygieneEvidence, pageFacts: PageFacts | null): AnalyzerFinding {
  if (!pageFacts) return finding({ ruleId: "TECH-035", status: "NOT_APPLICABLE", confidence: "HIGH", applicable: false, summary: "HTML doctype inspection is not applicable because the homepage was not confirmed as HTML.", result: {}, evidence: { document: evidence.document } });
  return evidence.document.doctypePresent
    ? finding({ ruleId: "TECH-035", status: "PASS", confidence: "HIGH", applicable: true, summary: "The homepage declares an HTML doctype.", result: { doctypePresent: true }, evidence: { document: evidence.document } })
    : finding({ ruleId: "TECH-035", status: "FAIL", confidence: "HIGH", applicable: true, summary: "The homepage HTML does not declare a doctype.", result: { doctypePresent: false }, evidence: { document: evidence.document } });
}

function tech036(evidence: TechnicalHygieneEvidence, pageFacts: PageFacts | null): AnalyzerFinding {
  if (!pageFacts) return finding({ ruleId: "TECH-036", status: "NOT_APPLICABLE", confidence: "HIGH", applicable: false, summary: "Character-encoding inspection is not applicable because the homepage was not confirmed as HTML.", result: {}, evidence: { document: evidence.document } });
  if (evidence.document.declaredCharset) return finding({ ruleId: "TECH-036", status: "PASS", confidence: "HIGH", applicable: true, summary: "A character encoding is explicitly declared for the homepage.", result: { charsetDeclared: true, charset: evidence.document.declaredCharset, source: evidence.document.charsetSource }, evidence: { document: evidence.document } });
  return finding({ ruleId: "TECH-036", status: "WARNING", confidence: "HIGH", applicable: true, summary: "No explicit character encoding declaration was found in the HTTP Content-Type or HTML metadata.", result: { charsetDeclared: false }, evidence: { document: evidence.document } });
}

function tech037(evidence: TechnicalHygieneEvidence, pageFacts: PageFacts | null): AnalyzerFinding {
  if (!pageFacts) return finding({ ruleId: "TECH-037", status: "NOT_APPLICABLE", confidence: "HIGH", applicable: false, summary: "JavaScript runtime inspection is not applicable because the homepage was not confirmed as HTML.", result: {}, evidence: { javascriptRuntime: evidence.javascriptRuntime } });
  return finding({ ruleId: "TECH-037", status: "UNKNOWN", confidence: "LOW", applicable: true, summary: "JavaScript runtime failures require rendered browser execution; the static analyzer does not infer runtime errors.", result: { runtimeInspected: false, javascriptErrors: null }, evidence: { javascriptRuntime: evidence.javascriptRuntime } });
}

function tech038(evidence: TechnicalHygieneEvidence, pageFacts: PageFacts | null): AnalyzerFinding {
  const resources = evidence.firstPartyResources;
  if (!pageFacts) return finding({ ruleId: "TECH-038", status: "NOT_APPLICABLE", confidence: "HIGH", applicable: false, summary: "First-party resource checking is not applicable because the homepage was not confirmed as HTML.", result: {}, evidence: { firstPartyResources: resources } });
  if (resources.probedCount === 0) return finding({ ruleId: "TECH-038", status: "UNKNOWN", confidence: "LOW", applicable: true, summary: "No first-party resource URLs were available for a reliable availability sample.", result: { probedCount: 0, failedCount: 0 }, evidence: { firstPartyResources: resources } });
  if (resources.failedCount === 0 && resources.unknownCount === 0) return finding({ ruleId: "TECH-038", status: "PASS", confidence: resources.truncated ? "MEDIUM" : "HIGH", applicable: true, summary: resources.truncated ? "All sampled first-party resources were reachable within the configured probe limit." : "All discovered first-party resources in the sample were reachable.", result: { probedCount: resources.probedCount, failedCount: 0, truncated: resources.truncated }, evidence: { firstPartyResources: resources } });
  if (resources.failedCount === 0) return finding({ ruleId: "TECH-038", status: "UNKNOWN", confidence: "LOW", applicable: true, summary: "No sampled first-party resource was confirmed failed, but one or more probes were inconclusive.", result: { probedCount: resources.probedCount, failedCount: 0, unknownCount: resources.unknownCount }, evidence: { firstPartyResources: resources } });
  const failureRate = resources.failedCount / resources.probedCount;
  const status = failureRate >= 0.25 || resources.failedCount >= 3 ? "FAIL" : "WARNING";
  return finding({ ruleId: "TECH-038", status, confidence: "HIGH", applicable: true, summary: status === "FAIL" ? "Multiple first-party page resources failed availability checks." : "At least one sampled first-party page resource failed an availability check.", result: { probedCount: resources.probedCount, failedCount: resources.failedCount, failureRate, truncated: resources.truncated }, evidence: { firstPartyResources: resources } });
}

export function runTechnicalHealthBatch7(input: { evidence: TechnicalHygieneEvidence; pageFacts: PageFacts | null }): AnalyzerFinding[] {
  return [
    tech030(input.evidence), tech031(input.evidence), tech032(input.evidence), tech033(input.evidence),
    tech034(input.evidence), tech035(input.evidence, input.pageFacts), tech036(input.evidence, input.pageFacts),
    tech037(input.evidence, input.pageFacts), tech038(input.evidence, input.pageFacts),
  ];
}
