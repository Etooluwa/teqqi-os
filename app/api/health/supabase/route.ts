import { NextResponse } from "next/server";

import { createRequestLogContext, logEvent } from "@/lib/observability/logger";
import { checkSupabaseConnection } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const context = createRequestLogContext(request, "health.supabase");
  const startedAt = Date.now();

  try {
    await checkSupabaseConnection();
    logEvent("INFO", "supabase.health_ok", context, { durationMs: Date.now() - startedAt });

    return NextResponse.json({
      ok: true,
      service: "supabase",
      message: "Supabase connection is healthy.",
    }, { headers: { "X-Request-Id": context.requestId } });
  } catch (error) {
    logEvent("ERROR", "supabase.health_failed", context, { error, durationMs: Date.now() - startedAt });

    return NextResponse.json(
      {
        ok: false,
        service: "supabase",
        message: "Supabase connection failed.",
      },
      { status: 500, headers: { "X-Request-Id": context.requestId } },
    );
  }
}
