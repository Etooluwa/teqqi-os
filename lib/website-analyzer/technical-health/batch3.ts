import "server-only";

import type {
  AnalyzerFinding,
  RedirectConsistencyEvidence,
} from "@/lib/website-analyzer/types";

const DETECTOR_VERSION = "1.0.0";
const REDIRECT_WARNING_THRESHOLD = 2;
const REDIRECT_FAIL_THRESHOLD = 4;

function finding(input: Omit<AnalyzerFinding, "category" | "detectorVersion">): AnalyzerFinding {
  return {
    ...input,
    category: "TECHNICAL_HEALTH",
    detectorVersion: DETECTOR_VERSION,
  };
}

function evaluateTech011(evidence: RedirectConsistencyEvidence): AnalyzerFinding {
  if (!evidence.destinationSameSite) {
    return finding({
      ruleId: "TECH-011",
      status: "UNKNOWN",
      confidence: "LOW",
      applicable: true,
      summary: "A preferred hostname could not be determined because the homepage finishes on a different site.",
      result: { preferredHostname: null },
      evidence,
    });
  }

  return finding({
    ruleId: "TECH-011",
    status: "PASS",
    confidence: "HIGH",
    applicable: true,
    summary: evidence.hostnameVariantChanged
      ? "The website consistently resolves to a single preferred hostname variant."
      : "The requested hostname already matches the final preferred hostname.",
    result: {
      preferredHostname: evidence.finalHostname,
      requestedHostname: evidence.requestedHostname,
      hostnameVariantChanged: evidence.hostnameVariantChanged,
    },
    evidence,
  });
}

function evaluateTech012(evidence: RedirectConsistencyEvidence): AnalyzerFinding {
  if (evidence.repeatedUrlDetected) {
    return finding({
      ruleId: "TECH-012",
      status: "FAIL",
      confidence: "HIGH",
      applicable: true,
      summary: "A repeated URL was detected in the redirect path, indicating a redirect loop.",
      result: { redirectLoopDetected: true },
      evidence,
    });
  }

  return finding({
    ruleId: "TECH-012",
    status: "PASS",
    confidence: "HIGH",
    applicable: true,
    summary: "No redirect loop was detected in the completed homepage redirect path.",
    result: { redirectLoopDetected: false },
    evidence,
  });
}

function evaluateTech013(evidence: RedirectConsistencyEvidence): AnalyzerFinding {
  if (evidence.redirectCount >= REDIRECT_FAIL_THRESHOLD) {
    return finding({
      ruleId: "TECH-013",
      status: "FAIL",
      confidence: "HIGH",
      applicable: true,
      summary: "The homepage uses an excessively long redirect chain.",
      result: {
        redirectCount: evidence.redirectCount,
        warningThreshold: REDIRECT_WARNING_THRESHOLD,
        failThreshold: REDIRECT_FAIL_THRESHOLD,
      },
      evidence,
    });
  }

  if (evidence.redirectCount >= REDIRECT_WARNING_THRESHOLD) {
    return finding({
      ruleId: "TECH-013",
      status: "WARNING",
      confidence: "HIGH",
      applicable: true,
      summary: "The homepage uses multiple redirects before reaching its final destination.",
      result: {
        redirectCount: evidence.redirectCount,
        warningThreshold: REDIRECT_WARNING_THRESHOLD,
        failThreshold: REDIRECT_FAIL_THRESHOLD,
      },
      evidence,
    });
  }

  return finding({
    ruleId: "TECH-013",
    status: "PASS",
    confidence: "HIGH",
    applicable: true,
    summary: evidence.redirectCount === 0
      ? "The homepage loads without a redirect chain."
      : "The homepage uses a short, direct redirect path.",
    result: {
      redirectCount: evidence.redirectCount,
      warningThreshold: REDIRECT_WARNING_THRESHOLD,
      failThreshold: REDIRECT_FAIL_THRESHOLD,
    },
    evidence,
  });
}

function evaluateTech014(evidence: RedirectConsistencyEvidence): AnalyzerFinding {
  if (evidence.destinationSameSite) {
    return finding({
      ruleId: "TECH-014",
      status: "PASS",
      confidence: "HIGH",
      applicable: true,
      summary: "The homepage redirect destination remains on the same website hostname family.",
      result: {
        destinationRelevant: true,
        finalUrl: evidence.finalUrl,
      },
      evidence,
    });
  }

  return finding({
    ruleId: "TECH-014",
    status: "WARNING",
    confidence: "MEDIUM",
    applicable: true,
    summary: "The homepage finishes on a different hostname family, so destination relevance requires review.",
    result: {
      destinationRelevant: null,
      finalUrl: evidence.finalUrl,
    },
    evidence,
  });
}

function evaluateTech015(evidence: RedirectConsistencyEvidence): AnalyzerFinding {
  const final = new URL(evidence.finalUrl);
  const normalizedFinal = final.toString();
  const hasFragment = Boolean(final.hash);
  const hasDefaultPort =
    (final.protocol === "https:" && final.port === "443") ||
    (final.protocol === "http:" && final.port === "80");

  if (hasFragment || hasDefaultPort) {
    return finding({
      ruleId: "TECH-015",
      status: "WARNING",
      confidence: "HIGH",
      applicable: true,
      summary: "The final homepage URL contains a normalization issue that should not be required for the canonical homepage address.",
      result: {
        normalized: false,
        finalUrl: evidence.finalUrl,
        normalizedFinal,
        hasFragment,
        hasDefaultPort,
      },
      evidence,
    });
  }

  return finding({
    ruleId: "TECH-015",
    status: "PASS",
    confidence: "HIGH",
    applicable: true,
    summary: evidence.normalizedInputChanged
      ? "The submitted URL was normalized successfully before analysis and resolves to a clean final homepage URL."
      : "The homepage URL is already normalized and resolves to a clean final URL.",
    result: {
      normalized: true,
      finalUrl: evidence.finalUrl,
      normalizedInputChanged: evidence.normalizedInputChanged,
    },
    evidence,
  });
}

export function runTechnicalHealthBatch3(
  evidence: RedirectConsistencyEvidence,
): AnalyzerFinding[] {
  return [
    evaluateTech011(evidence),
    evaluateTech012(evidence),
    evaluateTech013(evidence),
    evaluateTech014(evidence),
    evaluateTech015(evidence),
  ];
}
