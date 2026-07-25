import "server-only";

import type { AnalyzerFinding, CrawlabilityEvidence, LinkIntegrityEvidence, MobileUsabilityEvidence, SeoEvidence, SeoPageEvidence } from "@/lib/website-analyzer/types";

const DETECTOR_VERSION = "1.0.0";
const CTA = /\b(contact|book|booking|quote|consult|consultation|buy|shop|order|sign\s?up|register|apply|start|get started|request|schedule|reserve|donate|subscribe|trial|demo|call|email)\b/i;
const OFFERING = /\b(service|services|product|products|solutions|shop|store|menu|program|programs|classes|packages|what we do|our work)\b/i;
const CONTACT = /\b(contact|call|phone|email|location|address|visit|directions|hours)\b/i;
const TRUST = /\b(testimonial|testimonials|review|reviews|rating|ratings|certified|licensed|accredited|award|awards|trusted|clients|customers|years of experience|case stud|portfolio|member of)\b/i;
const REQUIRED_HINT = /(^|\b)(required|req)(\b|$)/i;

function f(ruleId: string, status: AnalyzerFinding["status"], summary: string, result: Record<string, unknown>, evidence: Record<string, unknown> = {}, confidence: AnalyzerFinding["confidence"] = "HIGH", applicable = true): AnalyzerFinding {
  return { ruleId, category: "CONVERSION_UX", status, confidence, applicable, summary, result, evidence, detectorVersion: DETECTOR_VERSION };
}
function na(ruleId: string, summary: string): AnalyzerFinding { return f(ruleId, "NOT_APPLICABLE", summary, {}, {}, "HIGH", false); }
function unknown(ruleId: string, summary: string, evidence: Record<string, unknown> = {}): AnalyzerFinding { return f(ruleId, "UNKNOWN", summary, {}, evidence, "LOW", true); }
function homepage(e: SeoEvidence): SeoPageEvidence | null { return e.pages.find((p) => p.isHomepage) ?? e.pages[0] ?? null; }
function text(p: SeoPageEvidence) { return [p.facts.title, ...p.facts.h1Texts, ...p.facts.h2Texts, p.facts.bodyTextSample].filter(Boolean).join(" "); }
function ctas(p: SeoPageEvidence) {
  const links = p.facts.links.map((l) => ({ kind: "link", text: l.accessibleName || l.text, href: l.href })).filter((x) => CTA.test(x.text));
  const buttons = p.facts.buttons.map((b) => ({ kind: "button", text: b.accessibleName || b.text, href: null })).filter((x) => CTA.test(x.text));
  return [...links, ...buttons];
}
function contactSignals(p: SeoPageEvidence) {
  const body = text(p);
  const hrefs = p.facts.links.map((l) => l.href ?? "");
  return { telLinks: hrefs.filter((h) => h.startsWith("tel:")), mailtoLinks: hrefs.filter((h) => h.startsWith("mailto:")), contactLinks: p.facts.links.filter((l) => CONTACT.test(l.accessibleName || l.text)), textSignal: CONTACT.test(body) };
}
function navLinks(p: SeoPageEvidence) { return p.facts.landmarks.navCount > 0 ? p.facts.links.filter((l) => (l.href ?? "").length > 0) : []; }
function sameSiteHref(base: string, href: string | null) { if (!href) return null; try { const u = new URL(href, base); return u.hostname.replace(/^www\./, "") === new URL(base).hostname.replace(/^www\./, "") ? u.toString() : null; } catch { return null; } }
function statusFromCounts(good: number, weak: number, failSummary: string, passSummary: string, warnSummary: string, ruleId: string, result: Record<string, unknown>, evidence: Record<string, unknown> = {}) { return good > 0 ? f(ruleId, "PASS", passSummary, result, evidence) : weak > 0 ? f(ruleId, "WARNING", warnSummary, result, evidence, "MEDIUM") : f(ruleId, "FAIL", failSummary, result, evidence); }

