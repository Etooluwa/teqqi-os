import { WEBSITE_ANALYZER_VERSION } from "@/lib/website-analyzer/version";
import type { AnalyzerAuditEnvelope, AuditStatus } from "@/lib/website-analyzer/types";

const allowedTransitions: Record<AuditStatus, AuditStatus[]> = {
  PENDING: ["RUNNING", "FAILED"],
  RUNNING: ["COMPLETED", "PARTIAL", "FAILED"],
  COMPLETED: [],
  PARTIAL: [],
  FAILED: [],
};

export function canTransitionAuditStatus(from: AuditStatus, to: AuditStatus): boolean {
  return allowedTransitions[from].includes(to);
}

export function createAuditEnvelope(params: {
  requestedUrl: string;
  normalizedUrl: string;
}): AnalyzerAuditEnvelope {
  return {
    analyzerVersion: WEBSITE_ANALYZER_VERSION,
    status: "PENDING",
    requestedUrl: params.requestedUrl,
    normalizedUrl: params.normalizedUrl,
    createdAt: new Date().toISOString(),
  };
}
