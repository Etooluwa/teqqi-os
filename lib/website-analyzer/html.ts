import "server-only";

import { load, type CheerioAPI } from "cheerio";

import type {
  ButtonFact,
  FormControlFact,
  FormFact,
  HeadingFact,
  ImageFact,
  LinkFact,
  PageFacts,
} from "@/lib/website-analyzer/types";

function normalizeText(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function nullableAttribute(value: string | undefined): string | null {
  const normalized = normalizeText(value);
  return normalized || null;
}

function splitTokens(value: string | undefined): string[] {
  return normalizeText(value)
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
}

function textFromLabelledBy($: CheerioAPI, ids: string | undefined): string {
  if (!ids) return "";

  return ids
    .split(/\s+/)
    .filter(Boolean)
    .map((id) => normalizeText($(documentIdSelector(id)).text()))
    .filter(Boolean)
    .join(" ");
}

function documentIdSelector(id: string): string {
  // CSS.escape is not available in every Node runtime. Attribute selectors avoid
  // treating punctuation in an element ID as CSS syntax.
  const escaped = id.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `[id="${escaped}"]`;
}

function associatedLabelText($: CheerioAPI, element: Parameters<CheerioAPI>[0]): string {
  const node = $(element);
  const id = node.attr("id");
  const wrappingLabel = normalizeText(node.closest("label").first().text());
  if (wrappingLabel) return wrappingLabel;

  if (!id) return "";
  const escaped = id.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return normalizeText($(`label[for="${escaped}"]`).first().text());
}

function controlAccessibleName($: CheerioAPI, element: Parameters<CheerioAPI>[0]): string {
  const node = $(element);
  const ariaLabel = normalizeText(node.attr("aria-label"));
  if (ariaLabel) return ariaLabel;

  const labelledBy = textFromLabelledBy($, node.attr("aria-labelledby"));
  if (labelledBy) return labelledBy;

  const label = associatedLabelText($, element);
  if (label) return label;

  if (node.is("button")) return normalizeText(node.text());

  const type = normalizeText(node.attr("type")).toLowerCase();
  if (node.is("input") && ["submit", "button", "reset"].includes(type)) {
    return normalizeText(node.attr("value"));
  }

  return "";
}

function extractHeadings($: CheerioAPI): HeadingFact[] {
  const headings: HeadingFact[] = [];

  $("h1,h2,h3,h4,h5,h6").each((_, element) => {
    const tagName = element.type === "tag" ? element.name.toLowerCase() : "";
    const level = Number(tagName.slice(1));
    if (level < 1 || level > 6) return;

    headings.push({
      level: level as HeadingFact["level"],
      text: normalizeText($(element).text()),
      id: nullableAttribute($(element).attr("id")),
    });
  });

  return headings;
}

function extractLinks($: CheerioAPI): LinkFact[] {
  const links: LinkFact[] = [];

  $("a").each((_, element) => {
    const node = $(element);
    const text = normalizeText(node.text());
    const ariaLabel = nullableAttribute(node.attr("aria-label"));
    const labelledByText = textFromLabelledBy($, node.attr("aria-labelledby"));
    const childImageAlt = normalizeText(
      node
        .find("img[alt]")
        .map((__, image) => $(image).attr("alt") ?? "")
        .get()
        .join(" "),
    );

    links.push({
      href: nullableAttribute(node.attr("href")),
      text,
      rel: splitTokens(node.attr("rel")),
      target: nullableAttribute(node.attr("target")),
      ariaLabel,
      accessibleName: ariaLabel ?? labelledByText || text || childImageAlt,
    });
  });

  return links;
}

function extractImages($: CheerioAPI): ImageFact[] {
  const images: ImageFact[] = [];

  $("img").each((_, element) => {
    const node = $(element);
    const altValue = node.attr("alt");

    images.push({
      src: nullableAttribute(node.attr("src")),
      alt: altValue === undefined ? null : normalizeText(altValue),
      hasAltAttribute: altValue !== undefined,
      width: nullableAttribute(node.attr("width")),
      height: nullableAttribute(node.attr("height")),
    });
  });

  return images;
}

function extractButtons($: CheerioAPI): ButtonFact[] {
  const buttons: ButtonFact[] = [];

  $("button").each((_, element) => {
    const node = $(element);
    buttons.push({
      text: normalizeText(node.text()),
      type: nullableAttribute(node.attr("type")),
      ariaLabel: nullableAttribute(node.attr("aria-label")),
      accessibleName: controlAccessibleName($, element),
    });
  });

  return buttons;
}

function extractFormControl($: CheerioAPI, element: Parameters<CheerioAPI>[0]): FormControlFact {
  const node = $(element);
  const tag = (element.type === "tag" ? element.name.toLowerCase() : "input") as FormControlFact["tag"];
  const associatedLabel = associatedLabelText($, element);

  return {
    tag,
    type: tag === "input" || tag === "button" ? nullableAttribute(node.attr("type")) : null,
    id: nullableAttribute(node.attr("id")),
    name: nullableAttribute(node.attr("name")),
    ariaLabel: nullableAttribute(node.attr("aria-label")),
    ariaLabelledBy: nullableAttribute(node.attr("aria-labelledby")),
    placeholder: nullableAttribute(node.attr("placeholder")),
    hasAssociatedLabel: Boolean(associatedLabel),
    accessibleName: controlAccessibleName($, element),
  };
}

function isSubmitControl(control: FormControlFact): boolean {
  const type = (control.type ?? "").toLowerCase();
  if (control.tag === "button") return !type || type === "submit";
  return control.tag === "input" && (type === "submit" || type === "image");
}

function extractForms($: CheerioAPI): FormFact[] {
  const forms: FormFact[] = [];

  $("form").each((_, formElement) => {
    const form = $(formElement);
    const controls: FormControlFact[] = [];

    form.find("input,select,textarea,button").each((__, control) => {
      controls.push(extractFormControl($, control));
    });

    forms.push({
      action: nullableAttribute(form.attr("action")),
      method: nullableAttribute(form.attr("method")),
      id: nullableAttribute(form.attr("id")),
      controls,
      submitControlCount: controls.filter(isSubmitControl).length,
    });
  });

  return forms;
}

function extractJsonLdBlocks($: CheerioAPI): string[] {
  const blocks: string[] = [];

  $('script[type="application/ld+json"]').each((_, element) => {
    const value = $(element).html();
    if (value !== null) blocks.push(value.trim());
  });

  return blocks;
}

function wordCount(value: string): number {
  const normalized = normalizeText(value);
  return normalized ? normalized.split(/\s+/).length : 0;
}

export function extractPageFacts(html: string): PageFacts {
  // Cheerio uses parse5 for HTML parsing, giving browser-like HTML5 tree
  // construction and error recovery instead of regex-based tag matching.
  const $ = load(html);

  const headings = extractHeadings($);
  const jsonLdBlocks = extractJsonLdBlocks($);
  const bodyText = normalizeText($("body").text());
  const titleElements = $("title");
  const descriptionElements = $('meta[name]').filter((_, element) =>
    ($(element).attr("name") ?? "").trim().toLowerCase() === "description",
  );
  const robotsElements = $('meta[name]').filter((_, element) =>
    ($(element).attr("name") ?? "").trim().toLowerCase() === "robots",
  );
  const canonicalElements = $('link[rel]').filter((_, element) =>
    splitTokens($(element).attr("rel")).includes("canonical"),
  );
  const viewportElements = $('meta[name]').filter((_, element) =>
    ($(element).attr("name") ?? "").trim().toLowerCase() === "viewport",
  );

  return {
    parser: "CHEERIO_PARSE5",
    document: {
      hasHtml: $("html").length > 0,
      hasHead: $("head").length > 0,
      hasBody: $("body").length > 0,
    },
    title: titleElements.length ? normalizeText(titleElements.first().text()) || null : null,
    titleCount: titleElements.length,
    metaDescription: nullableAttribute(descriptionElements.first().attr("content")),
    metaDescriptionCount: descriptionElements.length,
    metaRobots: nullableAttribute(robotsElements.first().attr("content")),
    canonicalUrl: nullableAttribute(canonicalElements.first().attr("href")),
    canonicalCount: canonicalElements.length,
    htmlLang: nullableAttribute($("html").first().attr("lang")),
    viewportContent: nullableAttribute(viewportElements.first().attr("content")),
    headings,
    h1Texts: headings.filter((heading) => heading.level === 1).map((heading) => heading.text),
    h2Texts: headings.filter((heading) => heading.level === 2).map((heading) => heading.text),
    h3Texts: headings.filter((heading) => heading.level === 3).map((heading) => heading.text),
    links: extractLinks($),
    images: extractImages($),
    buttons: extractButtons($),
    forms: extractForms($),
    landmarks: {
      headerCount: $("header").length,
      navCount: $("nav").length,
      mainCount: $("main").length,
      footerCount: $("footer").length,
      asideCount: $("aside").length,
    },
    jsonLdBlocks,
    jsonLdBlockCount: jsonLdBlocks.length,
    scriptCount: $("script").length,
    iframeCount: $("iframe").length,
    bodyTextCharacterCount: bodyText.length,
    bodyTextWordCount: wordCount(bodyText),
  };
}
