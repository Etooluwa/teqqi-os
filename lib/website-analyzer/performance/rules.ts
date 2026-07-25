import "server-only";

import type { AnalyzerFinding, PerformanceAuditEvidence, PerformanceEvidence } from "@/lib/website-analyzer/types";

const DETECTOR_VERSION = "1.0.0";

const THRESHOLDS = {
  lcpMs: { pass: 2500, fail: 4000 },
  inpMs: { pass: 200, fail: 500 },
  cls: { pass: 0.10, fail: 0.25 },
  fcpMs: { pass: 1800, fail: 3000 },
  ttfbMs: { pass: 800, fail: 1800 },
  totalBytes: { pass: 2_000_000, fail: 4_000_000 },
  javascriptBytes: { pass: 500_000, fail: 1_000_000 },
  cssBytes: { pass: 150_000, fail: 300_000 },
  imageBytes: { pass: 1_500_000, fail: 3_000_000 },
  requestCount: { pass: 80, fail: 150 },
  longTaskCount: { pass: 5, fail: 15 },
} as const;

function finding(input: Omit<AnalyzerFinding, "category" | "detectorVersion">): AnalyzerFinding {
  return { ...input, category: "PERFORMANCE", detectorVersion: DETECTOR_VERSION };
}

function unavailable(ruleId: string, evidence: PerformanceEvidence, reason: string): AnalyzerFinding {
  return finding({
    ruleId,
    status: "UNKNOWN",
    confidence: "LOW",
    applicable: true,
    summary: reason,
    result: { measured: false },
    evidence: { source: evidence.source, strategy: evidence.strategy, providerAvailable: evidence.available, providerError: evidence.error },
  });
}

function audit(evidence: PerformanceEvidence, ...ids: string[]): PerformanceAuditEvidence | null {
  for (const id of ids) if (evidence.audits[id]) return evidence.audits[id];
  return null;
}

function numericRule(input: {
  ruleId: string;
  evidence: PerformanceEvidence;
  auditIds: string[];
  metricName: string;
  resultKey: string;
  pass: number;
  fail: number;
  unit: string;
  lowerIsBetter?: boolean;
}): AnalyzerFinding {
  const selected = audit(input.evidence, ...input.auditIds);
  const value = selected?.numericValue ?? null;
  if (value === null) return unavailable(input.ruleId, input.evidence, `${input.metricName} could not be measured from the available controlled Lighthouse run.`);

  const lowerIsBetter = input.lowerIsBetter ?? true;
  let status: AnalyzerFinding["status"];
  if (lowerIsBetter) status = value <= input.pass ? "PASS" : value <= input.fail ? "WARNING" : "FAIL";
  else status = value >= input.pass ? "PASS" : value >= input.fail ? "WARNING" : "FAIL";

  return finding({
    ruleId: input.ruleId,
    status,
    confidence: "HIGH",
    applicable: true,
    summary: `${input.metricName} measured ${Math.round(value * 100) / 100} ${input.unit} in the controlled mobile Lighthouse run.`,
    result: { [input.resultKey]: value, passThreshold: input.pass, failureThreshold: input.fail, unit: input.unit },
    evidence: { auditId: selected?.id, displayValue: selected?.displayValue, score: selected?.score, source: input.evidence.source, strategy: input.evidence.strategy, analysisTimestamp: input.evidence.analysisTimestamp },
  });
}

function resourceSummary(evidence: PerformanceEvidence): Array<Record<string, unknown>> {
  const selected = audit(evidence, "resource-summary");
  const items = selected?.details?.items;
  return Array.isArray(items) ? items.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object") : [];
}

function resourceBytes(evidence: PerformanceEvidence, names: string[]): number | null {
  const normalized = names.map((name) => name.toLowerCase());
  const matches = resourceSummary(evidence).filter((item) => normalized.includes(String(item.resourceType ?? "").toLowerCase()));
  if (matches.length === 0) return null;
  return matches.reduce((sum, item) => sum + (typeof item.transferSize === "number" ? item.transferSize : 0), 0);
}

