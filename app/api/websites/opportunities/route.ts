import { NextResponse } from "next/server";

import { WebsiteAnalyzerError } from "@/lib/website-analyzer/errors";
import { prepareWebsiteAnalysis } from "@/lib/website-analyzer/service";
import type { AnalyzerFinding } from "@/lib/website-analyzer/types";
import { WebsiteOpportunityError } from "@/lib/website-opportunities/detection";
import {
  findCompletedOpportunityRunForScoringRun,
  findReusableWebsiteOpportunityRun,
  persistWebsiteOpportunityRun,
} from "@/lib/website-opportunities/persistence";
import { generateWebsiteOpportunities } from "@/lib/website-opportunities/service";
import type { OpportunityFindingInput } from "@/lib/website-opportunities/types";
import {
  getRecoverableWebsiteScoringRun,
  getWebsiteScoringRun,
  persistWebsiteScoringRun,
} from "@/lib/website-scoring/persistence";
import { WebsiteScoringError } from "@/lib/website-scoring/rule-score";
import { scoreWebsite, type WebsiteScoringInput } from "@/lib/website-scoring/service";
import type { ScorableFinding, ScoringCategory, UnifiedWebsiteScoringResult } from "@/lib/website-scoring/types";

export const runtime = "nodejs";

const WEBSITE_AUDIT_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const WEBSITE_AUDIT_RECOVERY_TTL_MS = 60 * 60 * 1000;

type OpportunityRequest = { url: string; forceRefresh?: boolean; resumeScoringRunId?: string };

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

function generateFromPersistedScoring(findings: AnalyzerFinding[], scoring: UnifiedWebsiteScoringResult) {
  return generateWebsiteOpportunities({
    findings: findings.map(toOpportunityFinding),
    scoring: {
      websiteScore: scoring.websiteScore,
      categoryScores: Object.fromEntries(
        scoring.categoryScores.map((category) => [category.category, category.score]),
      ),
      criticalFailureCount: scoring.criticalFailureCount,
      scoringModelVersion: scoring.scoringModelVersion,
    },
  });
}

