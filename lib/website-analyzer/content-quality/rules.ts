import "server-only";

import type { AnalyzerFinding, SeoEvidence, SeoPageEvidence } from "@/lib/website-analyzer/types";

const DETECTOR_VERSION = "1.0.0";
const PLACEHOLDER = /\b(lorem ipsum|dummy text|placeholder|sample text|your (?:company|business|name) here|insert (?:text|copy|content) here)\b/i;
const UNFINISHED = /\b(coming soon|under construction|work in progress|wip|todo|tbd|to be determined|to be confirmed|content coming|update soon)\b/i;
const OFFERING = /\b(service|services|product|products|solutions|program|programs|package|packages|menu|shop|store|what we do|our work)\b/i;
const CONTACT_TOKEN = /(?:\+?\d[\d\s().-]{7,}\d)|(?:[\w.+-]+@[\w.-]+\.[A-Za-z]{2,})/g;
const LOCATION_TOKEN = /\b(?:Ottawa|Toronto|Montreal|Vancouver|Calgary|Edmonton|Winnipeg|Hamilton|Ontario|Quebec|Alberta|Canada|United States|USA|UK|London|New York|Chicago|Los Angeles)\b/gi;

function finding(
  ruleId: string,
  status: AnalyzerFinding["status"],
  summary: string,
  result: Record<string, unknown>,
  evidence: Record<string, unknown> = {},
  confidence: AnalyzerFinding["confidence"] = "HIGH",
  applicable = true,
): AnalyzerFinding {
  return { ruleId, category: "CONTENT_QUALITY", status, confidence, applicable, summary, result, evidence, detectorVersion: DETECTOR_VERSION };
}

function na(ruleId: string, summary: string): AnalyzerFinding {
  return finding(ruleId, "NOT_APPLICABLE", summary, {}, {}, "HIGH", false);
}

function unknown(ruleId: string, summary: string, evidence: Record<string, unknown> = {}): AnalyzerFinding {
  return finding(ruleId, "UNKNOWN", summary, {}, evidence, "LOW", true);
}

