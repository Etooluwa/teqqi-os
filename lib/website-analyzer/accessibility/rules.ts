import "server-only";

import type { AnalyzerFinding, SeoEvidence, SeoPageEvidence } from "@/lib/website-analyzer/types";

const DETECTOR_VERSION = "1.0.0";

function f(ruleId: string, status: AnalyzerFinding["status"], summary: string, result: Record<string, unknown>, evidence: Record<string, unknown> = {}, confidence: AnalyzerFinding["confidence"] = "HIGH", applicable = true): AnalyzerFinding {
  return { ruleId, category: "ACCESSIBILITY", status, confidence, applicable, summary, result, evidence, detectorVersion: DETECTOR_VERSION };
}
function na(ruleId: string, summary: string): AnalyzerFinding { return f(ruleId, "NOT_APPLICABLE", summary, {}, {}, "HIGH", false); }
function unknown(ruleId: string, summary: string, evidence: Record<string, unknown> = {}): AnalyzerFinding { return f(ruleId, "UNKNOWN", summary, {}, evidence, "LOW", true); }
function pages(seo: SeoEvidence): SeoPageEvidence[] { return seo.pages; }

export function runAccessibilityRules(seo: SeoEvidence): AnalyzerFinding[] {
  const ps = pages(seo);
  if (ps.length === 0) return Array.from({ length: 22 }, (_, i) => na(`A11Y-${String(i + 1).padStart(3, "0")}`, "Accessibility inspection is not applicable because no HTML page was available."));

  const r: AnalyzerFinding[] = [];

  const images = ps.flatMap((p) => p.facts.images.map((img) => ({ page: p.finalUrl, ...img })));
  const missingAlt = images.filter((img) => !img.hasAltAttribute);
  const emptyAlt = images.filter((img) => img.hasAltAttribute && (img.alt ?? "").trim() === "");
  r.push(images.length === 0 ? na("A11Y-001", "No analyzable image elements were found.") : missingAlt.length > 0 ? f("A11Y-001", "FAIL", "One or more image elements are missing an alt attribute.", { imagesEvaluated: images.length, missingAlternatives: missingAlt.length, emptyAltImages: emptyAlt.length }, { missingAlt: missingAlt.slice(0, 20) }) : f("A11Y-001", emptyAlt.length > 0 ? "WARNING" : "PASS", emptyAlt.length > 0 ? "All images expose alt attributes, with some empty alternatives requiring contextual review." : "All analyzed image elements expose non-empty alt attributes.", { imagesEvaluated: images.length, missingAlternatives: 0, emptyAltImages: emptyAlt.length }, { emptyAlt: emptyAlt.slice(0, 20) }, emptyAlt.length > 0 ? "MEDIUM" : "HIGH"));

  r.push(unknown("A11Y-002", "Icon/image control naming requires element-child relationships or accessibility-tree evidence not preserved in the shared static fact model.", { limitation: "no_control_child_graph_or_accessibility_tree" }));

  const controls = ps.flatMap((p) => p.facts.forms.flatMap((form) => form.controls.filter((c) => c.tag !== "button" && c.type !== "submit").map((c) => ({ page: p.finalUrl, ...c }))));
  const unlabeled = controls.filter((c) => !c.hasAssociatedLabel && !(c.ariaLabel ?? "").trim() && !(c.ariaLabelledBy ?? "").trim() && !c.accessibleName.trim());
  r.push(controls.length === 0 ? na("A11Y-003", "No user-input form controls were found.") : unlabeled.length > 0 ? f("A11Y-003", "FAIL", "One or more user-input controls lack an accessible label or name.", { controlsEvaluated: controls.length, unlabeledControls: unlabeled.length }, { unlabeled: unlabeled.slice(0, 20) }) : f("A11Y-003", "PASS", "All analyzed user-input controls expose an accessible label or name.", { controlsEvaluated: controls.length, unlabeledControls: 0 }));

  r.push(controls.length === 0 ? na("A11Y-004", "No form controls were available for required-state inspection.") : unknown("A11Y-004", "Programmatic required-state evaluation is unavailable because the current shared form model does not preserve native required or aria-required attributes.", { controlsEvaluated: controls.length }));
  r.push(controls.length === 0 ? na("A11Y-005", "No form controls were available for error-association inspection.") : unknown("A11Y-005", "Programmatic form-error association requires validation-state interaction and aria-describedby/error relationship evidence not yet collected.", { controlsEvaluated: controls.length }));

  const buttons = ps.flatMap((p) => p.facts.buttons.map((b) => ({ page: p.finalUrl, ...b })));
  const unnamedButtons = buttons.filter((b) => !b.accessibleName.trim() && !(b.ariaLabel ?? "").trim() && !b.text.trim());
  r.push(buttons.length === 0 ? na("A11Y-006", "No button elements were found.") : unnamedButtons.length > 0 ? f("A11Y-006", "FAIL", "One or more buttons have no accessible name.", { buttonsEvaluated: buttons.length, unnamedButtons: unnamedButtons.length }, { unnamedButtons: unnamedButtons.slice(0, 20) }) : f("A11Y-006", "PASS", "All analyzed buttons expose an accessible name.", { buttonsEvaluated: buttons.length, unnamedButtons: 0 }));

  const links = ps.flatMap((p) => p.facts.links.map((l) => ({ page: p.finalUrl, ...l })));
  const unnamedLinks = links.filter((l) => !l.accessibleName.trim() && !l.text.trim() && !(l.ariaLabel ?? "").trim());
  r.push(links.length === 0 ? na("A11Y-007", "No links were found.") : unnamedLinks.length > 0 ? f("A11Y-007", "FAIL", "One or more links have no accessible name.", { linksEvaluated: links.length, unnamedLinks: unnamedLinks.length }, { unnamedLinks: unnamedLinks.slice(0, 20) }) : f("A11Y-007", "PASS", "All analyzed links expose an accessible name.", { linksEvaluated: links.length, unnamedLinks: 0 }));

  r.push(unknown("A11Y-008", "Appropriate interactive semantics require raw role/tabindex/custom-control evidence not preserved in the current shared fact model."));
  r.push(unknown("A11Y-009", "Keyboard accessibility requires rendered browser interaction evidence."));
  r.push(unknown("A11Y-010", "Visible keyboard focus requires rendered computed-style and keyboard interaction evidence."));
  r.push(unknown("A11Y-011", "Logical focus order requires browser tab-sequence execution."));
  r.push(unknown("A11Y-012", "Keyboard-trap detection requires controlled keyboard interaction in a rendered browser."));
  r.push(unknown("A11Y-013", "Text color contrast requires rendered foreground/background color and geometry evidence."));
  r.push(unknown("A11Y-014", "Non-text UI contrast requires rendered computed-style and component-boundary evidence."));

  const missingLang = ps.filter((p) => !(p.facts.htmlLang ?? "").trim());
  r.push(missingLang.length > 0 ? f("A11Y-015", missingLang.some((p) => p.isHomepage) ? "FAIL" : "WARNING", "One or more analyzed pages do not declare a document language.", { pagesEvaluated: ps.length, pagesMissingLanguage: missingLang.length }, { pages: missingLang.map((p) => p.finalUrl) }, "HIGH") : f("A11Y-015", "PASS", "All analyzed pages declare a document language.", { pagesEvaluated: ps.length, pagesMissingLanguage: 0 }));

  const headingIssues = ps.map((p) => {
    let previous: number | null = null;
    let skipped = 0;
    for (const h of p.facts.headings) {
      if (previous !== null && h.level > previous + 1) skipped += 1;
      previous = h.level;
    }
    return { page: p.finalUrl, headingCount: p.facts.headings.length, h1Count: p.facts.h1Texts.length, skippedLevels: skipped };
  });
  const badHeadings = headingIssues.filter((x) => x.h1Count === 0 || x.skippedLevels > 0);
  r.push(badHeadings.length === 0 ? f("A11Y-016", "PASS", "No basic heading-structure accessibility issues were detected.", { pagesEvaluated: ps.length, affectedPages: 0 }) : f("A11Y-016", badHeadings.some((x) => x.h1Count === 0) ? "FAIL" : "WARNING", "One or more pages have missing H1 headings or skipped heading levels.", { pagesEvaluated: ps.length, affectedPages: badHeadings.length }, { pages: badHeadings }, "HIGH"));

  const landmarkIssues = ps.map((p) => ({ page: p.finalUrl, ...p.facts.landmarks })).filter((x) => x.mainCount === 0 || x.navCount === 0);
  r.push(landmarkIssues.length === 0 ? f("A11Y-017", "PASS", "Analyzed pages expose basic main and navigation landmark structure.", { pagesEvaluated: ps.length, affectedPages: 0 }) : f("A11Y-017", landmarkIssues.some((x) => x.mainCount === 0) ? "FAIL" : "WARNING", "One or more pages are missing expected main or navigation landmarks.", { pagesEvaluated: ps.length, affectedPages: landmarkIssues.length }, { pages: landmarkIssues }, "HIGH"));

  const skipLinks = ps.flatMap((p) => p.facts.links.filter((l) => (l.href ?? "").startsWith("#") && /skip|main content|content/i.test(l.accessibleName || l.text)).map((l) => ({ page: p.finalUrl, href: l.href, text: l.accessibleName || l.text })));
  r.push(skipLinks.length > 0 ? f("A11Y-018", "PASS", "A skip-navigation mechanism was detected.", { skipLinks: skipLinks.length }, { samples: skipLinks.slice(0, 10) }, "MEDIUM") : f("A11Y-018", "WARNING", "No skip-navigation link was detected in static link evidence.", { skipLinks: 0 }, { limitation: "custom_or_scripted_skip_mechanisms_may_not_be_detected" }, "MEDIUM"));

  r.push(unknown("A11Y-019", "ARIA attribute validity requires raw ARIA attribute inventory not currently preserved by the shared parser."));
  r.push(unknown("A11Y-020", "ARIA role validity and appropriateness require raw role attributes and element-context evidence not currently preserved."));
  r.push(unknown("A11Y-021", "Referenced ARIA ID resolution requires the full DOM ID and ARIA-reference inventory, which is not yet preserved."));
  r.push(unknown("A11Y-022", "Duplicate DOM ID detection requires a complete document-wide ID inventory; the current fact model preserves IDs only for selected elements."));

  return r;
}
