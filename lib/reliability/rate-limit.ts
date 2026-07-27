const DEFAULT_BASE_DELAY_MS = 500;
const DEFAULT_MAX_DELAY_MS = 5_000;

export type RateLimitRetryPolicy = {
  maxRetries: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
};

export function parseRetryAfterMs(value: string | null, nowMs = Date.now()): number | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const seconds = Number(trimmed);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.round(seconds * 1_000);
  }

  const retryAtMs = Date.parse(trimmed);
  if (!Number.isFinite(retryAtMs)) return null;
  return Math.max(0, retryAtMs - nowMs);
}

export function retryDelayMs(
  retryIndex: number,
  retryAfterHeader: string | null,
  policy: RateLimitRetryPolicy,
): number {
  const baseDelayMs = policy.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const maxDelayMs = policy.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;
  const providerDelay = parseRetryAfterMs(retryAfterHeader);
  const exponentialDelay = baseDelayMs * 2 ** Math.max(0, retryIndex);
  return Math.min(providerDelay ?? exponentialDelay, maxDelayMs);
}

export function isRetryableProviderStatus(status: number): boolean {
  return status === 429 || status === 503;
}

export async function waitForRetry(delayMs: number): Promise<void> {
  if (delayMs <= 0) return;
  await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
}
