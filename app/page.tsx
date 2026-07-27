"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { MarketRefreshButton } from "./market-refresh-button";

type Priority = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
type Confidence = "HIGH" | "MEDIUM" | "LOW";
type BestOpportunity = { opportunityId: string; title: string; priority: Priority; confidence: Confidence; recommendedService: string } | null;
type BusinessRow = {
  externalId: string; rank: number; resultPosition: number; businessName: string; websiteUrl: string | null;
  phone: string | null; formattedAddress: string | null; rating: number | null; intelligenceAvailable: boolean;
  websiteScore: number | null; bestOpportunity: BestOpportunity; opportunityCount: number; rankingReason: string;
  leadScore: { available: false; score: null; tier: null; reason: string };
};
type HistoryEntry = { id: string; industry: string; location: string; resultCount: number; createdAt: string; selected: boolean; dashboardPath: string };
type Dashboard = {
  dashboardVersion: string;
  market: { id: string; industry: string; location: string; requestedMaxResults: number; resultCount: number; createdAt: string };
  summary: {
    businessesFound: number; businessesWithWebsites: number; businessesAnalyzed: number; businessesWithOpportunities: number;
    totalOpportunities: number; averageWebsiteScore: number | null; lowestWebsiteScore: number | null; highestWebsiteScore: number | null;
    analysisCoveragePercent: number; websiteCoveragePercent: number; opportunityCoveragePercent: number;
    opportunityCountsByService: Array<{ service: string; count: number }>;
    bestOpportunityCountsByPriority: Array<{ priority: Priority; count: number }>;
    websiteScoreDistribution: Array<{ band: string; label: string; count: number }>;
    topRecommendedService: { service: string; count: number } | null;
  };
  historyNavigation: HistoryEntry[];
  tableView: {
    rows: BusinessRow[]; totalRows: number; filteredRows: number;
    filters: { priority?: Priority; confidence?: Confidence; service?: string; analysis: string; minScore?: number; maxScore?: number; sort: string };
  };
};
type DashboardResponse = { ok: true; dashboard: Dashboard } | { ok: false; error: { code: string; message: string } };
type DiscoveryResponse = { ok: true; searchId: string } | { ok: false; error?: { message?: string } };

const priorityClasses: Record<Priority, string> = {
  CRITICAL: "border-rose-200 bg-rose-50 text-rose-700",
  HIGH: "border-orange-200 bg-orange-50 text-orange-700",
  MEDIUM: "border-amber-200 bg-amber-50 text-amber-700",
  LOW: "border-slate-200 bg-slate-50 text-slate-600",
};

function serviceLabel(value: string) {
  return value.toLowerCase().split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}
function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-CA", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}
function Score({ value }: { value: number | null }) {
  if (value === null) return <span className="text-slate-400">—</span>;
  const tone = value < 40 ? "text-rose-600" : value < 60 ? "text-orange-600" : value < 80 ? "text-amber-600" : "text-emerald-600";
  return <span className={`text-lg font-bold tabular-nums ${tone}`}>{Math.round(value)}</span>;
}
function SummaryCard({ label, value, note }: { label: string; value: string | number; note: string }) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</p><p className="mt-3 text-3xl font-bold tracking-tight text-slate-950">{value}</p><p className="mt-2 text-sm leading-5 text-slate-500">{note}</p></div>;
}

