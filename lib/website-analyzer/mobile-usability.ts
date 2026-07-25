import "server-only";

import { load } from "cheerio";
import type { MobileUsabilityEvidence, TouchTargetEvidence } from "@/lib/website-analyzer/types";

const MOBILE_VIEWPORT_WIDTH = 390;
const TOUCH_TARGET_MIN_PX = 44;
const RESPONSIVE_STYLESHEET_HINTS = ["bootstrap", "tailwind", "foundation", "bulma", "responsive", "mobile"];

function parsePixelValue(value: string | undefined): number | null {
  if (!value) return null;
  const match = value.trim().match(/^([0-9]+(?:\.[0-9]+)?)px$/i);
  return match ? Number(match[1]) : null;
}

function inlineStyleProperty(style: string | undefined, property: string): string | undefined {
  if (!style) return undefined;
  const declaration = style
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.toLowerCase().startsWith(`${property.toLowerCase()}:`));
  return declaration?.slice(declaration.indexOf(":") + 1).trim();
}

function explicitDimension(attributeValue: string | undefined, styleValue: string | undefined): number | null {
  const fromAttribute = attributeValue && /^\d+(?:\.\d+)?$/.test(attributeValue.trim()) ? Number(attributeValue.trim()) : null;
  return fromAttribute ?? parsePixelValue(styleValue);
}

function isStaticallyHidden(hiddenAttribute: string | undefined, ariaHidden: string | undefined, style: string | undefined): boolean {
  if (hiddenAttribute !== undefined) return true;
  if ((ariaHidden ?? "").toLowerCase() === "true") return true;
  const normalized = (style ?? "").replace(/\s+/g, "").toLowerCase();
  return normalized.includes("display:none") || normalized.includes("visibility:hidden");
}

export function collectMobileUsabilityEvidence(html: string): MobileUsabilityEvidence {
  const $ = load(html);
  const viewportContent = $('meta[name="viewport" i]').first().attr("content")?.trim() ?? null;
  const normalizedViewport = (viewportContent ?? "").replace(/\s+/g, "").toLowerCase();

  const styleText = $("style")
    .map((_, element) => $(element).text())
    .get()
    .join("\n");
  const mediaQueryCount = (styleText.match(/@media\s*\(/gi) ?? []).length;

  const responsiveStylesheetHints = new Set<string>();
  $('link[rel~="stylesheet" i][href]').each((_, element) => {
    const href = $(element).attr("href") ?? "";
    const normalized = href.toLowerCase();
    if (RESPONSIVE_STYLESHEET_HINTS.some((hint) => normalized.includes(hint))) responsiveStylesheetHints.add(href);
  });

  const responsiveImageCount = $("img[srcset], img[sizes], picture source[srcset]").length;
  let fixedWidthOverflowCandidates = 0;
  $("body *").each((_, element) => {
    const node = $(element);
    const width = explicitDimension(node.attr("width"), inlineStyleProperty(node.attr("style"), "width"));
    if (width !== null && width > MOBILE_VIEWPORT_WIDTH) fixedWidthOverflowCandidates += 1;
  });

  const navElements = $('nav, [role="navigation"]');
  const navLinkCount = navElements.find("a[href]").length;
  const toggleCandidates = $('button[aria-controls], button[aria-expanded], [role="button"][aria-controls], [class*="menu" i], [class*="hamburger" i], [id*="menu" i]')
    .filter((_, element) => {
      const tag = element.tagName?.toLowerCase();
      return tag === "button" || $(element).attr("role") === "button";
    });

  const essentialSelector = "main, h1, a[href], button, input[type=submit], input[type=button]";
  let staticallyHiddenEssentialCount = 0;
  $(essentialSelector).each((_, element) => {
    const node = $(element);
    if (isStaticallyHidden(node.attr("hidden"), node.attr("aria-hidden"), node.attr("style"))) staticallyHiddenEssentialCount += 1;
  });

  const targetSamples: TouchTargetEvidence[] = [];
  let explicitlyMeasured = 0;
  let explicitTooSmallCount = 0;
  $("a[href], button, input[type=submit], input[type=button], [role=button]").each((index, element) => {
    const node = $(element);
    const width = explicitDimension(node.attr("width"), inlineStyleProperty(node.attr("style"), "width"));
    const height = explicitDimension(node.attr("height"), inlineStyleProperty(node.attr("style"), "height"));
    const measured = width !== null || height !== null;
    const tooSmall = measured
      ? (width !== null && width < TOUCH_TARGET_MIN_PX) || (height !== null && height < TOUCH_TARGET_MIN_PX)
      : null;
    if (measured) explicitlyMeasured += 1;
    if (tooSmall === true) explicitTooSmallCount += 1;
    if (targetSamples.length < 25) {
      targetSamples.push({ selector: `${element.tagName?.toLowerCase() ?? "target"}:nth(${index + 1})`, explicitWidthPx: width, explicitHeightPx: height, tooSmall });
    }
  });

  return {
    method: "STATIC_HTML_CSS",
    mobileViewportWidthPx: MOBILE_VIEWPORT_WIDTH,
    viewport: {
      present: viewportContent !== null,
      content: viewportContent,
      hasDeviceWidth: normalizedViewport.includes("width=device-width"),
      hasInitialScale: /initial-scale=(1(?:\.0+)?)\b/.test(normalizedViewport),
      userScalableDisabled: normalizedViewport.includes("user-scalable=no"),
      maximumScaleRestricted: /maximum-scale=(?:0|1(?:\.0+)?)\b/.test(normalizedViewport),
    },
    responsiveSignals: {
      mediaQueryCount,
      responsiveStylesheetHints: [...responsiveStylesheetHints],
      responsiveImageCount,
      fixedWidthOverflowCandidates,
    },
    navigation: {
      navElementCount: navElements.length,
      navLinkCount,
      toggleCandidateCount: toggleCandidates.length,
      hasSemanticNavigation: navElements.length > 0,
    },
    essentialContent: {
      mainCount: $("main").length,
      h1Count: $("h1").length,
      ctaCount: $("a[href], button, input[type=submit], input[type=button]").length,
      staticallyHiddenEssentialCount,
    },
    touchTargets: {
      totalCandidates: $("a[href], button, input[type=submit], input[type=button], [role=button]").length,
      explicitlyMeasured,
      explicitTooSmallCount,
      samples: targetSamples,
    },
    limitations: [
      "Evidence is derived from static HTML and inline/embedded CSS only.",
      "External stylesheets, JavaScript layout changes, actual viewport geometry, overlap, and runtime visibility are not rendered in this batch.",
      "Rules that require rendered geometry return UNKNOWN rather than inventing a conclusion when static evidence is insufficient.",
    ],
  };
}
