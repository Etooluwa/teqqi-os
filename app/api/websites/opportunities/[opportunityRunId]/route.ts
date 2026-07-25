import { NextResponse } from "next/server";

import { getWebsiteOpportunityRun } from "@/lib/website-opportunities/persistence";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ opportunityRunId: string }> },
) {
  const { opportunityRunId } = await context.params;
  if (!opportunityRunId) {
    return NextResponse.json(
      { ok: false, error: { code: "INVALID_REQUEST", message: "An opportunity run ID is required." } },
      { status: 400 },
    );
  }

  try {
    const persisted = await getWebsiteOpportunityRun(opportunityRunId);
    if (!persisted) {
      return NextResponse.json(
        { ok: false, error: { code: "NOT_FOUND", message: "Opportunity run not found." } },
        { status: 404 },
      );
    }

    return NextResponse.json({
      ok: true,
      opportunityRunId: persisted.run.id,
      scoringRunId: persisted.run.scoring_run_id,
      websiteId: persisted.run.website_id,
      requestedUrl: persisted.run.requested_url,
      finalUrl: persisted.run.final_url,
      analyzerVersion: persisted.run.analyzer_version,
      scoringModelVersion: persisted.run.scoring_model_version,
      opportunityEngineVersion: persisted.run.opportunity_engine_version,
      opportunityResult: persisted.run.result,
      opportunities: persisted.opportunities,
      persistence: {
        stored: true,
        historicalResultImmutable: true,
      },
    });
  } catch (error) {
    console.error("Historical website opportunity lookup failed", error);
    return NextResponse.json(
      { ok: false, error: { code: "INTERNAL_ERROR", message: "The opportunity run could not be loaded." } },
      { status: 500 },
    );
  }
}