function pageText(page: SeoPageEvidence): string {
  return [page.facts.title, ...page.facts.h1Texts, ...page.facts.h2Texts, page.facts.bodyTextSample]
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizedText(page: SeoPageEvidence): string {
  return pageText(page).toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function similarity(a: string, b: string): number {
  const aSet = new Set(a.split(" ").filter((x) => x.length > 2));
  const bSet = new Set(b.split(" ").filter((x) => x.length > 2));
  if (!aSet.size || !bSet.size) return 0;
  let intersection = 0;
  for (const token of aSet) if (bSet.has(token)) intersection += 1;
  return intersection / (aSet.size + bSet.size - intersection);
}

function corePage(page: SeoPageEvidence): boolean {
  const url = page.finalUrl.toLowerCase();
  const title = (page.facts.title ?? "").toLowerCase();
  return page.isHomepage || /\/(services?|products?|solutions?|about|locations?|shop|programs?)(\/|$)/.test(url) || /\b(service|product|solution|about|location|program)\b/.test(title);
}

function copyrightYears(text: string): number[] {
  const years = [...text.matchAll(/(?:©|copyright)\s*(?:\d{4}\s*[-–]\s*)?(20\d{2})/gi)].map((match) => Number(match[1]));
  return years.filter((year) => Number.isFinite(year));
}

export function runContentQualityRules(evidence: SeoEvidence): AnalyzerFinding[] {
  const pages = evidence.pages;
  if (!pages.length) {
    return Array.from({ length: 18 }, (_, i) => na(`CONTENT-${String(i + 1).padStart(3, "0")}`, "Content Quality inspection is not applicable because no HTML page was available."));
  }

  const analyzed = pages.map((page) => ({ page, text: pageText(page), normalized: normalizedText(page), words: page.facts.bodyTextWordCount }));
  const core = analyzed.filter(({ page }) => corePage(page));
  const results: AnalyzerFinding[] = [];

  const emptyPages = analyzed.filter(({ words }) => words < 25);
  const thinPages = analyzed.filter(({ words }) => words >= 25 && words < 75);
  results.push(emptyPages.length
    ? finding("CONTENT-001", "FAIL", "One or more analyzed pages contain very little meaningful textual content.", { pagesEvaluated: pages.length, emptyOrMinimalPages: emptyPages.length, thinPages: thinPages.length }, { affected: emptyPages.map(({ page, words }) => ({ url: page.finalUrl, words })) })
    : thinPages.length
      ? finding("CONTENT-001", "WARNING", "Some analyzed pages contain limited textual content.", { pagesEvaluated: pages.length, emptyOrMinimalPages: 0, thinPages: thinPages.length }, { affected: thinPages.map(({ page, words }) => ({ url: page.finalUrl, words })) }, "MEDIUM")
      : finding("CONTENT-001", "PASS", "Analyzed pages contain a basic minimum of textual content.", { pagesEvaluated: pages.length, emptyOrMinimalPages: 0, thinPages: 0 }));

  const thinCore = core.filter(({ words }) => words < 100);
  results.push(!core.length
    ? na("CONTENT-002", "No core business pages were deterministically classified for thin-content inspection.")
    : thinCore.some(({ words }) => words < 50)
      ? finding("CONTENT-002", "FAIL", "At least one classified core page contains very little textual content.", { corePages: core.length, thinCorePages: thinCore.length }, { affected: thinCore.map(({ page, words }) => ({ url: page.finalUrl, words })) })
      : thinCore.length
        ? finding("CONTENT-002", "WARNING", "One or more classified core pages are textually thin.", { corePages: core.length, thinCorePages: thinCore.length }, { affected: thinCore.map(({ page, words }) => ({ url: page.finalUrl, words })) }, "MEDIUM")
        : finding("CONTENT-002", "PASS", "Classified core pages meet the current textual-content floor.", { corePages: core.length, thinCorePages: 0 }));

  results.push(unknown("CONTENT-003", "Empty or near-empty visual content sections require section-level rendered DOM evidence that the shared fact model does not yet preserve."));

  const offeringPages = analyzed.filter(({ text, page }) => OFFERING.test(text) || page.facts.links.some((link) => OFFERING.test(link.accessibleName || link.text)));
  const weakOfferings = offeringPages.filter(({ words }) => words < 90);
  results.push(!offeringPages.length
    ? na("CONTENT-004", "No core service/product offering was deterministically identified in the analyzed scope.")
    : weakOfferings.length
      ? finding("CONTENT-004", weakOfferings.length === offeringPages.length ? "FAIL" : "WARNING", "One or more detected offering pages expose limited descriptive text.", { offeringsEvaluated: offeringPages.length, insufficientDescriptions: weakOfferings.length }, { affected: weakOfferings.map(({ page, words }) => ({ url: page.finalUrl, words })) }, "MEDIUM")
      : finding("CONTENT-004", "PASS", "Detected offering pages expose descriptive textual content.", { offeringsEvaluated: offeringPages.length, insufficientDescriptions: 0 }));

  const placeholderPages = analyzed.filter(({ text }) => PLACEHOLDER.test(text));
  results.push(placeholderPages.length
    ? finding("CONTENT-005", "FAIL", "Placeholder or lorem-ipsum text was detected.", { affectedPages: placeholderPages.length }, { urls: placeholderPages.map(({ page }) => page.finalUrl) })
    : finding("CONTENT-005", "PASS", "No configured placeholder-text markers were detected.", { affectedPages: 0 }));

  const unfinishedPages = analyzed.filter(({ text }) => UNFINISHED.test(text));
  results.push(unfinishedPages.length
    ? finding("CONTENT-006", unfinishedPages.length > 1 ? "FAIL" : "WARNING", "Unfinished-content markers were detected in analyzed page text.", { affectedPages: unfinishedPages.length }, { urls: unfinishedPages.map(({ page }) => page.finalUrl) }, unfinishedPages.length > 1 ? "HIGH" : "MEDIUM")
    : finding("CONTENT-006", "PASS", "No configured unfinished-content markers were detected.", { affectedPages: 0 }));

  const placeholderLinks = pages.flatMap((page) => page.facts.links.filter((link) => !link.href || ["#", "javascript:void(0)", "javascript:;"].includes((link.href ?? "").trim().toLowerCase())).map((link) => ({ page: page.finalUrl, text: link.accessibleName || link.text, href: link.href })));
  results.push(placeholderLinks.length
    ? finding("CONTENT-007", placeholderLinks.length >= 3 ? "FAIL" : "WARNING", "Placeholder or non-destination links were detected in content/navigation evidence.", { placeholderLinks: placeholderLinks.length }, { samples: placeholderLinks.slice(0, 20) }, placeholderLinks.length >= 3 ? "HIGH" : "MEDIUM")
    : finding("CONTENT-007", "PASS", "No placeholder links were detected in analyzed link evidence.", { placeholderLinks: 0 }));

  const identitySignals = pages.map((page) => (page.facts.title ?? "").split(/[|–—-]/)[0]?.trim()).filter((x): x is string => Boolean(x && x.length >= 2));
  const normalizedIdentities = new Set(identitySignals.map((x) => x.toLowerCase().replace(/\b(inc|ltd|llc|corp|corporation|limited)\.?\b/g, "").replace(/\s+/g, " ").trim()));
  results.push(normalizedIdentities.size <= 1
    ? finding("CONTENT-008", "PASS", "No conflicting business-name signals were detected across analyzed page titles.", { identityVariants: [...normalizedIdentities] })
    : finding("CONTENT-008", normalizedIdentities.size >= 3 ? "FAIL" : "WARNING", "Multiple business-name variants were detected across analyzed page titles.", { identityVariants: [...normalizedIdentities] }, { rawSignals: identitySignals }, "MEDIUM"));

  const contactByPage = analyzed.map(({ page, text }) => ({ url: page.finalUrl, values: [...new Set(text.match(CONTACT_TOKEN) ?? [])] })).filter((x) => x.values.length);
  const contacts = new Set(contactByPage.flatMap((x) => x.values.map((v) => v.toLowerCase().replace(/\s+/g, ""))));
  results.push(!contactByPage.length
    ? na("CONTENT-009", "No contact information was detected for consistency comparison.")
    : contacts.size <= 2
      ? finding("CONTENT-009", "PASS", "Detected contact information does not show strong cross-page inconsistency.", { uniqueContactValues: contacts.size }, { contactByPage })
      : finding("CONTENT-009", "WARNING", "Multiple contact-information values were detected and may require consistency review.", { uniqueContactValues: contacts.size }, { contactByPage }, "MEDIUM"));

  const locationByPage = analyzed.map(({ page, text }) => ({ url: page.finalUrl, values: [...new Set(text.match(LOCATION_TOKEN) ?? [])] })).filter((x) => x.values.length);
  const locations = new Set(locationByPage.flatMap((x) => x.values.map((v) => v.toLowerCase())));
  results.push(!locationByPage.length
    ? na("CONTENT-010", "No configured location/service-area signals were detected for consistency comparison.")
    : locations.size <= 3
      ? finding("CONTENT-010", "PASS", "Detected location/service-area signals are not strongly contradictory.", { uniqueLocationSignals: locations.size }, { locationByPage }, "MEDIUM")
      : finding("CONTENT-010", "WARNING", "Many different location/service-area signals were detected and may require contextual review.", { uniqueLocationSignals: locations.size }, { locationByPage }, "MEDIUM"));

  const duplicatePairs: Array<{ a: string; b: string }> = [];
  const nearPairs: Array<{ a: string; b: string; similarity: number }> = [];
  for (let i = 0; i < analyzed.length; i += 1) {
    for (let j = i + 1; j < analyzed.length; j += 1) {
      if (analyzed[i].normalized.length < 80 || analyzed[j].normalized.length < 80) continue;
      if (analyzed[i].normalized === analyzed[j].normalized) duplicatePairs.push({ a: analyzed[i].page.finalUrl, b: analyzed[j].page.finalUrl });
      else {
        const score = similarity(analyzed[i].normalized, analyzed[j].normalized);
        if (score >= 0.8) nearPairs.push({ a: analyzed[i].page.finalUrl, b: analyzed[j].page.finalUrl, similarity: Number(score.toFixed(3)) });
      }
    }
  }
  results.push(pages.length < 2
    ? na("CONTENT-011", "Duplicate-content comparison requires at least two analyzed pages.")
    : duplicatePairs.length
      ? finding("CONTENT-011", "FAIL", "Exact normalized page-content duplicates were detected.", { duplicatePairs: duplicatePairs.length }, { pairs: duplicatePairs.slice(0, 20) })
      : finding("CONTENT-011", "PASS", "No exact normalized page-content duplicates were detected.", { duplicatePairs: 0 }));

  results.push(pages.length < 2
    ? na("CONTENT-012", "Near-duplicate comparison requires at least two analyzed pages.")
    : nearPairs.length
      ? finding("CONTENT-012", nearPairs.length >= 2 ? "FAIL" : "WARNING", "Near-duplicate page content was detected using token-set similarity.", { nearDuplicatePairs: nearPairs.length }, { pairs: nearPairs.slice(0, 20), method: "jaccard_token_similarity", threshold: 0.8 }, "MEDIUM")
      : finding("CONTENT-012", "PASS", "No near-duplicate page pairs crossed the configured similarity threshold.", { nearDuplicatePairs: 0 }, { method: "jaccard_token_similarity", threshold: 0.8 }, "MEDIUM"));

  results.push(pages.length < 2
    ? na("CONTENT-013", "Repeated-boilerplate comparison requires at least two analyzed pages.")
    : unknown("CONTENT-013", "Reliable boilerplate-to-unique-content ratios require block-level text segmentation that is not preserved by the current shared fact model.", { pagesEvaluated: pages.length }));

  const currentYear = new Date().getUTCFullYear();
  const copyright = analyzed.flatMap(({ page, text }) => copyrightYears(text).map((year) => ({ url: page.finalUrl, year })));
  const stale = copyright.filter(({ year }) => year < currentYear - 1);
  results.push(!copyright.length
    ? na("CONTENT-014", "No explicit copyright year was detected in sampled page text.")
    : stale.length
      ? finding("CONTENT-014", stale.some(({ year }) => year < currentYear - 3) ? "FAIL" : "WARNING", "A stale copyright year was detected.", { currentYear, staleCount: stale.length }, { stale }, "HIGH")
      : finding("CONTENT-014", "PASS", "Detected copyright year signals are current or recent.", { currentYear, years: copyright.map((x) => x.year) }));

  const outdated: Array<{ url: string; year: number; excerpt: string }> = [];
  for (const { page, text } of analyzed) {
    const matches = [...text.matchAll(/\b(20\d{2})\b/g)];
    for (const match of matches) {
      const year = Number(match[1]);
      if (year >= currentYear - 1) continue;
      const start = Math.max(0, (match.index ?? 0) - 60); const excerpt = text.slice(start, start + 140);
      if (/event|conference|sale|offer|deadline|register|registration|season|schedule|calendar|available|now|this year|annual/i.test(excerpt)) outdated.push({ url: page.finalUrl, year, excerpt });
    }
  }
  results.push(outdated.length
    ? finding("CONTENT-015", outdated.some((x) => x.year < currentYear - 2) ? "FAIL" : "WARNING", "Explicitly dated time-sensitive content appears potentially outdated.", { affectedSignals: outdated.length }, { samples: outdated.slice(0, 20), currentYear }, "MEDIUM")
    : finding("CONTENT-015", "PASS", "No configured explicitly outdated time-sensitive content markers were detected.", { affectedSignals: 0 }, { currentYear }, "MEDIUM"));

  const longSamples = analyzed.filter(({ text }) => text.split(/[.!?]\s+/).some((segment) => segment.split(/\s+/).length > 120));
  results.push(longSamples.length
    ? finding("CONTENT-016", "WARNING", "Very long unbroken textual segments were detected in sampled content.", { affectedPages: longSamples.length }, { urls: longSamples.map(({ page }) => page.finalUrl) }, "MEDIUM")
    : finding("CONTENT-016", "PASS", "No extremely long sentence-like text segments were detected in sampled content.", { affectedPages: 0 }, {}, "MEDIUM"));

  const coreWithoutDescriptiveHeading = core.filter(({ page }) => page.facts.headings.filter((h) => h.level <= 3 && h.text.trim().length >= 4).length === 0);
  results.push(!core.length
    ? na("CONTENT-017", "No core content pages were classified for heading inspection.")
    : coreWithoutDescriptiveHeading.length
      ? finding("CONTENT-017", "FAIL", "One or more classified core pages do not expose descriptive heading text.", { corePages: core.length, affectedPages: coreWithoutDescriptiveHeading.length }, { urls: coreWithoutDescriptiveHeading.map(({ page }) => page.finalUrl) })
      : finding("CONTENT-017", "PASS", "Classified core pages expose descriptive headings.", { corePages: core.length, affectedPages: 0 }));

  results.push(unknown("CONTENT-018", "Meaningful text within individual content sections requires section-level DOM segmentation that the current shared fact model does not yet preserve.", { pagesEvaluated: pages.length }));

  return results;
}
