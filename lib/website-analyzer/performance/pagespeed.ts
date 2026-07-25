import "server-only";

import type { PerformanceEvidence, PerformanceAuditEvidence } from "@/lib/website-analyzer/types";

const PAGESPEED_ENDPOINT = "https://pagespeedonline.googleapis.com/pagespeedonline/v5/runPagespeed";
const REQUEST_TIMEOUT_MS = 45_000;

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function toAuditEvidence(id: string, raw: unknown): PerformanceAuditEvidence | null {
  if (!raw || typeof raw !== "object") return null;
  const audit = raw as Record<string, unknown>;
  const details = audit.details && typeof audit.details === "object" ? audit.details as Record<string, unknown> : null;
  return {
    id,
    score: asNumber(audit.score),
    numericValue: asNumber(audit.numericValue),
    numericUnit: typeof audit.numericUnit === "string" ? audit.numericUnit : null,
    displayValue: typeof audit.displayValue === "string" ? audit.displayValue : null,
    title: typeof audit.title === "string" ? audit.title : null,
    description: typeof audit.description === "string" ? audit.description : null,
    details,
  };
}

export async function collectPerformanceEvidence(url: string): Promise<PerformanceEvidence> {
  const endpoint = new URL(PAGESPEED_ENDPOINT);
  endpoint.searchParams.set("url", url);
  endpoint.searchParams.set("strategy", "mobile");
  endpoint.searchParams.append("category", "performance");

  const optionalKey = process.env.PAGESPEED_API_KEY?.trim();
  if (optionalKey) endpoint.searchParams.set("key", optionalKey);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(endpoint.toString(), {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text();
      return {
        source: "PAGESPEED_INSIGHTS_LIGHTHOUSE",
        strategy: "mobile",
        available: false,
        analyzedUrl: url,
        finalUrl: null,
        analysisTimestamp: null,
        lighthouseVersion: null,
        performanceScore: null,
        audits: {},
        error: `PageSpeed Insights returned HTTP ${response.status}: ${body.slice(0, 300)}`,
      };
    }

    const payload = await response.json() as Record<string, unknown>;
    const lighthouse = payload.lighthouseResult && typeof payload.lighthouseResult === "object"
      ? payload.lighthouseResult as Record<string, unknown>
      : null;
    const rawAudits = lighthouse?.audits && typeof lighthouse.audits === "object"
      ? lighthouse.audits as Record<string, unknown>
      : {};
    const categories = lighthouse?.categories && typeof lighthouse.categories === "object"
      ? lighthouse.categories as Record<string, unknown>
      : {};
    const performanceCategory = categories.performance && typeof categories.performance === "object"
      ? categories.performance as Record<string, unknown>
      : null;

    const audits: Record<string, PerformanceAuditEvidence> = {};
    for (const [id, rawAudit] of Object.entries(rawAudits)) {
      const normalized = toAuditEvidence(id, rawAudit);
      if (normalized) audits[id] = normalized;
    }

    return {
      source: "PAGESPEED_INSIGHTS_LIGHTHOUSE",
      strategy: "mobile",
      available: Boolean(lighthouse),
      analyzedUrl: url,
      finalUrl: typeof payload.id === "string" ? payload.id : null,
      analysisTimestamp: typeof payload.analysisUTCTimestamp === "string" ? payload.analysisUTCTimestamp : null,
      lighthouseVersion: typeof lighthouse?.lighthouseVersion === "string" ? lighthouse.lighthouseVersion : null,
      performanceScore: asNumber(performanceCategory?.score),
      audits,
      error: lighthouse ? null : "PageSpeed Insights response did not include Lighthouse results.",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      source: "PAGESPEED_INSIGHTS_LIGHTHOUSE",
      strategy: "mobile",
      available: false,
      analyzedUrl: url,
      finalUrl: null,
      analysisTimestamp: null,
      lighthouseVersion: null,
      performanceScore: null,
      audits: {},
      error: message,
    };
  } finally {
    clearTimeout(timeout);
  }
}
