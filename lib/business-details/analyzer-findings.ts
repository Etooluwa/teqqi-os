import type { AnalyzerCategory, AnalyzerFinding, RuleStatus } from "@/lib/website-analyzer/types";
import type { RuleScoreResult } from "@/lib/website-scoring/types";
import type {
  BusinessDetailAnalyzerFindings,
  BusinessDetailFinding,
  BusinessDetailFindingGroup,
} from "./types";

const CATEGORY_ORDER: AnalyzerCategory[] = [
  "TECHNICAL_HEALTH",
  "SEO",
  "PERFORMANCE",
  "ACCESSIBILITY",
  "CONVERSION_UX",
  "CONTENT_QUALITY",
];

function emptyUnavailable(reason: BusinessDetailAnalyzerFindings["unavailableReason"]): BusinessDetailAnalyzerFindings {
  return {
    available: false,
    unavailableReason: reason,
    analyzerVersion: null,
    findingCount: 0,
    groups: [],
  };
}

function countStatus(findings: readonly BusinessDetailFinding[], status: RuleStatus): number {
  return findings.filter((finding) => finding.status === status).length;
}

function presentFinding(finding: AnalyzerFinding, scoreByRule: ReadonlyMap<string, RuleScoreResult>): BusinessDetailFinding {
  const score = scoreByRule.get(finding.ruleId) ?? null;
  return {
    ruleId: finding.ruleId,
    category: finding.category,
    status: finding.status,
    confidence: finding.confidence,
    applicable: finding.applicable,
    summary: finding.summary,
    result: finding.result,
    evidence: finding.evidence,
    detectorVersion: finding.detectorVersion,
    scoring: {
      matched: Boolean(score),
      included: score?.included ?? false,
      exclusionReason: score?.exclusionReason ?? null,
      earnedPoints: score?.earnedPoints ?? null,
      maxPoints: score?.maxPoints ?? null,
    },
  };
}

export function buildBusinessDetailAnalyzerFindings(input: {
  analyzerVersion: string | null;
  findings: AnalyzerFinding[] | null;
  ruleScores: RuleScoreResult[] | null;
  hasScoringRun: boolean;
}): BusinessDetailAnalyzerFindings {
  if (!input.hasScoringRun) return emptyUnavailable("NO_COMPLETED_SCORING_RUN");
  if (!input.findings) return emptyUnavailable("LEGACY_SCORING_RUN_WITHOUT_ANALYZER_FINDINGS");

  const duplicateCheck = new Set<string>();
  for (const finding of input.findings) {
    if (duplicateCheck.has(finding.ruleId)) {
      throw new Error(`Duplicate analyzer finding ${finding.ruleId} in persisted scoring run.`);
    }
    duplicateCheck.add(finding.ruleId);
  }

  const scoreByRule = new Map((input.ruleScores ?? []).map((score) => [score.ruleId, score] as const));
  const presented = input.findings.map((finding) => presentFinding(finding, scoreByRule));

  const groups: BusinessDetailFindingGroup[] = CATEGORY_ORDER.map((category) => {
    const findings = presented.filter((finding) => finding.category === category);
    return {
      category,
      findingCount: findings.length,
      passCount: countStatus(findings, "PASS"),
      warningCount: countStatus(findings, "WARNING"),
      failCount: countStatus(findings, "FAIL"),
      unknownCount: countStatus(findings, "UNKNOWN"),
      notApplicableCount: countStatus(findings, "NOT_APPLICABLE"),
      findings,
    };
  });

  return {
    available: true,
    unavailableReason: null,
    analyzerVersion: input.analyzerVersion,
    findingCount: presented.length,
    groups,
  };
}
