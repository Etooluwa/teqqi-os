import { NextResponse } from "next/server";

import { WebsiteAnalyzerError } from "@/lib/website-analyzer/errors";
import { prepareWebsiteAnalysis } from "@/lib/website-analyzer/service";
import type { AnalyzerFinding } from "@/lib/website-analyzer/types";
import { WebsiteOpportunityError } from "@/lib/website-opportunities/detection";
import { persistWebsiteOpportunityRun } from "@/lib/website-opportunities/persistence";
import { generateWebsiteOpportunities } from "@/lib/website-opportunities/service";
import type { OpportunityFindingInput } from "@/lib/website-opportunities/types";
import { persistWebsiteScoringRun } from "@/lib/website-scoring/persistence";
import { WebsiteScoringError } from "@/lib/website-scoring/rule-score";
import { scoreWebsite, type WebsiteScoringInput } from "@/lib/website-scoring/service";
import type { ScorableFinding, ScoringCategory } from "@/lib/website-scoring/types";

export const runtime = "nodejs";

type OpportunityRequest = { url: string };

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

function toOpportunityFinding(finding: AnalyzerFinding): OpportunityFindingInput {
  return {
    ruleId: finding.ruleId,
    category: finding.category,
    status: finding.status,
    confidence: finding.confidence,
    applicable: finding.applicable,
  };
}

export async function POST(request: Request) {
  let body: Partial<OpportunityRequest>;

  try {
    body = (await request.json()) as Partial<OpportunityRequest>;
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
    const scoringPersistence = await persistWebsiteScoringRun({
      requestedUrl: body.url,
      finalUrl: analysis.fetch.finalUrl,
      analyzerVersion: analysis.analyzerVersion,
      analyzerFindings: allFindings,
      scoring,
    });

    const opportunityResult = generateWebsiteOpportunities({
      findings: allFindings.map(toOpportunityFinding),
      scoring: {
        websiteScore: scoring.websiteScore,
        categoryScores: Object.fromEntries(
          scoring.categoryScores.map((category) => [category.category, category.score]),
        ),
        criticalFailureCount: scoring.criticalFailureCount,
        scoringModelVersion: scoring.scoringModelVersion,
      },
    });

    const opportunityPersistence = await persistWebsiteOpportunityRun({
      scoringRunId: scoringPersistence.scoringRunId,
      websiteId: scoringPersistence.websiteId,
      requestedUrl: body.url,
      finalUrl: analysis.fetch.finalUrl,
      analyzerVersion: analysis.analyzerVersion,
      result: opportunityResult,
    });

    return NextResponse.json({
      ok: true,
      opportunityRunId: opportunityPersistence.opportunityRunId,
      scoringRunId: scoringPersistence.scoringRunId,
      websiteId: scoringPersistence.websiteId,
      analyzerVersion: analysis.analyzerVersion,
      requestedUrl: body.url,
      finalUrl: analysis.fetch.finalUrl,
      scoring: {
        websiteScore: scoring.websiteScore,
        scoringModelVersion: scoring.scoringModelVersion,
        criticalFailureCount: scoring.criticalFailureCount,
      },
      opportunityResult,
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

    if (error instanceof WebsiteOpportunityError) {
      return NextResponse.json(
        { ok: false, error: { code: "OPPORTUNITY_ERROR", message: error.message } },
        { status: 422 },
      );
    }

    console.error("Website opportunity request failed", error);
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "The website could not be analyzed for opportunities.",
        },
      },
      { status: 500 },
    );
  }
}
