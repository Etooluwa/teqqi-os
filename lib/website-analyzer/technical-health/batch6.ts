import "server-only";

import type { AnalyzerFinding, MobileUsabilityEvidence, PageFacts } from "@/lib/website-analyzer/types";

const DETECTOR_VERSION = "1.0.0";

function finding(input: Omit<AnalyzerFinding, "category" | "detectorVersion">): AnalyzerFinding {
  return { ...input, category: "TECHNICAL_HEALTH", detectorVersion: DETECTOR_VERSION };
}

function notApplicable(ruleId: string, summary: string): AnalyzerFinding {
  return finding({ ruleId, status: "NOT_APPLICABLE", confidence: "HIGH", applicable: false, summary, result: {}, evidence: {} });
}

function evaluateTech025(evidence: MobileUsabilityEvidence | null, pageFacts: PageFacts | null): AnalyzerFinding {
  if (!pageFacts || !evidence) return notApplicable("TECH-025", "Viewport configuration is not applicable because the homepage was not confirmed as HTML.");
  const viewport = evidence.viewport;
  if (!viewport.present) {
    return finding({ ruleId: "TECH-025", status: "FAIL", confidence: "HIGH", applicable: true, summary: "The homepage does not declare a viewport meta tag.", result: { viewportConfigured: false }, evidence: { viewport } });
  }
  if (viewport.hasDeviceWidth && viewport.hasInitialScale && !viewport.userScalableDisabled && !viewport.maximumScaleRestricted) {
    return finding({ ruleId: "TECH-025", status: "PASS", confidence: "HIGH", applicable: true, summary: "The viewport is configured for responsive mobile rendering without restrictive zoom settings.", result: { viewportConfigured: true }, evidence: { viewport } });
  }
  return finding({ ruleId: "TECH-025", status: "WARNING", confidence: "HIGH", applicable: true, summary: "A viewport meta tag is present, but its configuration is incomplete or restricts mobile zoom behavior.", result: { viewportConfigured: true, configurationComplete: false }, evidence: { viewport } });
}

function evaluateTech026(evidence: MobileUsabilityEvidence | null, pageFacts: PageFacts | null): AnalyzerFinding {
  if (!pageFacts || !evidence) return notApplicable("TECH-026", "Responsive-layout evaluation is not applicable because the homepage was not confirmed as HTML.");
  const signals = evidence.responsiveSignals;
  const strongResponsiveSignal = signals.mediaQueryCount > 0 || signals.responsiveStylesheetHints.length > 0 || signals.responsiveImageCount > 0;
  if (signals.fixedWidthOverflowCandidates > 0 && !strongResponsiveSignal) {
    return finding({ ruleId: "TECH-026", status: "WARNING", confidence: "MEDIUM", applicable: true, summary: "Static markup contains fixed-width elements wider than the mobile reference viewport without strong responsive-layout signals.", result: { responsiveLayout: null, fixedWidthOverflowCandidates: signals.fixedWidthOverflowCandidates }, evidence: { method: evidence.method, responsiveSignals: signals, limitations: evidence.limitations } });
  }
  if (evidence.viewport.hasDeviceWidth && strongResponsiveSignal && signals.fixedWidthOverflowCandidates === 0) {
    return finding({ ruleId: "TECH-026", status: "PASS", confidence: "MEDIUM", applicable: true, summary: "Static HTML/CSS contains consistent responsive-layout signals and no obvious fixed-width overflow candidates.", result: { responsiveLayout: true }, evidence: { method: evidence.method, responsiveSignals: signals, limitations: evidence.limitations } });
  }
  return finding({ ruleId: "TECH-026", status: "UNKNOWN", confidence: "LOW", applicable: true, summary: "Static evidence is insufficient to determine actual responsive layout behavior without rendered viewport geometry.", result: { responsiveLayout: null }, evidence: { method: evidence.method, responsiveSignals: signals, viewport: evidence.viewport, limitations: evidence.limitations } });
}

function evaluateTech027(evidence: MobileUsabilityEvidence | null, pageFacts: PageFacts | null): AnalyzerFinding {
  if (!pageFacts || !evidence) return notApplicable("TECH-027", "Mobile-navigation evaluation is not applicable because the homepage was not confirmed as HTML.");
  const nav = evidence.navigation;
  if (nav.navElementCount === 0) {
    return finding({ ruleId: "TECH-027", status: "UNKNOWN", confidence: "LOW", applicable: true, summary: "No semantic navigation container was found in static HTML; runtime navigation behavior could not be confirmed.", result: { mobileNavigationUsable: null }, evidence: { navigation: nav, limitations: evidence.limitations } });
  }
  if (nav.toggleCandidateCount > 0) {
    return finding({ ruleId: "TECH-027", status: "PASS", confidence: "MEDIUM", applicable: true, summary: "The page exposes semantic navigation and at least one mobile-menu control candidate.", result: { mobileNavigationUsable: true, toggleCandidateCount: nav.toggleCandidateCount }, evidence: { navigation: nav, limitations: evidence.limitations } });
  }
  if (nav.navLinkCount <= 5) {
    return finding({ ruleId: "TECH-027", status: "PASS", confidence: "MEDIUM", applicable: true, summary: "The semantic navigation contains a small number of links and no obvious static mobile-navigation risk was found.", result: { mobileNavigationUsable: true, navLinkCount: nav.navLinkCount }, evidence: { navigation: nav, limitations: evidence.limitations } });
  }
  return finding({ ruleId: "TECH-027", status: "UNKNOWN", confidence: "LOW", applicable: true, summary: "Navigation exists, but static HTML cannot confirm whether the multi-link menu remains usable at a mobile viewport.", result: { mobileNavigationUsable: null, navLinkCount: nav.navLinkCount }, evidence: { navigation: nav, limitations: evidence.limitations } });
}

