import "server-only";

import { randomUUID } from "node:crypto";

type LogLevel = "INFO" | "WARN" | "ERROR";
type LogMetadata = Record<string, unknown>;

export type RequestLogContext = {
  requestId: string;
  operation: string;
};

const SERVICE_NAME = "teqqi-os";
const MAX_STRING_LENGTH = 500;
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

function safeValue(value: unknown): unknown {
  if (value instanceof Error) {
    return { name: value.name, message: value.message.slice(0, MAX_STRING_LENGTH) };
  }
  if (typeof value === "string") return value.slice(0, MAX_STRING_LENGTH);
  if (Array.isArray(value)) return value.slice(0, 25).map(safeValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => !/key|secret|token|authorization|cookie|responsebody/i.test(key))
        .slice(0, 30)
        .map(([key, item]) => [key, safeValue(item)]),
    );
  }
  return value;
}

function normalizeRequestId(value: string | null): string {
  const trimmed = value?.trim();
  return trimmed && REQUEST_ID_PATTERN.test(trimmed) ? trimmed : randomUUID();
}

export function createRequestLogContext(request: Request, operation: string): RequestLogContext {
  return {
    requestId: normalizeRequestId(request.headers.get("x-request-id")),
    operation,
  };
}

export function createSystemLogContext(operation: string): RequestLogContext {
  return { requestId: randomUUID(), operation };
}

export function logEvent(
  level: LogLevel,
  event: string,
  context: RequestLogContext,
  metadata: LogMetadata = {},
): void {
  const record = JSON.stringify({
    timestamp: new Date().toISOString(),
    service: SERVICE_NAME,
    level,
    event,
    requestId: context.requestId,
    operation: context.operation,
    ...safeValue(metadata) as Record<string, unknown>,
  });

  if (level === "ERROR") console.error(record);
  else if (level === "WARN") console.warn(record);
  else console.info(record);
}