export default function Home() {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showDiscovery, setShowDiscovery] = useState(false);
  const [industry, setIndustry] = useState("");
  const [location, setLocation] = useState("");
  const [maxResults, setMaxResults] = useState(20);
  const [discovering, setDiscovering] = useState(false);
  const [priority, setPriority] = useState("");
  const [confidence, setConfidence] = useState("");
  const [analysis, setAnalysis] = useState("ALL");
  const [sort, setSort] = useState("RANK");
  const [minScore, setMinScore] = useState("");
  const [maxScore, setMaxScore] = useState("");
  const [service, setService] = useState("");

  const loadDashboard = useCallback(async (searchId?: string) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (searchId) params.set("searchId", searchId);
      if (priority) params.set("priority", priority);
      if (confidence) params.set("confidence", confidence);
      if (service) params.set("service", service);
      if (analysis !== "ALL") params.set("analysis", analysis);
      if (sort !== "RANK") params.set("sort", sort);
      if (minScore) params.set("minScore", minScore);
      if (maxScore) params.set("maxScore", maxScore);
      const response = await fetch(`/api/dashboard${params.size ? `?${params.toString()}` : ""}`, { cache: "no-store" });
      const body = (await response.json()) as DashboardResponse;
      if (!response.ok || !body.ok) throw new Error(!body.ok ? body.error.message : "Dashboard request failed.");
      setDashboard(body.dashboard);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The dashboard could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [priority, confidence, service, analysis, sort, minScore, maxScore]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadDashboard(); }, 0);
    return () => window.clearTimeout(timer);
  }, [loadDashboard]);

  const serviceOptions = useMemo(() => dashboard?.summary.opportunityCountsByService.map((item) => item.service) ?? [], [dashboard]);

  async function switchMarket(searchId: string) {
    setService("");
    await loadDashboard(searchId);
  }

  async function runDiscovery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setDiscovering(true);
    setError(null);
    try {
      const response = await fetch("/api/businesses/search", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ industry, location, maxResults, reuseRecent: true }) });
      const body = (await response.json()) as DiscoveryResponse;
      if (!response.ok || !body.ok) throw new Error(!body.ok ? body.error?.message ?? "Business discovery failed." : "Business discovery failed.");
      setShowDiscovery(false);
      setIndustry("");
      setLocation("");
      await loadDashboard(body.searchId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Business discovery failed.");
    } finally {
      setDiscovering(false);
    }
  }

  const rows = dashboard?.tableView.rows ?? [];

  return (
    <main className="min-h-screen bg-[#f5f7fb] text-slate-950">
      <header className="sticky top-0 z-20 border-b border-slate-200/90 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-950 text-sm font-bold text-white">TQ</div><div><p className="font-semibold leading-none">TEQQI OS</p><p className="mt-1 text-xs text-slate-500">Opportunity intelligence dashboard</p></div></div>
          <button onClick={() => setShowDiscovery((value) => !value)} className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800">{showDiscovery ? "Close search" : "+ Find businesses"}</button>
        </div>
      </header>

      <div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        {showDiscovery && <section className="mb-6 rounded-2xl border border-indigo-200 bg-white p-5 shadow-sm"><div className="mb-4"><p className="font-semibold">Discover a new market</p><p className="mt-1 text-sm text-slate-500">Recent identical searches may be reused for 15 minutes; otherwise discovery returns previously unseen Google Place IDs.</p></div><form onSubmit={runDiscovery} className="grid gap-3 md:grid-cols-[1fr_1fr_140px_auto]"><input value={industry} onChange={(e) => setIndustry(e.target.value)} required placeholder="Industry, e.g. Dentists" className="h-11 rounded-xl border border-slate-300 px-3.5 text-sm" /><input value={location} onChange={(e) => setLocation(e.target.value)} required placeholder="Location, e.g. Ottawa" className="h-11 rounded-xl border border-slate-300 px-3.5 text-sm" /><select value={maxResults} onChange={(e) => setMaxResults(Number(e.target.value))} className="h-11 rounded-xl border border-slate-300 px-3 text-sm">{[5,10,20,40,60].map((value) => <option key={value} value={value}>{value} results</option>)}</select><button disabled={discovering} className="h-11 rounded-xl bg-indigo-600 px-5 text-sm font-semibold text-white disabled:opacity-50">{discovering ? "Searching…" : "Search market"}</button></form></section>}

        {error && <div className="mb-6 flex items-center justify-between gap-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"><span>{error}</span><button onClick={() => void loadDashboard(dashboard?.market.id)} className="font-semibold underline">Retry</button></div>}

        {loading && !dashboard ? <section className="rounded-2xl border border-slate-200 bg-white p-16 text-center shadow-sm"><div className="mx-auto mb-4 h-9 w-9 animate-spin rounded-full border-4 border-slate-200 border-t-slate-950" /><p className="font-semibold">Preparing opportunity intelligence…</p><p className="mt-1 text-sm text-slate-500">Refreshing live business details and connecting website intelligence.</p></section> : dashboard ? <>
          <section className="mb-6 flex flex-col justify-between gap-5 lg:flex-row lg:items-end"><div><div className="mb-2 flex flex-wrap items-center gap-2"><span className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700">Phase 9 · Opportunity Dashboard</span><span className="text-xs text-slate-400">Dashboard v{dashboard.dashboardVersion}</span></div><h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{dashboard.market.industry} in {dashboard.market.location}</h1><p className="mt-2 text-sm text-slate-500">Discovered {formatDate(dashboard.market.createdAt)} · Business details refreshed live from Google</p></div><div className="flex flex-col gap-3 sm:flex-row sm:items-start"><select value={dashboard.market.id} onChange={(e) => void switchMarket(e.target.value)} className="h-11 max-w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium shadow-sm lg:min-w-[320px]">{dashboard.historyNavigation.map((entry) => <option key={entry.id} value={entry.id}>{entry.industry} · {entry.location} · {formatDate(entry.createdAt)}</option>)}</select><MarketRefreshButton searchId={dashboard.market.id} /></div></section>

          <section className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5"><SummaryCard label="Businesses" value={dashboard.summary.businessesFound} note={`${dashboard.summary.businessesWithWebsites} have websites`} /><SummaryCard label="Analyzed" value={dashboard.summary.businessesAnalyzed} note={`${dashboard.summary.analysisCoveragePercent}% market coverage`} /><SummaryCard label="Avg website score" value={dashboard.summary.averageWebsiteScore === null ? "—" : Math.round(dashboard.summary.averageWebsiteScore)} note={dashboard.summary.lowestWebsiteScore === null ? "No scored sites yet" : `Range ${Math.round(dashboard.summary.lowestWebsiteScore)}–${Math.round(dashboard.summary.highestWebsiteScore ?? 0)}`} /><SummaryCard label="Opportunities" value={dashboard.summary.totalOpportunities} note={`${dashboard.summary.businessesWithOpportunities} businesses affected`} /><SummaryCard label="Top service" value={dashboard.summary.topRecommendedService ? serviceLabel(dashboard.summary.topRecommendedService.service) : "—"} note={dashboard.summary.topRecommendedService ? `${dashboard.summary.topRecommendedService.count} opportunities` : "No opportunities yet"} /></section>

          <section className="mb-6 grid gap-4 xl:grid-cols-[1.3fr_.7fr]"><div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><div><h2 className="font-semibold">Opportunity mix</h2><p className="mt-1 text-sm text-slate-500">Recommended website services across this market.</p></div><span className="text-xs font-medium text-slate-400">{dashboard.summary.opportunityCoveragePercent}% coverage</span></div><div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{dashboard.summary.opportunityCountsByService.map((item) => <div key={item.service} className="rounded-xl bg-slate-50 px-4 py-3"><p className="text-sm font-medium text-slate-700">{serviceLabel(item.service)}</p><p className="mt-1 text-2xl font-bold">{item.count}</p></div>)}</div></div><div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-semibold">Website Score distribution</h2><p className="mt-1 text-sm text-slate-500">Analyzed businesses by score band.</p><div className="mt-5 space-y-3">{dashboard.summary.websiteScoreDistribution.map((band) => <div key={band.band} className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3"><span className="text-sm font-medium text-slate-600">{band.label}</span><span className="font-bold">{band.count}</span></div>)}</div></div></section>

          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 p-5"><div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-end"><div><h2 className="text-lg font-semibold">Ranked businesses</h2><p className="mt-1 text-sm text-slate-500">Prioritized using website opportunity evidence — not a commercial Lead Score.</p></div><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:flex"><select value={priority} onChange={(e) => setPriority(e.target.value)} className="h-10 rounded-lg border border-slate-300 px-2.5 text-sm"><option value="">All priorities</option>{["CRITICAL","HIGH","MEDIUM","LOW"].map((value) => <option key={value}>{value}</option>)}</select><select value={confidence} onChange={(e) => setConfidence(e.target.value)} className="h-10 rounded-lg border border-slate-300 px-2.5 text-sm"><option value="">All confidence</option>{["HIGH","MEDIUM","LOW"].map((value) => <option key={value}>{value}</option>)}</select><select value={service} onChange={(e) => setService(e.target.value)} className="h-10 rounded-lg border border-slate-300 px-2.5 text-sm"><option value="">All services</option>{serviceOptions.map((value) => <option key={value} value={value}>{serviceLabel(value)}</option>)}</select><select value={analysis} onChange={(e) => setAnalysis(e.target.value)} className="h-10 rounded-lg border border-slate-300 px-2.5 text-sm"><option value="ALL">All analysis</option><option value="ANALYZED">Analyzed</option><option value="NOT_ANALYZED">Not analyzed</option><option value="HAS_WEBSITE">Has website</option><option value="NO_WEBSITE">No website</option></select><select value={sort} onChange={(e) => setSort(e.target.value)} className="h-10 rounded-lg border border-slate-300 px-2.5 text-sm"><option value="RANK">Evidence rank</option><option value="WEBSITE_SCORE_ASC">Score: low first</option><option value="WEBSITE_SCORE_DESC">Score: high first</option><option value="OPPORTUNITY_COUNT_DESC">Most opportunities</option><option value="BUSINESS_NAME_ASC">Business name</option><option value="RATING_DESC">Google rating</option></select></div></div><div className="mt-4 flex flex-wrap items-center gap-2"><input value={minScore} onChange={(e) => setMinScore(e.target.value)} inputMode="numeric" placeholder="Min score" className="h-9 w-24 rounded-lg border border-slate-300 px-2.5 text-sm" /><input value={maxScore} onChange={(e) => setMaxScore(e.target.value)} inputMode="numeric" placeholder="Max score" className="h-9 w-24 rounded-lg border border-slate-300 px-2.5 text-sm" /><span className="ml-auto text-xs text-slate-400">Showing {dashboard.tableView.filteredRows} of {dashboard.tableView.totalRows}</span></div></div>
            <div className="overflow-x-auto"><table className="w-full min-w-[1100px] text-left"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">Rank</th><th className="px-5 py-3">Business</th><th className="px-5 py-3">Website Score</th><th className="px-5 py-3">Best opportunity</th><th className="px-5 py-3">Priority</th><th className="px-5 py-3">Confidence</th><th className="px-5 py-3">Opportunities</th><th className="px-5 py-3">Status</th></tr></thead><tbody className="divide-y divide-slate-100">{rows.map((row) => <tr key={row.externalId} className="align-top transition hover:bg-slate-50/70"><td className="px-5 py-4 text-sm font-bold text-slate-400">#{row.rank}</td><td className="max-w-[320px] px-5 py-4"><Link href={`/businesses/${encodeURIComponent(row.externalId)}`} className="font-semibold text-slate-950 hover:text-indigo-600 hover:underline">{row.businessName}</Link><p className="mt-1 truncate text-xs text-slate-500">{row.formattedAddress ?? "Address unavailable"}</p><div className="mt-2 flex gap-3"><Link href={`/businesses/${encodeURIComponent(row.externalId)}`} className="text-xs font-semibold text-indigo-600 hover:underline">View details →</Link>{row.websiteUrl && <a href={row.websiteUrl} target="_blank" rel="noreferrer" className="text-xs font-semibold text-slate-500 hover:underline">Website ↗</a>}</div></td><td className="px-5 py-4"><Score value={row.websiteScore} /></td><td className="max-w-[280px] px-5 py-4"><p className="text-sm font-medium">{row.bestOpportunity?.title ?? "No eligible opportunity"}</p><p className="mt-1 text-xs text-slate-400">{row.bestOpportunity ? serviceLabel(row.bestOpportunity.recommendedService) : row.intelligenceAvailable ? "Analyzed" : "Awaiting analysis"}</p></td><td className="px-5 py-4">{row.bestOpportunity ? <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${priorityClasses[row.bestOpportunity.priority]}`}>{row.bestOpportunity.priority}</span> : <span className="text-sm text-slate-400">—</span>}</td><td className="px-5 py-4 text-sm font-semibold text-slate-600">{row.bestOpportunity?.confidence ?? "—"}</td><td className="px-5 py-4 text-sm font-bold">{row.opportunityCount}</td><td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${row.intelligenceAvailable ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{row.intelligenceAvailable ? "Analyzed" : "Not analyzed"}</span></td></tr>)}</tbody></table></div>
            {rows.length === 0 && <div className="px-5 py-16 text-center"><p className="font-semibold">No businesses match these filters.</p><p className="mt-1 text-sm text-slate-500">Change or clear the filters to see more of this market.</p></div>}
          </section>

          <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-500"><strong className="text-slate-700">Data note:</strong> Google Places business content is refreshed live and is not persisted by the dashboard. Website Scores and opportunities come from immutable TEQQI analysis runs. Commercial Lead Score is intentionally unavailable until a business-level lead model is implemented.</div>
        </> : <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-16 text-center"><p className="text-xl font-semibold">No market intelligence yet</p><p className="mx-auto mt-2 max-w-lg text-sm text-slate-500">Run Business Discovery to create your first market, then TEQQI OS can organize its website intelligence here.</p><button onClick={() => setShowDiscovery(true)} className="mt-5 rounded-xl bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white">Find businesses</button></section>}
      </div>
    </main>
  );
}