function payloadRule(ruleId: string, label: string, bytes: number | null, pass: number, fail: number, evidence: PerformanceEvidence): AnalyzerFinding {
  if (bytes === null) return unavailable(ruleId, evidence, `${label} transfer size could not be derived from Lighthouse resource evidence.`);
  const status: AnalyzerFinding["status"] = bytes <= pass ? "PASS" : bytes <= fail ? "WARNING" : "FAIL";
  return finding({
    ruleId,
    status,
    confidence: "HIGH",
    applicable: true,
    summary: `${label} transfer size was ${bytes} bytes in the controlled run.`,
    result: { transferBytes: bytes, passThresholdBytes: pass, failureThresholdBytes: fail },
    evidence: { source: evidence.source, strategy: evidence.strategy, resourceSummary: resourceSummary(evidence) },
  });
}

function auditScoreRule(ruleId: string, label: string, evidence: PerformanceEvidence, ids: string[]): AnalyzerFinding {
  const selected = audit(evidence, ...ids);
  if (!selected) return unavailable(ruleId, evidence, `${label} evidence was not emitted by the Lighthouse version used for this run.`);
  if (selected.score === null) return unavailable(ruleId, evidence, `${label} was present but did not provide a classifiable score.`);
  const status: AnalyzerFinding["status"] = selected.score >= 0.9 ? "PASS" : selected.score >= 0.5 ? "WARNING" : "FAIL";
  return finding({
    ruleId,
    status,
    confidence: "HIGH",
    applicable: true,
    summary: `${label} was classified from Lighthouse audit evidence.`,
    result: { auditScore: selected.score, numericValue: selected.numericValue, displayValue: selected.displayValue },
    evidence: { auditId: selected.id, title: selected.title, details: selected.details, source: evidence.source, strategy: evidence.strategy },
  });
}

function perf002(evidence: PerformanceEvidence): AnalyzerFinding {
  const selected = audit(evidence, "interaction-to-next-paint", "experimental-interaction-to-next-paint");
  if (!selected || selected.numericValue === null) {
    return finding({
      ruleId: "PERF-002",
      status: "UNKNOWN",
      confidence: "LOW",
      applicable: true,
      summary: "Synthetic interaction latency was not available in this Lighthouse run; TEQQI OS does not substitute field INP or invent interaction evidence.",
      result: { measurementMode: "synthetic_interaction", representativeLatencyMs: null, interactionsTested: 0, fieldINP: false },
      evidence: { source: evidence.source, strategy: evidence.strategy, limitation: "No safe synthetic interaction timing entry was emitted." },
    });
  }
  const value = selected.numericValue;
  const status: AnalyzerFinding["status"] = value <= THRESHOLDS.inpMs.pass ? "PASS" : value <= THRESHOLDS.inpMs.fail ? "WARNING" : "FAIL";
  return finding({ ruleId: "PERF-002", status, confidence: "MEDIUM", applicable: true, summary: `Synthetic interaction responsiveness measured ${Math.round(value)} ms.`, result: { measurementMode: "synthetic_interaction", representativeLatencyMs: value, interactionsTested: 1, fieldINP: false }, evidence: { auditId: selected.id, source: evidence.source, strategy: evidence.strategy } });
}

function perf015(evidence: PerformanceEvidence): AnalyzerFinding {
  const requests = audit(evidence, "network-requests")?.details?.items;
  if (!Array.isArray(requests)) return unavailable("PERF-015", evidence, "Network-request count was not available in Lighthouse evidence.");
  const count = requests.length;
  const status: AnalyzerFinding["status"] = count <= THRESHOLDS.requestCount.pass ? "PASS" : count <= THRESHOLDS.requestCount.fail ? "WARNING" : "FAIL";
  return finding({ ruleId: "PERF-015", status, confidence: "HIGH", applicable: true, summary: `The controlled page load issued ${count} network requests.`, result: { requestCount: count, passThreshold: THRESHOLDS.requestCount.pass, failureThreshold: THRESHOLDS.requestCount.fail }, evidence: { auditId: "network-requests", source: evidence.source, strategy: evidence.strategy } });
}

