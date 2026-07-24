import { NextResponse } from "next/server";

import { checkSupabaseConnection } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET() {
  try {
    await checkSupabaseConnection();

    return NextResponse.json({
      ok: true,
      service: "supabase",
      message: "Supabase connection is healthy.",
    });
  } catch (error) {
    console.error("Supabase health check failed", error);

    return NextResponse.json(
      {
        ok: false,
        service: "supabase",
        message: "Supabase connection failed.",
      },
      { status: 500 },
    );
  }
}