function evaluateTech028(evidence: MobileUsabilityEvidence | null, pageFacts: PageFacts | null): AnalyzerFinding {
  if (!pageFacts || !evidence) return notApplicable("TECH-028", "Mobile content-visibility evaluation is not applicable because the homepage was not confirmed as HTML.");
  const essential = evidence.essentialContent;
  if (essential.staticallyHiddenEssentialCount > 0) {
    return finding({ ruleId: "TECH-028", status: "WARNING", confidence: "MEDIUM", applicable: true, summary: "Static markup hides one or more elements treated as essential-content candidates.", result: { essentialContentVisibleOnMobile: null, staticallyHiddenEssentialCount: essential.staticallyHiddenEssentialCount }, evidence: { essentialContent: essential, limitations: evidence.limitations } });
  }
  if ((essential.mainCount > 0 || essential.h1Count > 0) && essential.ctaCount > 0) {
    return finding({ ruleId: "TECH-028", status: "PASS", confidence: "MEDIUM", applicable: true, summary: "Core content and interactive elements are present without static hidden-state evidence.", result: { essentialContentVisibleOnMobile: true }, evidence: { essentialContent: essential, limitations: evidence.limitations } });
  }
  return finding({ ruleId: "TECH-028", status: "UNKNOWN", confidence: "LOW", applicable: true, summary: "Static markup does not provide enough evidence to confirm essential content visibility on a rendered mobile viewport.", result: { essentialContentVisibleOnMobile: null }, evidence: { essentialContent: essential, limitations: evidence.limitations } });
}

function evaluateTech029(evidence: MobileUsabilityEvidence | null, pageFacts: PageFacts | null): AnalyzerFinding {
  if (!pageFacts || !evidence) return notApplicable("TECH-029", "Touch-target evaluation is not applicable because the homepage was not confirmed as HTML.");
  const targets = evidence.touchTargets;
  if (targets.totalCandidates === 0) {
    return finding({ ruleId: "TECH-029", status: "NOT_APPLICABLE", confidence: "HIGH", applicable: false, summary: "No interactive touch-target candidates were found on the homepage.", result: {}, evidence: { touchTargets: targets } });
  }
  if (targets.explicitTooSmallCount > 0) {
    return finding({ ruleId: "TECH-029", status: "WARNING", confidence: "HIGH", applicable: true, summary: "One or more interactive elements declare explicit dimensions below the 44px mobile touch-target reference size.", result: { touchTargetsAccessible: false, explicitTooSmallCount: targets.explicitTooSmallCount }, evidence: { touchTargets: targets, referenceMinPx: 44, limitations: evidence.limitations } });
  }
  if (targets.explicitlyMeasured === targets.totalCandidates && targets.totalCandidates > 0) {
    return finding({ ruleId: "TECH-029", status: "PASS", confidence: "MEDIUM", applicable: true, summary: "All statically measurable interactive targets meet the 44px reference size.", result: { touchTargetsAccessible: true }, evidence: { touchTargets: targets, referenceMinPx: 44, limitations: evidence.limitations } });
  }
  return finding({ ruleId: "TECH-029", status: "UNKNOWN", confidence: "LOW", applicable: true, summary: "Most touch-target sizes depend on rendered CSS, so static HTML cannot determine their final mobile geometry reliably.", result: { touchTargetsAccessible: null, explicitlyMeasured: targets.explicitlyMeasured, totalCandidates: targets.totalCandidates }, evidence: { touchTargets: targets, referenceMinPx: 44, limitations: evidence.limitations } });
}

export function runTechnicalHealthBatch6(input: { evidence: MobileUsabilityEvidence | null; pageFacts: PageFacts | null }): AnalyzerFinding[] {
  return [
    evaluateTech025(input.evidence, input.pageFacts),
    evaluateTech026(input.evidence, input.pageFacts),
    evaluateTech027(input.evidence, input.pageFacts),
    evaluateTech028(input.evidence, input.pageFacts),
    evaluateTech029(input.evidence, input.pageFacts),
  ];
}
