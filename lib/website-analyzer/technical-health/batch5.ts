import "server-only";

import type { AnalyzerFinding, LinkIntegrityEvidence, PageFacts } from "@/lib/website-analyzer/types";

const DETECTOR_VERSION = "1.0.0";
function finding(input: Omit<AnalyzerFinding, "category" | "detectorVersion">): AnalyzerFinding { return { ...input, category: "TECHNICAL_HEALTH", detectorVersion: DETECTOR_VERSION }; }

function tech021(e: LinkIntegrityEvidence, facts: PageFacts | null): AnalyzerFinding {
  if (!facts) return finding({ ruleId: "TECH-021", status: "NOT_APPLICABLE", confidence: "HIGH", applicable: false, summary: "Internal link integrity is not applicable because the homepage was not confirmed as HTML.", result: {}, evidence: { internalProbes: e.internalProbes } });
  const conclusive = e.internalProbes.filter((p) => p.reachable !== null);
  const broken = conclusive.filter((p) => p.reachable === false);
  const unknown = e.internalProbes.length - conclusive.length;
  if (conclusive.length === 0 && e.internalLinks.length > 0) return finding({ ruleId: "TECH-021", status: "UNKNOWN", confidence: "LOW", applicable: true, summary: "Internal links were found, but none were sampled conclusively within the crawl limit.", result: { checkedCount: 0, brokenCount: 0, unknownCount: unknown }, evidence: { internalProbes: e.internalProbes } });
  if (broken.length === 0) return finding({ ruleId: "TECH-021", status: unknown > 0 ? "WARNING" : "PASS", confidence: unknown > 0 ? "MEDIUM" : "HIGH", applicable: true, summary: unknown > 0 ? "No sampled internal links were broken, but some links were outside the bounded crawl sample." : "No broken internal links were found in the sampled crawl.", result: { checkedCount: conclusive.length, brokenCount: 0, unknownCount: unknown }, evidence: { internalProbes: e.internalProbes } });
  return finding({ ruleId: "TECH-021", status: broken.length >= 3 ? "FAIL" : "WARNING", confidence: "HIGH", applicable: true, summary: `${broken.length} broken internal link${broken.length === 1 ? " was" : "s were"} found in the sampled crawl.`, result: { checkedCount: conclusive.length, brokenCount: broken.length, unknownCount: unknown }, evidence: { brokenLinks: broken, internalProbes: e.internalProbes } });
}

function tech022(e: LinkIntegrityEvidence, facts: PageFacts | null): AnalyzerFinding {
  if (!facts) return finding({ ruleId: "TECH-022", status: "NOT_APPLICABLE", confidence: "HIGH", applicable: false, summary: "External link integrity is not applicable because the homepage was not confirmed as HTML.", result: {}, evidence: { externalProbes: e.externalProbes } });
  if (e.externalLinks.length === 0) return finding({ ruleId: "TECH-022", status: "PASS", confidence: "HIGH", applicable: true, summary: "No external HTTP or HTTPS links were present in the inspected link set.", result: { externalLinkCount: 0, checkedCount: 0, brokenCount: 0 }, evidence: { externalProbes: [] } });
  const conclusive = e.externalProbes.filter((p) => p.reachable !== null);
  const broken = conclusive.filter((p) => p.reachable === false);
  const unknown = e.externalProbes.length - conclusive.length;
  if (conclusive.length === 0) return finding({ ruleId: "TECH-022", status: "UNKNOWN", confidence: "LOW", applicable: true, summary: "External links were found, but availability could not be determined reliably.", result: { externalLinkCount: e.externalLinks.length, checkedCount: 0, brokenCount: 0 }, evidence: { externalProbes: e.externalProbes } });
  const incomplete = unknown > 0 || e.externalProbeTruncated;
  if (broken.length === 0) return finding({ ruleId: "TECH-022", status: incomplete ? "WARNING" : "PASS", confidence: incomplete ? "MEDIUM" : "HIGH", applicable: true, summary: incomplete ? "No checked external links were broken, but the external-link sample was incomplete." : "All checked external links were available.", result: { externalLinkCount: e.externalLinks.length, checkedCount: conclusive.length, brokenCount: 0, truncated: e.externalProbeTruncated }, evidence: { externalProbes: e.externalProbes } });
  return finding({ ruleId: "TECH-022", status: broken.length === conclusive.length && !incomplete ? "FAIL" : "WARNING", confidence: incomplete ? "MEDIUM" : "HIGH", applicable: true, summary: `${broken.length} checked external link${broken.length === 1 ? " was" : "s were"} unavailable.`, result: { externalLinkCount: e.externalLinks.length, checkedCount: conclusive.length, brokenCount: broken.length, truncated: e.externalProbeTruncated }, evidence: { brokenLinks: broken, externalProbes: e.externalProbes } });
}

function tech023(e: LinkIntegrityEvidence, facts: PageFacts | null): AnalyzerFinding {
  if (!facts) return finding({ ruleId: "TECH-023", status: "NOT_APPLICABLE", confidence: "HIGH", applicable: false, summary: "Link markup inspection is not applicable because the homepage was not confirmed as HTML.", result: {}, evidence: { invalidLinks: e.invalidLinks } });
  if (e.invalidLinks.length === 0) return finding({ ruleId: "TECH-023", status: "PASS", confidence: "HIGH", applicable: true, summary: "No empty, missing or malformed link destinations were found in the inspected pages.", result: { invalidLinkCount: 0 }, evidence: { invalidLinks: [] } });
  return finding({ ruleId: "TECH-023", status: "WARNING", confidence: "HIGH", applicable: true, summary: `${e.invalidLinks.length} empty, missing or malformed link destination${e.invalidLinks.length === 1 ? " was" : "s were"} found.`, result: { invalidLinkCount: e.invalidLinks.length }, evidence: { invalidLinks: e.invalidLinks } });
}

function tech024(e: LinkIntegrityEvidence, facts: PageFacts | null): AnalyzerFinding {
  if (!facts) return finding({ ruleId: "TECH-024", status: "NOT_APPLICABLE", confidence: "HIGH", applicable: false, summary: "Link protocol inspection is not applicable because the homepage was not confirmed as HTML.", result: {}, evidence: { unsupportedProtocols: e.unsupportedProtocols } });
  if (e.unsupportedProtocols.length === 0) return finding({ ruleId: "TECH-024", status: "PASS", confidence: "HIGH", applicable: true, summary: "All inspected link protocols are supported web, email or telephone link schemes.", result: { unsupportedProtocolCount: 0 }, evidence: { unsupportedProtocols: [] } });
  return finding({ ruleId: "TECH-024", status: "WARNING", confidence: "HIGH", applicable: true, summary: `${e.unsupportedProtocols.length} link${e.unsupportedProtocols.length === 1 ? " uses" : "s use"} an unsupported or unsafe protocol.`, result: { unsupportedProtocolCount: e.unsupportedProtocols.length }, evidence: { unsupportedProtocols: e.unsupportedProtocols } });
}

export function runTechnicalHealthBatch5(input: { evidence: LinkIntegrityEvidence; homepageFacts: PageFacts | null }): AnalyzerFinding[] {
  return [tech021(input.evidence, input.homepageFacts), tech022(input.evidence, input.homepageFacts), tech023(input.evidence, input.homepageFacts), tech024(input.evidence, input.homepageFacts)];
}
