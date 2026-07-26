import { NextResponse } from "next/server";

import { buildBusinessDetailSnapshot, BusinessDetailError } from "@/lib/business-details/service";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ externalId: string }> },
) {
  const { externalId } = await context.params;
  if (!externalId?.trim()) {
    return NextResponse.json(
      { ok: false, error: { code: "INVALID_REQUEST", message: "A business external ID is required." } },
      { status: 400 },
    );
  }

  try {
    const detail = await buildBusinessDetailSnapshot(externalId);
    return NextResponse.json({ ok: true, detail });
  } catch (error) {
    if (error instanceof BusinessDetailError) {
      return NextResponse.json(
        { ok: false, error: { code: error.code, message: error.message } },
        { status: error.code === "BUSINESS_NOT_FOUND" ? 404 : 502 },
      );
    }

    console.error("Could not build business detail snapshot", error);
    return NextResponse.json(
      { ok: false, error: { code: "BUSINESS_DETAIL_ERROR", message: "The business detail data could not be prepared." } },
      { status: 500 },
    );
  }
}
