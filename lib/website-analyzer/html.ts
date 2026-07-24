import "server-only";

import type { PageFacts } from "@/lib/website-analyzer/types";

function decodeBasicEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function stripTags(value: string): string {
  return decodeBasicEntities(value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim());
}

function getAttribute(tag: string, name: string): string | null {
  const pattern = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i");
  const match = tag.match(pattern);
  return decodeBasicEntities(match?.[1] ?? match?.[2] ?? match?.[3] ?? "") || null;
}

function findFirstTagContent(html: string, tagName: string): string | null {
  const match = html.match(new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i"));
  return match ? stripTags(match[1]) : null;
}

function findAllTagContents(html: string, tagName: string): string[] {
  const values: string[] = [];
  const pattern = new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "gi");
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html)) !== null) values.push(stripTags(match[1]));
  return values;
}

function findMetaContent(html: string, name: string): string | null {
  const tags = html.match(/<meta\b[^>]*>/gi) ?? [];
  for (const tag of tags) {
    if ((getAttribute(tag, "name") ?? "").toLowerCase() === name.toLowerCase()) {
      return getAttribute(tag, "content");
    }
  }
  return null;
}

function findCanonical(html: string): string | null {
  const tags = html.match(/<link\b[^>]*>/gi) ?? [];
  for (const tag of tags) {
    const rel = (getAttribute(tag, "rel") ?? "").toLowerCase().split(/\s+/);
    if (rel.includes("canonical")) return getAttribute(tag, "href");
  }
  return null;
}

function findHtmlLang(html: string): string | null {
  const tag = html.match(/<html\b[^>]*>/i)?.[0];
  return tag ? getAttribute(tag, "lang") : null;
}

export function extractPageFacts(html: string): PageFacts {
  const links = (html.match(/<a\b[^>]*>[\s\S]*?<\/a>/gi) ?? []).map((tag) => ({
    href: getAttribute(tag.match(/<a\b[^>]*>/i)?.[0] ?? tag, "href"),
    text: stripTags(tag),
  }));

  const images = (html.match(/<img\b[^>]*>/gi) ?? []).map((tag) => ({
    src: getAttribute(tag, "src"),
    alt: getAttribute(tag, "alt"),
  }));

  const buttons = (html.match(/<button\b[^>]*>[\s\S]*?<\/button>/gi) ?? []).map((tag) => ({
    text: stripTags(tag),
  }));

  const forms = (html.match(/<form\b[^>]*>[\s\S]*?<\/form>/gi) ?? []).map((formHtml) => {
    const openingTag = formHtml.match(/<form\b[^>]*>/i)?.[0] ?? "";
    const inputTypes = (formHtml.match(/<input\b[^>]*>/gi) ?? []).map(
      (input) => (getAttribute(input, "type") ?? "text").toLowerCase(),
    );
    return {
      action: getAttribute(openingTag, "action"),
      method: getAttribute(openingTag, "method"),
      inputTypes,
    };
  });

  const jsonLdBlocks = (html.match(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi) ?? [])
    .map((script) => script.replace(/^<script\b[^>]*>/i, "").replace(/<\/script>$/i, "").trim());

  return {
    title: findFirstTagContent(html, "title"),
    metaDescription: findMetaContent(html, "description"),
    canonicalUrl: findCanonical(html),
    htmlLang: findHtmlLang(html),
    viewportContent: findMetaContent(html, "viewport"),
    h1Texts: findAllTagContents(html, "h1"),
    h2Texts: findAllTagContents(html, "h2"),
    h3Texts: findAllTagContents(html, "h3"),
    links,
    images,
    buttons,
    forms,
    jsonLdBlocks,
  };
}