import { NextResponse } from "next/server";

import { WebsiteAnalyzerError } from "@/lib/website-analyzer/errors";
import { prepareWebsiteAnalysis } from "@/lib/website-analyzer/service";
import type { AnalyzerFinding } from "@/lib/website-analyzer/types";
import { persistWebsiteScoringRun } from "@/lib/website-scoring/persistence";
import { WebsiteScoringError } from "@/lib/website-scoring/rule-score";
import { scoreWebsite, type WebsiteScoringInput } from "@/lib/website-scoring/service";
import type { ScorableFinding, ScoringCategory } from "@/lib/website-scoring/types";

export const runtime = "nodejs";

type ScoreWebsiteRequest = { url: string };

function invalidRequest(message: string) {
  return NextResponse.json(
    { ok: false, error: { code: "INVALID_REQUEST", message } },
    { status: 400 },
  );
}

function toScorableFinding(finding: AnalyzerFinding): ScorableFinding {
  return {
    ruleId: finding.ruleId,
    category: finding.category as ScoringCategory,
    status: finding.status,
    confidence: finding.confidence,
    applicable: finding.applicable,
  };
}

export async function POST(request: Request) {
  let body: Partial<ScoreWebsiteRequest>;

  try {
    body = (await request.json()) as Partial<ScoreWebsiteRequest>;
  } catch {
    return invalidRequest("Request body must be valid JSON.");
  }

  if (typeof body.url !== "string" || body.url.trim() === "") {
    return invalidRequest("A website URL is required.");
  }

  try {
    const analysis = await prepareWebsiteAnalysis(body.url);
    const allFindings = [
      ...analysis.technicalHealthFindings,
      ...analysis.seoFindings,
      ...analysis.performanceFindings,
      ...analysis.conversionUxFindings,
      ...analysis.accessibilityFindings,
      ...analysis.contentQualityFindings,
    ];
    const scoringInput: WebsiteScoringInput = {
      TECHNICAL_HEALTH: analysis.technicalHealthFindings.map(toScorableFinding),
      SEO: analysis.seoFindings.map(toScorableFinding),
      PERFORMANCE: analysis.performanceFindings.map(toScorableFinding),
      ACCESSIBILITY: analysis.accessibilityFindings.map(toScorableFinding),
      CONVERSION_UX: analysis.conversionUxFindings.map(toScorableFinding),
      CONTENT_QUALITY: analysis.contentQualityFindings.map(toScorableFinding),
    };

    const scoring = scoreWebsite(scoringInput);
    const persistence = await persistWebsiteScoringRun({
      requestedUrl: body.url,
      finalUrl: analysis.fetch.finalUrl,
      analyzerVersion: analysis.analyzerVersion,
      analyzerFindings: allFindings,
      scoring,
    });

    return NextResponse.json({
      ok: true,
      scoringRunId: persistence.scoringRunId,
      websiteId: persistence.websiteId,
      analyzerVersion: analysis.analyzerVersion,
      requestedUrl: body.url,
      finalUrl: analysis.fetch.finalUrl,
      scoring,
      persistence: {
        stored: true,
        historicalResultImmutable: true,
      },
    });
  } catch (error) {
    if (error instanceof WebsiteAnalyzerError) {
      return NextResponse.json(
        { ok: false, error: { code: error.code, message: error.message } },
        { status: error.httpStatus },
      );
    }

    if (error instanceof WebsiteScoringError) {
      return NextResponse.json(
        { ok: false, error: { code: "SCORING_ERROR", message: error.message } },
        { status: 422 },
      );
    }

    console.error("Website scoring request failed", error);
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "The website could not be analyzed and scored.",
        },
      },
      { status: 500 },
    );
  }
}
