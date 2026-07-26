import Link from "next/link";
import { notFound } from "next/navigation";

import { buildBusinessDetailSnapshot, BusinessDetailError } from "@/lib/business-details/service";

export const dynamic = "force-dynamic";

function label(value: string) {
  return value.toLowerCase().split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

function scoreTone(value: number | null) {
  if (value === null) return "text-slate-400";
  if (value < 40) return "text-rose-600";
  if (value < 60) return "text-orange-600";
  if (value < 80) return "text-amber-600";
  return "text-emerald-600";
}

export default async function BusinessDetailPage({ params }: { params: Promise<{ externalId: string }> }) {
  const { externalId } = await params;

  let detail;
  try {
    detail = await buildBusinessDetailSnapshot(externalId);
  } catch (error) {
    if (error instanceof BusinessDetailError && error.code === "BUSINESS_NOT_FOUND") notFound();
    throw error;
  }

  const breakdown = detail.intelligence.scoreBreakdown;
  const findings = detail.intelligence.analyzerFindings;
  const recommendations = detail.intelligence.recommendations;

  return (
    <main className="min-h-screen bg-[#f5f7fb] text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-950 text-sm font-bold text-white">TQ</div>
            <div><p className="font-semibold leading-none">TEQQI OS</p><p className="mt-1 text-xs text-slate-500">Business intelligence detail</p></div>
          </div>
          <Link href="/" className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">← Back to dashboard</Link>
        </div>
      </header>

      <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-start">
            <div>
              <div className="mb-2 flex flex-wrap gap-2"><span className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700">Phase 10 · Business Details</span><span className="text-xs text-slate-400">Detail v{detail.detailVersion}</span></div>
              <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{detail.business.name}</h1>
              <p className="mt-2 text-sm text-slate-500">{detail.business.formattedAddress ?? "Address unavailable"}</p>
              <div className="mt-4 flex flex-wrap gap-4 text-sm">
                {detail.business.phone && <span>{detail.business.phone}</span>}
                {detail.business.rating !== null && <span>Google rating {detail.business.rating.toFixed(1)}</span>}
                {detail.business.websiteUrl && <a href={detail.business.websiteUrl} target="_blank" rel="noreferrer" className="font-semibold text-indigo-600 hover:underline">Visit website ↗</a>}
              </div>
            </div>
            <div className="rounded-2xl bg-slate-950 px-6 py-5 text-white lg:min-w-[220px]">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Website Score</p>
              <p className="mt-2 text-4xl font-bold tabular-nums">{breakdown.websiteScore === null ? "—" : Math.round(breakdown.websiteScore)}</p>
              <p className="mt-2 text-xs text-slate-400">{breakdown.available ? `Scoring model ${breakdown.scoringModelVersion}` : "No completed score available"}</p>
            </div>
          </div>
        </section>

        <section className="mb-6 grid gap-4 lg:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Discovery</p><p className="mt-3 font-semibold">{detail.discovery ? `${detail.discovery.industry} in ${detail.discovery.location}` : "Unavailable"}</p><p className="mt-1 text-sm text-slate-500">Google business details are refreshed live.</p></div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Analyzer evidence</p><p className="mt-3 text-2xl font-bold">{findings.available ? findings.findingCount : "—"}</p><p className="mt-1 text-sm text-slate-500">{findings.available ? "Persisted findings tied to the scoring run" : "No persisted analyzer findings"}</p></div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Recommendations</p><p className="mt-3 text-2xl font-bold">{recommendations.available ? recommendations.opportunityCount : 0}</p><p className="mt-1 text-sm text-slate-500">Website-only opportunities; Lead Score remains unavailable.</p></div>
        </section>

        <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between"><div><h2 className="text-lg font-semibold">Score breakdown</h2><p className="mt-1 text-sm text-slate-500">Six scoring categories from the latest completed Phase 7 run.</p></div>{breakdown.capApplied && <span className="rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700">Critical cap {breakdown.appliedCriticalCap}</span>}</div>
          {breakdown.categories.length > 0 ? <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{breakdown.categories.map((category) => <div key={category.category} className="rounded-xl bg-slate-50 p-4"><div className="flex items-center justify-between"><p className="text-sm font-semibold">{label(category.category)}</p><p className={`text-xl font-bold ${scoreTone(category.score)}`}>{category.score === null ? "—" : Math.round(category.score)}</p></div><p className="mt-2 text-xs text-slate-500">Weight {category.weight}% · {category.includedRuleCount} included · {category.excludedRuleCount} excluded</p></div>)}</div> : <p className="mt-5 text-sm text-slate-500">Score breakdown is unavailable until this website has a completed scoring run.</p>}
        </section>

        <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold">Recommendations</h2><p className="mt-1 text-sm text-slate-500">Evidence-backed website opportunities from Phase 8.</p>
          {recommendations.recommendations.length > 0 ? <div className="mt-5 space-y-3">{recommendations.recommendations.map((item) => <div key={item.opportunityId} className="rounded-xl border border-slate-200 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-semibold">{item.title}</p><p className="mt-1 text-sm text-slate-500">{label(item.recommendedService)}</p></div><div className="flex gap-2"><span className="rounded-full bg-orange-50 px-2.5 py-1 text-xs font-semibold text-orange-700">{item.priority}</span><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">{item.confidence} confidence</span></div></div><p className="mt-3 text-sm leading-6 text-slate-600">{item.explanation}</p><p className="mt-2 text-xs text-slate-400">{item.evidenceCount} supporting finding{item.evidenceCount === 1 ? "" : "s"}</p></div>)}</div> : <p className="mt-5 text-sm text-slate-500">No completed website recommendations are available.</p>}
        </section>

        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-500"><strong className="text-slate-700">Data note:</strong> Google Places content is fetched live and is not persisted as business content. Website scoring, analyzer evidence, and recommendations are tied to immutable TEQQI runs. Commercial Lead Score is not implemented.</div>
      </div>
    </main>
  );
}
