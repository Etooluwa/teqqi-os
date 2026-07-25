import { NextResponse } from "next/server";

import { getWebsiteScoringRun } from "@/lib/website-scoring/persistence";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ scoringRunId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { scoringRunId } = await context.params;

  if (!scoringRunId || scoringRunId.trim() === "") {
    return NextResponse.json(
      { ok: false, error: { code: "INVALID_REQUEST", message: "A scoring run ID is required." } },
      { status: 400 },
    );
  }

  try {
    const result = await getWebsiteScoringRun(scoringRunId);
    if (!result) {
      return NextResponse.json(
        { ok: false, error: { code: "NOT_FOUND", message: "Website scoring run was not found." } },
        { status: 404 },
      );
    }

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("Historical website score lookup failed", error);
    return NextResponse.json(
      { ok: false, error: { code: "INTERNAL_ERROR", message: "The website scoring run could not be loaded." } },
      { status: 500 },
    );
  }
}
