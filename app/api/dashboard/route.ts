import { NextResponse } from "next/server";

import { buildOpportunityDashboardSnapshot, DashboardDataError } from "@/lib/dashboard/service";
import { buildDashboardTableView, parseDashboardTableView } from "@/lib/dashboard/table-view";
import { createRequestLogContext, logEvent } from "@/lib/observability/logger";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const startedAt = performance.now();
  const logContext = createRequestLogContext(request, "dashboard_load");
  const { searchParams } = new URL(request.url);
  const searchId = searchParams.get("searchId")?.trim() || undefined;

  logEvent("INFO", "dashboard.requested", logContext, { searchId: searchId ?? null });

  try {
    const tableInput = parseDashboardTableView(searchParams);
    const dashboard = await buildOpportunityDashboardSnapshot(searchId, searchParams);
    const tableView = buildDashboardTableView(dashboard.rankedBusinesses, tableInput);
    const durationMs = Math.round(performance.now() - startedAt);
    logEvent("INFO", "dashboard.completed", logContext, {
      searchId: dashboard.market.id,
      businessCount: dashboard.businesses.length,
      durationMs,
    });
    return NextResponse.json(
      { ok: true, dashboard: { ...dashboard, tableView }, performance: { durationMs } },
      { headers: { "X-Request-Id": logContext.requestId } },
    );
  } catch (error) {
    const durationMs = Math.round(performance.now() - startedAt);
    if (error instanceof DashboardDataError) {
      const notFound = error.message.includes("not found");
      logEvent("WARN", "dashboard.unavailable", logContext, { searchId: searchId ?? null, durationMs, error });
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: notFound ? "DASHBOARD_SEARCH_NOT_FOUND" : "DASHBOARD_EMPTY",
            message: error.message,
          },
        },
        { status: notFound ? 404 : 409, headers: { "X-Request-Id": logContext.requestId } },
      );
    }

    if (error instanceof Error && /Invalid|must be between|minScore cannot/.test(error.message)) {
      logEvent("WARN", "dashboard.invalid_filter", logContext, { durationMs, error });
      return NextResponse.json(
        { ok: false, error: { code: "INVALID_DASHBOARD_FILTER", message: error.message } },
        { status: 400, headers: { "X-Request-Id": logContext.requestId } },
      );
    }

    logEvent("ERROR", "dashboard.failed", logContext, { searchId: searchId ?? null, durationMs, error });
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "DASHBOARD_DATA_ERROR",
          message: "The dashboard data could not be prepared.",
        },
      },
      { status: 500, headers: { "X-Request-Id": logContext.requestId } },
    );
  }
}