export async function POST(request: Request) {
  let body: Partial<OpportunityRequest>;
  let recoveryScoringRunId: string | null = null;

  try {
    body = (await request.json()) as Partial<OpportunityRequest>;
  } catch {
    return invalidRequest("Request body must be valid JSON.");
  }

  if (typeof body.url !== "string" || body.url.trim() === "") {
    return invalidRequest("A website URL is required.");
  }

  try {
    if (typeof body.resumeScoringRunId === "string" && body.resumeScoringRunId.trim()) {
      const checkpoint = await getRecoverableWebsiteScoringRun(
        body.resumeScoringRunId,
        body.url,
        WEBSITE_AUDIT_RECOVERY_TTL_MS,
      );
      if (!checkpoint || !checkpoint.analyzer_findings) {
        return NextResponse.json(
          {
            ok: false,
            error: {
              code: "RECOVERY_CHECKPOINT_INVALID",
              message: "The website audit checkpoint is missing, stale, incompatible, or belongs to a different website.",
              retryable: false,
            },
          },
          { status: 409 },
        );
      }

      recoveryScoringRunId = checkpoint.id;
      const existingOpportunityRun = await findCompletedOpportunityRunForScoringRun(checkpoint.id);
      if (existingOpportunityRun) {
        return NextResponse.json({
          ok: true,
          opportunityRunId: existingOpportunityRun.id,
          scoringRunId: checkpoint.id,
          websiteId: checkpoint.website_id,
          analyzerVersion: checkpoint.analyzer_version,
          requestedUrl: body.url,
          finalUrl: checkpoint.final_url,
          scoring: {
            websiteScore: checkpoint.explanation.websiteScore,
            scoringModelVersion: checkpoint.explanation.scoringModelVersion,
            criticalFailureCount: checkpoint.explanation.criticalFailureCount,
          },
          opportunityResult: existingOpportunityRun.result,
          persistence: {
            stored: false,
            historicalResultImmutable: true,
          },
          recovery: {
            resumed: true,
            scoringRunId: checkpoint.id,
            analyzerRerun: false,
            reusedCompletedOpportunityRun: true,
            checkpointTtlMs: WEBSITE_AUDIT_RECOVERY_TTL_MS,
          },
          cache: {
            hit: false,
            ttlMs: WEBSITE_AUDIT_CACHE_TTL_MS,
            forceRefresh: body.forceRefresh === true,
          },
        });
      }

      const opportunityResult = generateFromPersistedScoring(
        checkpoint.analyzer_findings,
        checkpoint.explanation,
      );
      const opportunityPersistence = await persistWebsiteOpportunityRun({
        scoringRunId: checkpoint.id,
        websiteId: checkpoint.website_id,
        requestedUrl: body.url,
        finalUrl: checkpoint.final_url,
        analyzerVersion: checkpoint.analyzer_version,
        result: opportunityResult,
      });

      return NextResponse.json({
        ok: true,
        opportunityRunId: opportunityPersistence.opportunityRunId,
        scoringRunId: checkpoint.id,
        websiteId: checkpoint.website_id,
        analyzerVersion: checkpoint.analyzer_version,
        requestedUrl: body.url,
        finalUrl: checkpoint.final_url,
        scoring: {
          websiteScore: checkpoint.explanation.websiteScore,
          scoringModelVersion: checkpoint.explanation.scoringModelVersion,
          criticalFailureCount: checkpoint.explanation.criticalFailureCount,
        },
        opportunityResult,
        persistence: {
          stored: true,
          historicalResultImmutable: true,
        },
        recovery: {
          resumed: true,
          scoringRunId: checkpoint.id,
          analyzerRerun: false,
          reusedCompletedOpportunityRun: false,
          checkpointTtlMs: WEBSITE_AUDIT_RECOVERY_TTL_MS,
        },
        cache: {
          hit: false,
          ttlMs: WEBSITE_AUDIT_CACHE_TTL_MS,
          forceRefresh: body.forceRefresh === true,
        },
      });
    }

    if (body.forceRefresh !== true) {
      const cachedOpportunityRun = await findReusableWebsiteOpportunityRun(
        body.url,
        WEBSITE_AUDIT_CACHE_TTL_MS,
      );

      if (cachedOpportunityRun) {
        const cachedScoringRun = await getWebsiteScoringRun(cachedOpportunityRun.scoring_run_id);
        if (cachedScoringRun) {
          const scoring = cachedScoringRun.run.explanation;
          return NextResponse.json({
            ok: true,
            opportunityRunId: cachedOpportunityRun.id,
            scoringRunId: cachedOpportunityRun.scoring_run_id,
            websiteId: cachedOpportunityRun.website_id,
            analyzerVersion: cachedOpportunityRun.analyzer_version,
            requestedUrl: body.url,
            finalUrl: cachedOpportunityRun.final_url,
            scoring: {
              websiteScore: scoring.websiteScore,
              scoringModelVersion: scoring.scoringModelVersion,
              criticalFailureCount: scoring.criticalFailureCount,
            },
            opportunityResult: cachedOpportunityRun.result,
            persistence: {
              stored: false,
              historicalResultImmutable: true,
            },
            cache: {
              hit: true,
              ttlMs: WEBSITE_AUDIT_CACHE_TTL_MS,
              createdAt: cachedOpportunityRun.created_at,
              versionCompatible: true,
            },
          });
        }
      }
    }

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
    recoveryScoringRunId = scoringPersistence.scoringRunId;

    const opportunityResult = generateFromPersistedScoring(allFindings, scoring);

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
      recovery: {
        resumed: false,
        scoringRunId: scoringPersistence.scoringRunId,
        checkpointTtlMs: WEBSITE_AUDIT_RECOVERY_TTL_MS,
      },
      cache: {
        hit: false,
        ttlMs: WEBSITE_AUDIT_CACHE_TTL_MS,
        forceRefresh: body.forceRefresh === true,
      },
    });
  } catch (error) {
    const recovery = recoveryScoringRunId
      ? {
          resumable: true,
          scoringRunId: recoveryScoringRunId,
          checkpointTtlMs: WEBSITE_AUDIT_RECOVERY_TTL_MS,
        }
      : undefined;

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
        { ok: false, error: { code: "OPPORTUNITY_ERROR", message: error.message }, recovery },
        { status: 422 },
      );
    }

    console.error("Website opportunity request failed", error);
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "INTERNAL_ERROR",
          message: recovery
            ? "The opportunity stage failed after scoring completed. Retry using the preserved scoring checkpoint."
            : "The website could not be analyzed for opportunities.",
        },
        recovery,
      },
      { status: recovery ? 503 : 500 },
    );
  }
}
