import { NextResponse } from "next/server";

import { WebsiteAnalyzerError } from "@/lib/website-analyzer/errors";
import { prepareWebsiteAnalysis } from "@/lib/website-analyzer/service";
import type {
  AnalyzeWebsiteRequest,
  AnalyzerErrorResponse,
} from "@/lib/website-analyzer/types";

export const runtime = "nodejs";

function invalidRequest(message: string) {
  const body: AnalyzerErrorResponse = {
    ok: false,
    error: {
      code: "INVALID_REQUEST",
      message,
    },
  };

  return NextResponse.json(body, { status: 400 });
}

export async function POST(request: Request) {
  let body: Partial<AnalyzeWebsiteRequest>;

  try {
    body = (await request.json()) as Partial<AnalyzeWebsiteRequest>;
  } catch {
    return invalidRequest("Request body must be valid JSON.");
  }

  if (typeof body.url !== "string" || body.url.trim() === "") {
    return invalidRequest("A website URL is required.");
  }

  try {
    const result = await prepareWebsiteAnalysis(body.url);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof WebsiteAnalyzerError) {
      const response: AnalyzerErrorResponse = {
        ok: false,
        error: {
          code: error.code,
          message: error.message,
        },
      };

      return NextResponse.json(response, { status: error.httpStatus });
    }

    console.error("Website analyzer foundation failed", error);

    const response: AnalyzerErrorResponse = {
      ok: false,
      error: {
        code: "INTERNAL_ERROR",
        message: "The website analyzer could not prepare this request.",
      },
    };

    return NextResponse.json(response, { status: 500 });
  }
}