export function runConversionUxRules(input: { seo: SeoEvidence; crawlability: CrawlabilityEvidence; linkIntegrity: LinkIntegrityEvidence; mobile: MobileUsabilityEvidence | null }): AnalyzerFinding[] {
  const { seo, linkIntegrity, mobile } = input;
  const home = homepage(seo);
  if (!home) return Array.from({ length: 22 }, (_, i) => na(`CUX-${String(i + 1).padStart(3, "0")}`, "Conversion/UX inspection is not applicable because no HTML page was available."));
  const body = text(home); const homeCtas = ctas(home); const contacts = contactSignals(home); const nav = navLinks(home);
  const allLinks = home.facts.links.map((l) => ({ text: l.accessibleName || l.text, href: l.href }));
  const offeringLinks = allLinks.filter((l) => OFFERING.test(l.text));
  const identityCandidates = [home.facts.title, ...home.facts.h1Texts.slice(0, 2)].filter((x): x is string => Boolean(x && x.trim().length >= 2));
  const prominent = [...home.facts.h1Texts, ...home.facts.h2Texts.slice(0, 3)].filter((x) => x.trim().length >= 12);
  const conversionHrefSet = new Set(homeCtas.map((c) => c.href).filter(Boolean));
  const internalProbeMap = new Map(linkIntegrity.internalProbes.map((p) => [p.url, p]));

  const r: AnalyzerFinding[] = [];
  r.push(identityCandidates.length ? f("CUX-001", "PASS", "A business or organization identity candidate is exposed on the homepage.", { candidates: identityCandidates.slice(0, 5) }, { sources: ["title", "h1"] }, identityCandidates.length > 1 ? "HIGH" : "MEDIUM") : f("CUX-001", "FAIL", "No reliable business identity candidate was detected in primary homepage text.", { candidates: [] }));
  const valueCandidates = prominent.filter((x) => OFFERING.test(x) || /\b(for|help|provid|speciali[sz]|deliver|build|create|support|serv)\b/i.test(x));
  r.push(statusFromCounts(valueCandidates.length, prominent.length, "No prominent homepage statement objectively communicates an offering, audience, or outcome.", "A prominent homepage statement communicates an offering, audience, or outcome.", "Prominent introductory text exists, but its conversion meaning is ambiguous.", "CUX-002", { candidates: valueCandidates.slice(0, 5) }, { prominentText: prominent.slice(0, 8) }));
  const offeringText = OFFERING.test(body) ? 1 : 0;
  r.push(statusFromCounts(offeringText + offeringLinks.length, 0, "No core service or product offering was discoverable from homepage evidence.", "Core service or product offering evidence is discoverable from the homepage or exposed links.", "Offering evidence is weakly exposed.", "CUX-003", { homepageOfferingSignal: Boolean(offeringText), offeringLinks: offeringLinks.slice(0, 10) }));
  r.push(homeCtas.length ? f("CUX-004", "PASS", "At least one meaningful conversion CTA is present on the homepage.", { ctas: homeCtas.slice(0, 12) }) : f("CUX-004", "FAIL", "No identifiable homepage conversion CTA was detected.", { ctas: [] }));
  r.push(unknown("CUX-005", "Initial-viewport CTA visibility requires rendered geometry evidence that is not yet collected by the shared analyzer.", { detectedCtas: homeCtas.slice(0, 8) }));
  const linkedCtas = homeCtas.filter((c) => c.href); const invalidCtas = linkedCtas.filter((c) => { const abs = sameSiteHref(home.finalUrl, c.href); if (!abs) return false; const p = internalProbeMap.get(abs); return p?.reachable === false; });
  r.push(homeCtas.length === 0 ? na("CUX-006", "CTA destination validation is not applicable because no primary CTA was detected.") : invalidCtas.length ? f("CUX-006", "FAIL", "At least one detected CTA points to an unreachable internal destination.", { checked: linkedCtas.length, invalid: invalidCtas }) : linkedCtas.length ? f("CUX-006", "PASS", "Detected linked CTAs do not have known invalid internal destinations.", { checked: linkedCtas.length }) : unknown("CUX-006", "Detected CTA controls do not expose a statically inspectable destination."));
  r.push(home.facts.bodyTextWordCount < 700 ? na("CUX-007", "Repeated CTA opportunity is not applicable because the homepage is not classified as a long page.") : homeCtas.length >= 2 ? f("CUX-007", "PASS", "A long homepage exposes repeated conversion opportunities.", { wordCount: home.facts.bodyTextWordCount, ctaCount: homeCtas.length }) : f("CUX-007", homeCtas.length === 1 ? "WARNING" : "FAIL", "A long homepage exposes limited repeated conversion opportunities.", { wordCount: home.facts.bodyTextWordCount, ctaCount: homeCtas.length }));
  const contactCount = contacts.telLinks.length + contacts.mailtoLinks.length + contacts.contactLinks.length + Number(contacts.textSignal);
  r.push(contactCount ? f("CUX-008", "PASS", "At least one contact method or contact path is exposed.", contacts) : f("CUX-008", "FAIL", "No contact method or contact path was detected.", contacts));
  const globalContact = nav.some((l) => CONTACT.test(l.accessibleName || l.text)) || contacts.contactLinks.length > 0;
  r.push(globalContact ? f("CUX-009", "PASS", "A contact path is exposed through navigation or globally available link evidence.", { globalContact }) : contactCount ? f("CUX-009", "WARNING", "Contact evidence exists but no clear global navigation/footer path was established.", { globalContact }) : f("CUX-009", "FAIL", "No global contact path was detected.", { globalContact }));
  const publishedPhone = /(?:\+?\d[\d\s().-]{7,}\d)/.test(body); const publishedEmail = /[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/.test(body); const actionableMissing = (publishedPhone && contacts.telLinks.length === 0) || (publishedEmail && contacts.mailtoLinks.length === 0);
  r.push(!publishedPhone && !publishedEmail ? na("CUX-010", "No published phone number or email address was detected in sampled homepage text.") : actionableMissing ? f("CUX-010", "WARNING", "Published contact information is not fully exposed as actionable tel/mailto links.", { publishedPhone, publishedEmail, telLinks: contacts.telLinks.length, mailtoLinks: contacts.mailtoLinks.length }) : f("CUX-010", "PASS", "Published phone/email contact information is exposed through actionable links.", { publishedPhone, publishedEmail }));
  r.push(home.facts.landmarks.navCount > 0 && nav.length > 0 ? f("CUX-011", "PASS", "Primary semantic navigation is present.", { navCount: home.facts.landmarks.navCount, linkCount: nav.length }) : home.facts.links.length >= 3 ? f("CUX-011", "WARNING", "Navigation-like links exist but semantic primary navigation was not established.", { navCount: home.facts.landmarks.navCount }) : f("CUX-011", "FAIL", "No primary navigation structure was detected.", { navCount: home.facts.landmarks.navCount }));
  const conversionNav = nav.filter((l) => CTA.test(l.accessibleName || l.text) || CONTACT.test(l.accessibleName || l.text));
  r.push(conversionNav.length ? f("CUX-012", "PASS", "A key conversion destination is exposed within first-level navigation evidence.", { destinations: conversionNav.slice(0, 10) }) : homeCtas.length ? f("CUX-012", "WARNING", "Conversion actions exist, but a first-level navigation conversion destination was not established.", { ctaCount: homeCtas.length }) : f("CUX-012", "FAIL", "No limited-depth conversion destination was detected.", {}));
  const brokenConversion = linkIntegrity.internalProbes.filter((p) => p.reachable === false && [...conversionHrefSet].some((h) => sameSiteHref(home.finalUrl, h) === p.url));
  r.push(brokenConversion.length ? f("CUX-013", "FAIL", "A detected conversion path terminates at an unreachable internal destination.", { brokenConversion }) : f("CUX-013", "PASS", "No known dead-end conversion destination was found in probed internal links.", { probedInternalLinks: linkIntegrity.internalProbes.length }));
  const ctaMentionsForm = homeCtas.some((c) => /contact|quote|consult|apply|register|sign|request|book|schedule/i.test(c.text));
  r.push(!ctaMentionsForm ? na("CUX-014", "No CTA requiring a form was deterministically identified.") : home.facts.forms.length ? f("CUX-014", "PASS", "A form is present where a form-oriented conversion CTA is exposed on the homepage.", { formCount: home.facts.forms.length }) : f("CUX-014", "WARNING", "A form-oriented CTA exists but no homepage form is present; the form may be on its destination page.", { formCount: 0 }));
  const forms = home.facts.forms; const fieldCounts = forms.map((form) => form.controls.filter((c) => c.tag !== "button" && c.type !== "submit").length); const maxFields = Math.max(0, ...fieldCounts);
  r.push(!forms.length ? na("CUX-015", "No homepage form was available for field-count inspection.") : f("CUX-015", maxFields <= 7 ? "PASS" : maxFields <= 12 ? "WARNING" : "FAIL", "Conversion form field count was measured objectively.", { formCount: forms.length, fieldCounts, maxFields }));
  const requiredCount = forms.flatMap((form) => form.controls).filter((c) => REQUIRED_HINT.test(`${c.name ?? ""} ${c.ariaLabel ?? ""} ${c.placeholder ?? ""}`)).length;
  r.push(!forms.length ? na("CUX-016", "No homepage form was available for required-field inspection.") : unknown("CUX-016", "Required-field burden cannot be determined reliably because the shared form fact model does not yet preserve HTML required attributes.", { heuristicRequiredHints: requiredCount }));
  const submitMissing = forms.filter((form) => form.submitControlCount === 0).length;
  r.push(!forms.length ? na("CUX-017", "No homepage form was available for submit-control inspection.") : submitMissing === 0 ? f("CUX-017", "PASS", "Every detected homepage form exposes a submit control.", { formCount: forms.length }) : f("CUX-017", "FAIL", "At least one detected homepage form has no submit control.", { formCount: forms.length, formsMissingSubmit: submitMissing }));
  const trustSignals = [TRUST.test(body), home.facts.jsonLdBlockCount > 0].filter(Boolean).length;
  r.push(trustSignals ? f("CUX-018", "PASS", "At least one objective trust signal was detected.", { textualTrustSignal: TRUST.test(body), structuredDataPresent: home.facts.jsonLdBlockCount > 0 }) : f("CUX-018", "WARNING", "No configured trust-signal pattern was detected in sampled homepage evidence.", { textualTrustSignal: false, structuredDataPresent: false }, {}, "MEDIUM"));
  const locationSignal = /\b(address|location|located|visit us|hours)\b/i.test(body);
  r.push(contactCount || locationSignal ? f("CUX-019", "PASS", "Business contact or location information is present in homepage evidence.", { contactSignal: Boolean(contactCount), locationSignal }) : f("CUX-019", "WARNING", "No business contact or location information was detected in sampled homepage evidence.", { contactSignal: false, locationSignal: false }, {}, "MEDIUM"));
  r.push(!mobile ? unknown("CUX-020", "Mobile conversion availability cannot be inspected without mobile evidence.") : homeCtas.length === 0 ? f("CUX-020", "FAIL", "No primary conversion action was detected for mobile availability assessment.", { ctaCount: 0 }) : unknown("CUX-020", "A CTA exists, but rendered mobile visibility requires browser geometry evidence.", { ctaCount: homeCtas.length, staticMobileEvidence: mobile.essentialContent }));
  r.push(!mobile ? unknown("CUX-021", "Mobile navigation conversion exposure cannot be inspected without mobile evidence.") : conversionNav.length ? f("CUX-021", "PASS", "A key conversion destination is present in navigation evidence used by the mobile analyzer.", { destinations: conversionNav.slice(0, 10) }) : unknown("CUX-021", "Rendered mobile navigation interaction is required to determine whether hidden/toggled navigation exposes a conversion destination.", { navigation: mobile.navigation }));
  r.push(!forms.length ? na("CUX-022", "No homepage conversion form was available for mobile usability inspection.") : unknown("CUX-022", "Form usability at a mobile viewport requires rendered geometry and interaction evidence not yet collected by the shared analyzer.", { formCount: forms.length, viewport: mobile?.viewport ?? null }));
  return r;
}
