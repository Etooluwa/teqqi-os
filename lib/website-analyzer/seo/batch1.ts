import "server-only";

import type { AnalyzerFinding, SeoEvidence, SeoPageEvidence } from "@/lib/website-analyzer/types";

const DETECTOR_VERSION = "1.0.0";

const TITLE_THRESHOLDS = {
  failTooShort: 3,
  warnTooShort: 20,
  warnTooLong: 70,
  failTooLong: 150,
} as const;

const DESCRIPTION_THRESHOLDS = {
  failTooShort: 20,
  warnTooShort: 70,
  warnTooLong: 180,
  failTooLong: 320,
} as const;

const GENERIC_TITLES = new Set(["home", "homepage", "page", "new page", "untitled", "welcome"]);
const GENERIC_DESCRIPTIONS = new Set(["description", "meta description", "website description", "coming soon"]);

function finding(input: Omit<AnalyzerFinding, "category" | "detectorVersion">): AnalyzerFinding {
  return { ...input, category: "SEO", detectorVersion: DETECTOR_VERSION };
}

function normalizeDuplicateText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[|–—\-_:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function homepage(pages: SeoPageEvidence[]): SeoPageEvidence | undefined {
  return pages.find((page) => page.isHomepage);
}

function affectedRatio(affected: number, total: number): number {
  return total > 0 ? affected / total : 0;
}

function seo001(evidence: SeoEvidence): AnalyzerFinding {
  if (evidence.pages.length === 0) {
    return finding({ ruleId: "SEO-001", status: "NOT_APPLICABLE", confidence: "HIGH", applicable: false, summary: "Title-tag inspection is not applicable because no HTML pages were available.", result: {}, evidence: { pages: [] } });
  }

  const pageEvidence = evidence.pages.map((page) => ({ url: page.finalUrl, isHomepage: page.isHomepage, titleElementCount: page.facts.titleCount, title: page.facts.title }));
  const missing = pageEvidence.filter((page) => !page.title);
  const duplicateElements = pageEvidence.filter((page) => page.titleElementCount > 1);
  const homepageMissing = missing.some((page) => page.isHomepage);
  const ratio = affectedRatio(missing.length, pageEvidence.length);

  let status: AnalyzerFinding["status"] = "PASS";
  let summary = "Every analyzed HTML page contains exactly one usable title tag.";
  if (homepageMissing || missing.length >= 2 || ratio >= 0.25) {
    status = "FAIL";
    summary = homepageMissing ? "The homepage is missing a usable title tag." : `${missing.length} analyzed pages are missing usable title tags.`;
  } else if (missing.length > 0 || duplicateElements.length > 0) {
    status = "WARNING";
    summary = missing.length > 0 ? "A sampled secondary page is missing a usable title tag." : "One or more pages contain multiple title elements.";
  }

  return finding({ ruleId: "SEO-001", status, confidence: "HIGH", applicable: true, summary, result: { pagesEvaluated: pageEvidence.length, pagesWithTitle: pageEvidence.length - missing.length, pagesMissingTitle: missing.length, homepageMissing, duplicateTitleElementPages: duplicateElements.length }, evidence: { pages: pageEvidence, missingRatio: ratio } });
}

function classifyTitle(page: SeoPageEvidence) {
  const title = page.facts.title;
  if (!title) return { classification: "not_applicable", status: "NOT_APPLICABLE" as const, characterCount: 0, signals: ["missing_title"] };
  const normalized = title.trim().toLowerCase();
  const length = title.length;
  const signals: string[] = [];
  if (GENERIC_TITLES.has(normalized)) signals.push("generic_title");
  if (length < TITLE_THRESHOLDS.failTooShort) signals.push("extremely_short");
  if (length > TITLE_THRESHOLDS.failTooLong) signals.push("extremely_long");
  if (signals.length > 0) return { classification: "poor", status: "FAIL" as const, characterCount: length, signals };
  if (length < TITLE_THRESHOLDS.warnTooShort) signals.push("short");
  if (length > TITLE_THRESHOLDS.warnTooLong) signals.push("long");
  return { classification: signals.length ? "borderline" : "acceptable", status: signals.length ? "WARNING" as const : "PASS" as const, characterCount: length, signals };
}

function seo002(evidence: SeoEvidence): AnalyzerFinding {
  const evaluated = evidence.pages.map((page) => ({ page, quality: classifyTitle(page) })).filter((item) => item.quality.status !== "NOT_APPLICABLE");
  if (evaluated.length === 0) return finding({ ruleId: "SEO-002", status: "NOT_APPLICABLE", confidence: "HIGH", applicable: false, summary: "Title-quality evaluation is not applicable because no usable titles were available.", result: {}, evidence: { thresholds: TITLE_THRESHOLDS } });

  const failures = evaluated.filter((item) => item.quality.status === "FAIL");
  const warnings = evaluated.filter((item) => item.quality.status === "WARNING");
  const homepageFailure = failures.some((item) => item.page.isHomepage);
  const ratio = affectedRatio(failures.length, evaluated.length);
  const status: AnalyzerFinding["status"] = homepageFailure || failures.length >= 2 || ratio >= 0.25 ? "FAIL" : failures.length > 0 || warnings.length > 0 ? "WARNING" : "PASS";
  const summary = status === "PASS" ? "Analyzed page titles are usable and within configured quality bands." : status === "FAIL" ? "One or more analyzed page titles have severe quality problems." : "One or more analyzed page titles fall outside preferred quality bands.";

  return finding({ ruleId: "SEO-002", status, confidence: failures.length > 0 ? "HIGH" : warnings.length > 0 ? "MEDIUM" : "HIGH", applicable: true, summary, result: { pagesEvaluated: evaluated.length, failedPages: failures.length, warningPages: warnings.length }, evidence: { thresholds: TITLE_THRESHOLDS, pages: evaluated.map(({ page, quality }) => ({ url: page.finalUrl, isHomepage: page.isHomepage, title: page.facts.title, ...quality })) } });
}

function duplicateGroups(pages: SeoPageEvidence[], selector: (page: SeoPageEvidence) => string | null) {
  const groups = new Map<string, Array<{ url: string; isHomepage: boolean; raw: string }>>();
  for (const page of pages) {
    const raw = selector(page);
    if (!raw) continue;
    const normalized = normalizeDuplicateText(raw);
    if (!normalized) continue;
    const group = groups.get(normalized) ?? [];
    group.push({ url: page.finalUrl, isHomepage: page.isHomepage, raw });
    groups.set(normalized, group);
  }
  return [...groups.entries()].filter(([, values]) => values.length > 1).map(([normalized, values]) => ({ normalized, pages: values }));
}

function seo003(evidence: SeoEvidence): AnalyzerFinding {
  const titled = evidence.pages.filter((page) => Boolean(page.facts.title));
  if (titled.length < 2) return finding({ ruleId: "SEO-003", status: "NOT_APPLICABLE", confidence: "HIGH", applicable: false, summary: "Duplicate-title comparison requires at least two titled pages.", result: { pagesEvaluated: titled.length }, evidence: {} });
  const groups = duplicateGroups(titled, (page) => page.facts.title);
  if (groups.length === 0) return finding({ ruleId: "SEO-003", status: "PASS", confidence: "HIGH", applicable: true, summary: "No exact normalized duplicate page titles were found in the analyzed sample.", result: { pagesEvaluated: titled.length, duplicateGroups: 0, duplicatePages: 0 }, evidence: { groups: [] } });
  const duplicatePages = new Set(groups.flatMap((group) => group.pages.map((page) => page.url))).size;
  const homepageDuplicated = groups.some((group) => group.pages.some((page) => page.isHomepage));
  const largestGroupSize = Math.max(...groups.map((group) => group.pages.length));
  const ratio = affectedRatio(duplicatePages, titled.length);
  const status: AnalyzerFinding["status"] = homepageDuplicated || largestGroupSize >= 3 || ratio >= 0.25 ? "FAIL" : "WARNING";
  return finding({ ruleId: "SEO-003", status, confidence: "HIGH", applicable: true, summary: status === "FAIL" ? "Duplicate titles affect important or multiple analyzed pages." : "A small duplicate-title group was found in the analyzed sample.", result: { pagesEvaluated: titled.length, duplicateGroups: groups.length, duplicatePages, largestGroupSize, homepageDuplicated }, evidence: { normalization: "lowercase_whitespace_common_punctuation", groups } });
}

function seo004(evidence: SeoEvidence): AnalyzerFinding {
  if (evidence.pages.length === 0) return finding({ ruleId: "SEO-004", status: "NOT_APPLICABLE", confidence: "HIGH", applicable: false, summary: "Meta-description inspection is not applicable because no HTML pages were available.", result: {}, evidence: { pages: [] } });
  const pageEvidence = evidence.pages.map((page) => ({ url: page.finalUrl, isHomepage: page.isHomepage, descriptionElementCount: page.facts.metaDescriptionCount, description: page.facts.metaDescription }));
  const missing = pageEvidence.filter((page) => !page.description);
  const duplicateElements = pageEvidence.filter((page) => page.descriptionElementCount > 1);
  const homepageMissing = missing.some((page) => page.isHomepage);
  const ratio = affectedRatio(missing.length, pageEvidence.length);
  let status: AnalyzerFinding["status"] = "PASS";
  if (homepageMissing || missing.length >= 2 || ratio >= 0.25) status = "FAIL";
  else if (missing.length > 0 || duplicateElements.length > 0) status = "WARNING";
  const summary = status === "PASS" ? "Every analyzed HTML page contains exactly one usable meta description." : status === "FAIL" ? (homepageMissing ? "The homepage does not contain a usable meta description." : `${missing.length} analyzed pages are missing usable meta descriptions.`) : "A secondary page is missing a description or contains duplicate description elements.";
  return finding({ ruleId: "SEO-004", status, confidence: "HIGH", applicable: true, summary, result: { pagesEvaluated: pageEvidence.length, pagesWithDescription: pageEvidence.length - missing.length, pagesMissingDescription: missing.length, homepageMissing, duplicateDescriptionElementPages: duplicateElements.length }, evidence: { pages: pageEvidence, missingRatio: ratio } });
}

function classifyDescription(page: SeoPageEvidence) {
  const description = page.facts.metaDescription;
  if (!description) return { status: "NOT_APPLICABLE" as const, classification: "not_applicable", characterCount: 0, signals: ["missing_description"] };
  const normalized = description.trim().toLowerCase();
  const length = description.length;
  const signals: string[] = [];
  if (GENERIC_DESCRIPTIONS.has(normalized)) signals.push("generic_description");
  if (length < DESCRIPTION_THRESHOLDS.failTooShort) signals.push("extremely_short");
  if (length > DESCRIPTION_THRESHOLDS.failTooLong) signals.push("extremely_long");
  if (signals.length > 0) return { status: "FAIL" as const, classification: "poor", characterCount: length, signals };
  if (length < DESCRIPTION_THRESHOLDS.warnTooShort) signals.push("short");
  if (length > DESCRIPTION_THRESHOLDS.warnTooLong) signals.push("long");
  return { status: signals.length ? "WARNING" as const : "PASS" as const, classification: signals.length ? "borderline" : "acceptable", characterCount: length, signals };
}

function seo005(evidence: SeoEvidence): AnalyzerFinding {
  const evaluated = evidence.pages.map((page) => ({ page, quality: classifyDescription(page) })).filter((item) => item.quality.status !== "NOT_APPLICABLE");
  if (evaluated.length === 0) return finding({ ruleId: "SEO-005", status: "NOT_APPLICABLE", confidence: "HIGH", applicable: false, summary: "Meta-description quality evaluation is not applicable because no descriptions were available.", result: {}, evidence: { thresholds: DESCRIPTION_THRESHOLDS } });
  const failures = evaluated.filter((item) => item.quality.status === "FAIL");
  const warnings = evaluated.filter((item) => item.quality.status === "WARNING");
  const homepageFailure = failures.some((item) => item.page.isHomepage);
  const ratio = affectedRatio(failures.length, evaluated.length);
  const status: AnalyzerFinding["status"] = homepageFailure || failures.length >= 2 || ratio >= 0.25 ? "FAIL" : failures.length > 0 || warnings.length > 0 ? "WARNING" : "PASS";
  const summary = status === "PASS" ? "Analyzed meta descriptions are usable and within configured quality bands." : status === "FAIL" ? "One or more meta descriptions have severe quality problems." : "One or more meta descriptions fall outside preferred quality bands.";
  return finding({ ruleId: "SEO-005", status, confidence: failures.length > 0 ? "HIGH" : warnings.length > 0 ? "MEDIUM" : "HIGH", applicable: true, summary, result: { pagesEvaluated: evaluated.length, failedPages: failures.length, warningPages: warnings.length }, evidence: { thresholds: DESCRIPTION_THRESHOLDS, pages: evaluated.map(({ page, quality }) => ({ url: page.finalUrl, isHomepage: page.isHomepage, description: page.facts.metaDescription, ...quality })) } });
}

function seo006(evidence: SeoEvidence): AnalyzerFinding {
  const described = evidence.pages.filter((page) => Boolean(page.facts.metaDescription));
  if (described.length < 2) return finding({ ruleId: "SEO-006", status: "NOT_APPLICABLE", confidence: "HIGH", applicable: false, summary: "Duplicate-description comparison requires at least two pages with descriptions.", result: { pagesEvaluated: described.length }, evidence: {} });
  const groups = duplicateGroups(described, (page) => page.facts.metaDescription);
  if (groups.length === 0) return finding({ ruleId: "SEO-006", status: "PASS", confidence: "HIGH", applicable: true, summary: "No exact normalized duplicate meta descriptions were found in the analyzed sample.", result: { pagesEvaluated: described.length, duplicateGroups: 0, duplicatePages: 0 }, evidence: { groups: [] } });
  const duplicatePages = new Set(groups.flatMap((group) => group.pages.map((page) => page.url))).size;
  const homepageDuplicated = groups.some((group) => group.pages.some((page) => page.isHomepage));
  const largestGroupSize = Math.max(...groups.map((group) => group.pages.length));
  const ratio = affectedRatio(duplicatePages, described.length);
  const status: AnalyzerFinding["status"] = homepageDuplicated || largestGroupSize >= 3 || ratio >= 0.25 ? "FAIL" : "WARNING";
  return finding({ ruleId: "SEO-006", status, confidence: "HIGH", applicable: true, summary: status === "FAIL" ? "Duplicate meta descriptions affect important or multiple analyzed pages." : "A small duplicate meta-description group was found in the analyzed sample.", result: { pagesEvaluated: described.length, duplicateGroups: groups.length, duplicatePages, largestGroupSize, homepageDuplicated }, evidence: { normalization: "lowercase_whitespace_common_punctuation", groups } });
}

export function runSeoBatch1(evidence: SeoEvidence): AnalyzerFinding[] {
  return [seo001(evidence), seo002(evidence), seo003(evidence), seo004(evidence), seo005(evidence), seo006(evidence)];
}
