import "server-only";

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

import { WebsiteAnalyzerError } from "@/lib/website-analyzer/errors";
import type { ValidatedWebsiteTarget } from "@/lib/website-analyzer/types";

const LOCAL_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "ip6-localhost",
  "ip6-loopback",
]);

function normalizeHostname(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/^\[/, "").replace(/\]$/, "").replace(/\.$/, "");
}

function isUnsafeHostname(hostname: string): boolean {
  const normalized = normalizeHostname(hostname);
  return (
    LOCAL_HOSTNAMES.has(normalized) ||
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".local") ||
    normalized.endsWith(".internal")
  );
}

function ipv4ToNumber(address: string): number {
  return address
    .split(".")
    .map(Number)
    .reduce((value, octet) => (value << 8) + octet, 0) >>> 0;
}

function ipv4InCidr(address: string, network: string, prefixLength: number): boolean {
  const value = ipv4ToNumber(address);
  const base = ipv4ToNumber(network);
  const mask = prefixLength === 0 ? 0 : (0xffffffff << (32 - prefixLength)) >>> 0;
  return (value & mask) === (base & mask);
}

function isUnsafeIpv4(address: string): boolean {
  const blockedRanges: Array<[string, number]> = [
    ["0.0.0.0", 8],
    ["10.0.0.0", 8],
    ["100.64.0.0", 10],
    ["127.0.0.0", 8],
    ["169.254.0.0", 16],
    ["172.16.0.0", 12],
    ["192.0.0.0", 24],
    ["192.0.2.0", 24],
    ["192.168.0.0", 16],
    ["198.18.0.0", 15],
    ["198.51.100.0", 24],
    ["203.0.113.0", 24],
    ["224.0.0.0", 4],
    ["240.0.0.0", 4],
  ];

  return blockedRanges.some(([network, prefix]) => ipv4InCidr(address, network, prefix));
}

function isUnsafeIpv6(address: string): boolean {
  const normalized = normalizeHostname(address);

  if (normalized === "::" || normalized === "::1") return true;
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
  if (/^fe[89ab]/.test(normalized)) return true;
  if (normalized.startsWith("ff")) return true;
  if (normalized.startsWith("2001:db8:")) return true;

  const mappedIpv4 = normalized.match(/::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i)?.[1];
  if (mappedIpv4 && isUnsafeIpv4(mappedIpv4)) return true;

  return false;
}

export function isUnsafeIpAddress(address: string): boolean {
  const version = isIP(normalizeHostname(address));
  if (version === 4) return isUnsafeIpv4(normalizeHostname(address));
  if (version === 6) return isUnsafeIpv6(normalizeHostname(address));
  return true;
}

function parseWebsiteUrl(rawUrl: string): URL {
  const input = rawUrl.trim();
  if (!input) {
    throw new WebsiteAnalyzerError("INVALID_URL", "A website URL is required.");
  }

  const hasScheme = /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(input);
  if (hasScheme && !/^https?:/i.test(input)) {
    throw new WebsiteAnalyzerError(
      "UNSUPPORTED_PROTOCOL",
      "Only HTTP and HTTPS website URLs are supported.",
    );
  }

  const candidate = hasScheme ? input : `https://${input}`;

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new WebsiteAnalyzerError("INVALID_URL", "The website URL is not valid.");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new WebsiteAnalyzerError(
      "UNSUPPORTED_PROTOCOL",
      "Only HTTP and HTTPS website URLs are supported.",
    );
  }

  if (parsed.username || parsed.password) {
    throw new WebsiteAnalyzerError(
      "URL_CREDENTIALS_NOT_ALLOWED",
      "Website URLs containing embedded credentials are not allowed.",
    );
  }

  if (!parsed.hostname) {
    throw new WebsiteAnalyzerError("INVALID_URL", "The website URL must include a hostname.");
  }

  return parsed;
}

export async function validateWebsiteUrl(rawUrl: string): Promise<ValidatedWebsiteTarget> {
  const parsed = parseWebsiteUrl(rawUrl);
  const hostname = normalizeHostname(parsed.hostname);

  if (isUnsafeHostname(hostname)) {
    throw new WebsiteAnalyzerError(
      "UNSAFE_HOST",
      "The website URL points to a local or internal hostname and cannot be analyzed.",
    );
  }

  const literalVersion = isIP(hostname);
  let resolvedAddresses: string[];

  if (literalVersion) {
    resolvedAddresses = [hostname];
  } else {
    try {
      const records = await lookup(hostname, { all: true, verbatim: true });
      resolvedAddresses = Array.from(new Set(records.map((record) => record.address)));
    } catch {
      throw new WebsiteAnalyzerError(
        "DNS_RESOLUTION_FAILED",
        "The website hostname could not be resolved.",
      );
    }
  }

  if (resolvedAddresses.length === 0) {
    throw new WebsiteAnalyzerError(
      "DNS_RESOLUTION_FAILED",
      "The website hostname did not resolve to an address.",
    );
  }

  const unsafeAddress = resolvedAddresses.find(isUnsafeIpAddress);
  if (unsafeAddress) {
    throw new WebsiteAnalyzerError(
      "UNSAFE_RESOLVED_ADDRESS",
      "The website hostname resolves to a private, local, or otherwise unsafe network address.",
    );
  }

  parsed.hash = "";

  return {
    requestedUrl: rawUrl,
    normalizedUrl: parsed.toString(),
    protocol: parsed.protocol as "http:" | "https:",
    hostname,
    port: parsed.port || null,
    resolvedAddresses,
  };
}
