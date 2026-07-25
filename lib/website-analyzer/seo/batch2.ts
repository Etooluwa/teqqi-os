import "server-only";

import type { AnalyzerFinding, HeadingFact, SeoEvidence, SeoPageEvidence } from "@/lib/website-analyzer/types";

const DETECTOR_VERSION = "1.0.0";

function finding(input: Omit<AnalyzerFinding, "category" | "detectorVersion">): AnalyzerFinding {
  return { ...input, category: "SEO", detectorVersion: DETECTOR_VERSION };
}

function pageHeadings(page: SeoPageEvidence) {
  return page.facts.headings.map((heading) => ({ level: heading.level, text: heading.text, id: heading.id }));
}

function seo007(evidence: SeoEvidence): AnalyzerFinding {
  if (evidence.pages.length === 0) {
    return finding({ ruleId: "SEO-007", status: "NOT_APPLICABLE", confidence: "HIGH", applicable: false, summary: "H1 inspection is not applicable because no HTML pages were available.", result: {}, evidence: { pages: [] } });
  }

  const pages = evidence.pages.map((page) => ({ url: page.finalUrl, isHomepage: page.isHomepage, h1Count: page.facts.h1Texts.length, h1Texts: page.facts.h1Texts }));
  const missing = pages.filter((page) => page.h1Count === 0);
  const homepageMissing = missing.some((page) => page.isHomepage);
  const ratio = missing.length / pages.length;
  const status: AnalyzerFinding["status"] = homepageMissing || missing.length >= 2 || ratio >= 0.25 ? "FAIL" : missing.length > 0 ? "WARNING" : "PASS";
  const summary = status === "PASS" ? "Every analyzed HTML page contains an H1 heading." : status === "FAIL" ? (homepageMissing ? "The homepage does not contain an H1 heading." : `${missing.length} analyzed pages do not contain an H1 heading.`) : "A sampled secondary page does not contain an H1 heading.";

  return finding({ ruleId: "SEO-007", status, confidence: "HIGH", applicable: true, summary, result: { pagesEvaluated: pages.length, pagesWithH1: pages.length - missing.length, pagesMissingH1: missing.length, homepageMissing }, evidence: { pages, missingRatio: ratio } });
}

function seo008(evidence: SeoEvidence): AnalyzerFinding {
  const pagesWithH1 = evidence.pages.filter((page) => page.facts.h1Texts.length > 0);
  if (pagesWithH1.length === 0) {
    return finding({ ruleId: "SEO-008", status: "NOT_APPLICABLE", confidence: "HIGH", applicable: false, summary: "H1 usage evaluation is not applicable because no analyzed page contains an H1.", result: {}, evidence: { pages: [] } });
  }

  const pages = pagesWithH1.map((page) => {
    const emptyH1Count = page.facts.headings.filter((heading) => heading.level === 1 && heading.text.trim().length === 0).length;
    return { url: page.finalUrl, isHomepage: page.isHomepage, h1Count: page.facts.h1Texts.length, h1Texts: page.facts.h1Texts, emptyH1Count };
  });
  const multiple = pages.filter((page) => page.h1Count > 1);
  const severe = pages.filter((page) => page.h1Count >= 3 || page.emptyH1Count > 0);
  const homepageSevere = severe.some((page) => page.isHomepage);
  const status: AnalyzerFinding["status"] = homepageSevere || severe.length >= 2 ? "FAIL" : multiple.length > 0 || severe.length > 0 ? "WARNING" : "PASS";
  const summary = status === "PASS" ? "Analyzed pages use a single non-empty H1 heading." : status === "FAIL" ? "One or more analyzed pages have severe H1 usage problems." : "One or more analyzed pages contain multiple H1 headings.";

  return finding({ ruleId: "SEO-008", status, confidence: "HIGH", applicable: true, summary, result: { pagesEvaluated: pages.length, pagesWithSingleH1: pages.filter((page) => page.h1Count === 1 && page.emptyH1Count === 0).length, pagesWithMultipleH1: multiple.length, severePages: severe.length }, evidence: { pages } });
}

function hierarchyIssues(headings: HeadingFact[]) {
  const issues: Array<{ index: number; fromLevel: number | null; toLevel: number; text: string; reason: string }> = [];
  let previousLevel: number | null = null;
  headings.forEach((heading, index) => {
    if (previousLevel !== null && heading.level > previousLevel + 1) {
      issues.push({ index, fromLevel: previousLevel, toLevel: heading.level, text: heading.text, reason: "skipped_heading_level" });
    }
    previousLevel = heading.level;
  });
  return issues;
}

function seo009(evidence: SeoEvidence): AnalyzerFinding {
  const pagesWithHeadings = evidence.pages.filter((page) => page.facts.headings.length > 0);
  if (pagesWithHeadings.length === 0) {
    return finding({ ruleId: "SEO-009", status: "NOT_APPLICABLE", confidence: "HIGH", applicable: false, summary: "Heading-hierarchy evaluation is not applicable because no headings were found.", result: {}, evidence: { pages: [] } });
  }

  const pages = pagesWithHeadings.map((page) => ({ url: page.finalUrl, isHomepage: page.isHomepage, headings: pageHeadings(page), issues: hierarchyIssues(page.facts.headings) }));
  const affected = pages.filter((page) => page.issues.length > 0);
  const totalIssues = affected.reduce((sum, page) => sum + page.issues.length, 0);
  const homepageAffected = affected.some((page) => page.isHomepage);
  const ratio = affected.length / pages.length;
  const status: AnalyzerFinding["status"] = totalIssues === 0 ? "PASS" : homepageAffected && totalIssues >= 2 || affected.length >= 2 || ratio >= 0.25 ? "FAIL" : "WARNING";
  const summary = status === "PASS" ? "No skipped heading levels were found in the analyzed heading sequences." : status === "FAIL" ? "Heading-level skips affect important or multiple analyzed pages." : "A heading-level skip was found on a sampled page.";

  return finding({ ruleId: "SEO-009", status, confidence: "HIGH", applicable: true, summary, result: { pagesEvaluated: pages.length, affectedPages: affected.length, hierarchyIssues: totalIssues, homepageAffected }, evidence: { method: "source_order_level_transition", pages: affected.length > 0 ? affected : pages.map((page) => ({ ...page, headings: page.headings.slice(0, 30) })) } });
}

export function runSeoBatch2(evidence: SeoEvidence): AnalyzerFinding[] {
  return [seo007(evidence), seo008(evidence), seo009(evidence)];
}
