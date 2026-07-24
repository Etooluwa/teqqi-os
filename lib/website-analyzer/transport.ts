import "server-only";

import tls from "node:tls";

import type {
  HttpProbeEvidence,
  RedirectHop,
  TlsCertificateEvidence,
  TransportSecurityEvidence,
  ValidatedWebsiteTarget,
} from "@/lib/website-analyzer/types";
import { validateWebsiteUrl } from "@/lib/website-analyzer/url";

const PROBE_TIMEOUT_MS = 8_000;
const MAX_REDIRECTS = 5;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const USER_AGENT = "TEQQI-OS-Website-Analyzer/1.0 (+https://theteqqi.com)";

function baseUrl(protocol: "http:" | "https:", target: ValidatedWebsiteTarget): string {
  const hostname = target.hostname.includes(":") ? `[${target.hostname}]` : target.hostname;
  return `${protocol}//${hostname}/`;
}

async function fetchProbe(url: string): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);

  try {
    return await fetch(url, {
      method: "GET",
      redirect: "manual",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1",
      },
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function probeHttp(startUrl: string): Promise<HttpProbeEvidence> {
  const redirects: RedirectHop[] = [];
  let currentUrl = startUrl;

  try {
    for (let attempt = 0; attempt <= MAX_REDIRECTS; attempt += 1) {
      const target = await validateWebsiteUrl(currentUrl);
      const response = await fetchProbe(target.normalizedUrl);

      if (REDIRECT_STATUSES.has(response.status)) {
        if (attempt === MAX_REDIRECTS) {
          await response.body?.cancel();
          return {
            attemptedUrl: startUrl,
            available: false,
            statusCode: response.status,
            finalUrl: target.normalizedUrl,
            redirects,
            error: "redirect_limit_exceeded",
          };
        }

        const location = response.headers.get("location");
        await response.body?.cancel();
        if (!location) {
          return {
            attemptedUrl: startUrl,
            available: true,
            statusCode: response.status,
            finalUrl: target.normalizedUrl,
            redirects,
            error: "redirect_location_missing",
          };
        }

        const nextUrl = new URL(location, target.normalizedUrl).toString();
        const nextTarget = await validateWebsiteUrl(nextUrl);
        redirects.push({
          fromUrl: target.normalizedUrl,
          toUrl: nextTarget.normalizedUrl,
          status: response.status,
        });
        currentUrl = nextTarget.normalizedUrl;
        continue;
      }

      await response.body?.cancel();
      return {
        attemptedUrl: startUrl,
        available: true,
        statusCode: response.status,
        finalUrl: target.normalizedUrl,
        redirects,
        error: null,
      };
    }
  } catch (error) {
    return {
      attemptedUrl: startUrl,
      available: false,
      statusCode: null,
      finalUrl: null,
      redirects,
      error: error instanceof Error ? error.message : "probe_failed",
    };
  }

  return {
    attemptedUrl: startUrl,
    available: false,
    statusCode: null,
    finalUrl: null,
    redirects,
    error: "probe_failed",
  };
}

function normalizeCertificateRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object") return {};
  const result: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (typeof entry === "string") result[key] = entry;
    else if (Array.isArray(entry)) result[key] = entry.map(String).join(", ");
  }
  return result;
}

function daysUntil(value: string | undefined): number | null {
  if (!value) return null;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return null;
  return Math.floor((timestamp - Date.now()) / 86_400_000);
}

function inspectTlsAddress(
  target: ValidatedWebsiteTarget,
  address: string,
): Promise<TlsCertificateEvidence> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: TlsCertificateEvidence) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    const socket = tls.connect({
      host: address,
      port: target.port ? Number(target.port) : 443,
      servername: target.hostname,
      rejectUnauthorized: false,
      timeout: PROBE_TIMEOUT_MS,
    });

    socket.once("secureConnect", () => {
      const certificate = socket.getPeerCertificate();
      const cipher = socket.getCipher();
      finish({
        connected: true,
        authorized: socket.authorized,
        authorizationError: socket.authorizationError ? String(socket.authorizationError) : null,
        protocol: socket.getProtocol(),
        cipher: cipher?.name ?? null,
        validFrom: certificate.valid_from ?? null,
        validTo: certificate.valid_to ?? null,
        daysRemaining: daysUntil(certificate.valid_to),
        subject: normalizeCertificateRecord(certificate.subject),
        issuer: normalizeCertificateRecord(certificate.issuer),
        error: null,
      });
      socket.end();
    });

    socket.once("timeout", () => {
      socket.destroy();
      finish({
        connected: false,
        authorized: false,
        authorizationError: null,
        protocol: null,
        cipher: null,
        validFrom: null,
        validTo: null,
        daysRemaining: null,
        subject: {},
        issuer: {},
        error: "tls_timeout",
      });
    });

    socket.once("error", (error) => {
      finish({
        connected: false,
        authorized: false,
        authorizationError: null,
        protocol: null,
        cipher: null,
        validFrom: null,
        validTo: null,
        daysRemaining: null,
        subject: {},
        issuer: {},
        error: error.message,
      });
    });
  });
}

async function inspectTls(target: ValidatedWebsiteTarget): Promise<TlsCertificateEvidence> {
  let last: TlsCertificateEvidence | null = null;
  for (const address of target.resolvedAddresses) {
    const evidence = await inspectTlsAddress(target, address);
    if (evidence.connected) return evidence;
    last = evidence;
  }

  return (
    last ?? {
      connected: false,
      authorized: false,
      authorizationError: null,
      protocol: null,
      cipher: null,
      validFrom: null,
      validTo: null,
      daysRemaining: null,
      subject: {},
      issuer: {},
      error: "no_resolved_address",
    }
  );
}

export async function collectTransportSecurityEvidence(
  target: ValidatedWebsiteTarget,
): Promise<TransportSecurityEvidence> {
  const [https, http, tlsEvidence] = await Promise.all([
    probeHttp(baseUrl("https:", target)),
    probeHttp(baseUrl("http:", target)),
    inspectTls(target),
  ]);

  return { https, http, tls: tlsEvidence };
}
