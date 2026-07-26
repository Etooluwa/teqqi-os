import { NextResponse } from "next/server";

import { buildOpportunityDashboardSnapshot, DashboardDataError } from "@/lib/dashboard/service";
import { buildDashboardTableView, parseDashboardTableView } from "@/lib/dashboard/table-view";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const searchId = searchParams.get("searchId")?.trim() || undefined;

  try {
    const tableInput = parseDashboardTableView(searchParams);
    const dashboard = await buildOpportunityDashboardSnapshot(searchId, searchParams);
    const tableView = buildDashboardTableView(dashboard.rankedBusinesses, tableInput);
    return NextResponse.json({ ok: true, dashboard: { ...dashboard, tableView } });
  } catch (error) {
    if (error instanceof DashboardDataError) {
      const notFound = error.message.includes("not found");
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: notFound ? "DASHBOARD_SEARCH_NOT_FOUND" : "DASHBOARD_EMPTY",
            message: error.message,
          },
        },
        { status: notFound ? 404 : 409 },
      );
    }

    if (error instanceof Error && /Invalid|must be between|minScore cannot/.test(error.message)) {
      return NextResponse.json(
        { ok: false, error: { code: "INVALID_DASHBOARD_FILTER", message: error.message } },
        { status: 400 },
      );
    }

    console.error("Could not build opportunity dashboard", error);
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "DASHBOARD_DATA_ERROR",
          message: "The dashboard data could not be prepared.",
        },
      },
      { status: 500 },
    );
  }
}
