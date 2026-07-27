import { NextResponse } from "next/server";

import { createRequestLogContext, logEvent } from "@/lib/observability/logger";
import { getOperationalMonitoringSnapshot } from "@/lib/observability/monitoring";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const context = createRequestLogContext(request, "health.monitoring");

  try {
    const monitoring = await getOperationalMonitoringSnapshot();
    logEvent(monitoring.status === "DEGRADED" ? "WARN" : "INFO", "monitoring.snapshot", context, {
      status: monitoring.status,
      signals: monitoring.signals,
    });

    return NextResponse.json(
      { ok: true, monitoring },
      { headers: { "X-Request-Id": context.requestId } },
    );
  } catch (error) {
    logEvent("ERROR", "monitoring.snapshot_failed", context, { error });
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "MONITORING_UNAVAILABLE",
          message: "Operational monitoring could not be prepared.",
        },
      },
      { status: 503, headers: { "X-Request-Id": context.requestId } },
    );
  }
}