function perf016(evidence: PerformanceEvidence): AnalyzerFinding {
  const items = audit(evidence, "long-tasks")?.details?.items;
  if (!Array.isArray(items)) return unavailable("PERF-016", evidence, "Long-main-thread-task evidence was not available in Lighthouse output.");
  const count = items.length;
  const totalDurationMs = items.reduce((sum, item) => sum + (item && typeof item === "object" && typeof (item as Record<string, unknown>).duration === "number" ? (item as Record<string, number>).duration : 0), 0);
  const status: AnalyzerFinding["status"] = count <= THRESHOLDS.longTaskCount.pass ? "PASS" : count <= THRESHOLDS.longTaskCount.fail ? "WARNING" : "FAIL";
  return finding({ ruleId: "PERF-016", status, confidence: "HIGH", applicable: true, summary: `${count} long main-thread tasks were observed during the controlled run.`, result: { longTaskCount: count, totalDurationMs, passThreshold: THRESHOLDS.longTaskCount.pass, failureThreshold: THRESHOLDS.longTaskCount.fail }, evidence: { auditId: "long-tasks", source: evidence.source, strategy: evidence.strategy } });
}

export function runPerformanceRules(evidence: PerformanceEvidence): AnalyzerFinding[] {
  const totalBytes = audit(evidence, "total-byte-weight")?.numericValue ?? null;
  const jsBytes = resourceBytes(evidence, ["script"]);
  const cssBytes = resourceBytes(evidence, ["stylesheet", "css"]);
  const imageBytes = resourceBytes(evidence, ["image"]);

  return [
    numericRule({ ruleId: "PERF-001", evidence, auditIds: ["largest-contentful-paint"], metricName: "Largest Contentful Paint", resultKey: "lcpMs", pass: THRESHOLDS.lcpMs.pass, fail: THRESHOLDS.lcpMs.fail, unit: "ms" }),
    perf002(evidence),
    numericRule({ ruleId: "PERF-003", evidence, auditIds: ["cumulative-layout-shift"], metricName: "Cumulative Layout Shift", resultKey: "cls", pass: THRESHOLDS.cls.pass, fail: THRESHOLDS.cls.fail, unit: "score" }),
    numericRule({ ruleId: "PERF-004", evidence, auditIds: ["first-contentful-paint"], metricName: "First Contentful Paint", resultKey: "fcpMs", pass: THRESHOLDS.fcpMs.pass, fail: THRESHOLDS.fcpMs.fail, unit: "ms" }),
    numericRule({ ruleId: "PERF-005", evidence, auditIds: ["server-response-time"], metricName: "Time to First Byte / server response", resultKey: "ttfbMs", pass: THRESHOLDS.ttfbMs.pass, fail: THRESHOLDS.ttfbMs.fail, unit: "ms" }),
    payloadRule("PERF-006", "Total page", totalBytes, THRESHOLDS.totalBytes.pass, THRESHOLDS.totalBytes.fail, evidence),
    payloadRule("PERF-007", "JavaScript", jsBytes, THRESHOLDS.javascriptBytes.pass, THRESHOLDS.javascriptBytes.fail, evidence),
    payloadRule("PERF-008", "CSS", cssBytes, THRESHOLDS.cssBytes.pass, THRESHOLDS.cssBytes.fail, evidence),
    payloadRule("PERF-009", "Image", imageBytes, THRESHOLDS.imageBytes.pass, THRESHOLDS.imageBytes.fail, evidence),
    auditScoreRule("PERF-010", "Render-blocking resources", evidence, ["render-blocking-insight", "render-blocking-resources"]),
    auditScoreRule("PERF-011", "Text compression", evidence, ["uses-text-compression"]),
    auditScoreRule("PERF-012", "Static resource caching", evidence, ["cache-insight", "uses-long-cache-ttl"]),
    auditScoreRule("PERF-013", "Modern image delivery", evidence, ["modern-image-formats", "uses-webp-images"]),
    auditScoreRule("PERF-014", "Offscreen image lazy loading", evidence, ["offscreen-images"]),
    perf015(evidence),
    perf016(evidence),
  ];
}
