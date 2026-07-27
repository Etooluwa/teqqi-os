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
type AutoAnalysisProgress = {
  marketId: string;
  total: number;
  completed: number;
  succeeded: number;
  failed: number;
  running: boolean;
};

const AUTO_ANALYSIS_CONCURRENCY = 3;

const priorityClasses: Record<Priority, string> = {
  CRITICAL: "border-[#a55449] text-[#8d3f35]",
  HIGH: "border-[#a86e42] text-[#8a5732]",
  MEDIUM: "border-[#a49455] text-[#746a38]",
  LOW: "border-[#8b8a83] text-[#6f6e68]",
};

function serviceLabel(value: string) {
  return value.toLowerCase().split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-CA", { month: "short", day: "2-digit", year: "numeric" }).format(new Date(value));
}

function Score({ value }: { value: number | null }) {
  if (value === null) return <span className="text-[#aaa8a1]">—</span>;
  const tone = value < 40 ? "text-[#93483f]" : value < 60 ? "text-[#98623c]" : value < 80 ? "text-[#7b7040]" : "text-[#2f493d]";
  return <span className={`font-editorial text-[30px] tabular-nums ${tone}`}>{Math.round(value)}</span>;
}

function MetricCell({ index, label, value, note }: { index: string; label: string; value: string | number; note: string }) {
  return (
    <div className="min-h-[190px] border-b border-r border-[#d9d6cf] p-5 sm:p-6">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#77766f]">{index} / {label}</p>
      <div className="mt-14 sm:mt-16">
        <p className="font-editorial text-[42px] leading-none text-[#171714] sm:text-[50px]">{value}</p>
        <p className="mt-4 text-[10px] font-medium uppercase tracking-[0.14em] text-[#77766f]">{note}</p>
      </div>
    </div>
  );
}

function SectionLabel({ index, children, right }: { index: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-[#d9d6cf] px-5 py-4 sm:px-6">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#77766f]">{index} / {children}</p>
      {right}
    </div>
  );
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
  const [autoAnalysis, setAutoAnalysis] = useState<AutoAnalysisProgress | null>(null);
  const [priority, setPriority] = useState("");
  const [confidence, setConfidence] = useState("");
  const [analysis, setAnalysis] = useState("ALL");
  const [sort, setSort] = useState("RANK");
  const [minScore, setMinScore] = useState("");
  const [maxScore, setMaxScore] = useState("");
  const [service, setService] = useState("");

  const loadDashboard = useCallback(async (searchId?: string): Promise<Dashboard | null> => {
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
      return body.dashboard;
    } catch (err) {
      setError(err instanceof Error ? err.message : "The dashboard could not be loaded.");
      return null;
    } finally {
      setLoading(false);
    }
  }, [priority, confidence, service, analysis, sort, minScore, maxScore]);

  const runAutomaticAnalysis = useCallback(async (market: Dashboard) => {
    const candidates = market.tableView.rows.filter((row) => row.websiteUrl && !row.intelligenceAvailable);
    if (candidates.length === 0) {
      setAutoAnalysis(null);
      return;
    }

    setAutoAnalysis({ marketId: market.market.id, total: candidates.length, completed: 0, succeeded: 0, failed: 0, running: true });
    let nextIndex = 0;

    async function worker() {
      while (nextIndex < candidates.length) {
        const candidate = candidates[nextIndex++];
        let succeeded = false;
        try {
          const response = await fetch("/api/websites/opportunities", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url: candidate.websiteUrl }),
          });
          const body = await response.json().catch(() => null) as { ok?: boolean } | null;
          succeeded = response.ok && body?.ok === true;
        } catch {
          succeeded = false;
        }

        setAutoAnalysis((current) => current && current.marketId === market.market.id ? {
          ...current,
          completed: current.completed + 1,
          succeeded: current.succeeded + (succeeded ? 1 : 0),
          failed: current.failed + (succeeded ? 0 : 1),
        } : current);
      }
    }

    await Promise.all(Array.from({ length: Math.min(AUTO_ANALYSIS_CONCURRENCY, candidates.length) }, () => worker()));
    setAutoAnalysis((current) => current && current.marketId === market.market.id ? { ...current, running: false } : current);
    await loadDashboard(market.market.id);
  }, [loadDashboard]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadDashboard(); }, 0);
    return () => window.clearTimeout(timer);
  }, [loadDashboard]);

  const serviceOptions = useMemo(() => dashboard?.summary.opportunityCountsByService.map((item) => item.service) ?? [], [dashboard]);

  async function switchMarket(searchId: string) {
    setService("");
    setAutoAnalysis(null);
    await loadDashboard(searchId);
  }

  async function runDiscovery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setDiscovering(true);
    setError(null);
    setAutoAnalysis(null);
    try {
      const response = await fetch("/api/businesses/search", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ industry, location, maxResults, reuseRecent: true }) });
      const body = (await response.json()) as DiscoveryResponse;
      if (!response.ok || !body.ok) throw new Error(!body.ok ? body.error?.message ?? "Business discovery failed." : "Business discovery failed.");
      setShowDiscovery(false);
      setIndustry("");
      setLocation("");
      const discoveredMarket = await loadDashboard(body.searchId);
      if (discoveredMarket) void runAutomaticAnalysis(discoveredMarket);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Business discovery failed.");
    } finally {
      setDiscovering(false);
    }
  }

  const rows = dashboard?.tableView.rows ?? [];
  const maxDistribution = Math.max(1, ...(dashboard?.summary.websiteScoreDistribution.map((band) => band.count) ?? [1]));

  return (
    <main className="min-h-screen bg-[#f4f2ed] text-[#171714]">
      <header className="sticky top-0 z-20 border-b border-[#d9d6cf] bg-[#f4f2ed]/95 backdrop-blur">
        <div className="grid min-h-[60px] grid-cols-[1fr_auto] lg:grid-cols-[264px_1fr_auto]">
          <div className="flex items-center border-r border-[#d9d6cf] px-5 sm:px-6">
            <span className="font-editorial text-[20px]">TEQQI OS</span>
          </div>
          <nav className="hidden items-center justify-center gap-8 px-6 text-[11px] font-medium uppercase tracking-[0.12em] lg:flex">
            <span className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-[#171714]" /> Overview</span>
            <span className="text-[#8b8982]">Markets</span>
            <span className="text-[#8b8982]">Businesses</span>
            <span className="text-[#8b8982]">Analysis</span>
          </nav>
          <button onClick={() => setShowDiscovery((value) => !value)} className="border-l border-[#d9d6cf] px-5 text-[11px] font-semibold uppercase tracking-[0.12em] transition hover:bg-[#ebe8e1] sm:px-8">
            {showDiscovery ? "Close search" : "Search market"}
          </button>
        </div>
      </header>

      <section className="border-b border-[#d9d6cf] px-5 py-9 text-center sm:px-6 sm:py-11">
        <p className="font-editorial text-[38px] leading-none sm:text-[46px]">Opportunity Intelligence</p>
        <p className="mt-3 text-[10px] font-medium uppercase tracking-[0.16em] text-[#77766f]">Website evidence for business development</p>
      </section>

      {showDiscovery && (
        <section className="border-b border-[#d9d6cf] bg-[#f8f7f3]">
          <div className="flex items-center justify-between border-b border-[#d9d6cf] px-5 py-3 sm:px-6">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em]">New market search</p>
            <span className="text-[10px] uppercase tracking-[0.12em] text-[#77766f]">Auto-analysis enabled</span>
          </div>
          <form onSubmit={runDiscovery} className="grid md:grid-cols-[1fr_1fr_150px_auto]">
            <input value={industry} onChange={(e) => setIndustry(e.target.value)} required placeholder="Industry, e.g. Dentists" className="teqqi-control h-14 border-l-0 border-t-0 px-5 text-sm md:border-b-0" />
            <input value={location} onChange={(e) => setLocation(e.target.value)} required placeholder="Location, e.g. Ottawa" className="teqqi-control h-14 border-l-0 border-t-0 px-5 text-sm md:border-b-0" />
            <select value={maxResults} onChange={(e) => setMaxResults(Number(e.target.value))} className="teqqi-control h-14 border-l-0 border-t-0 px-4 text-sm md:border-b-0">{[5,10,20,40,60].map((value) => <option key={value} value={value}>{value} results</option>)}</select>
            <button disabled={discovering} className="h-14 bg-[#2f493d] px-7 text-[11px] font-semibold uppercase tracking-[0.14em] text-white transition hover:bg-[#24392f] disabled:opacity-50">{discovering ? "Searching…" : "Run search →"}</button>
          </form>
        </section>
      )}

      {error && <div className="flex items-center justify-between gap-4 border-b border-[#b9857d] bg-[#f3e6e2] px-5 py-3 text-sm text-[#7f3f37] sm:px-6"><span>{error}</span><button onClick={() => void loadDashboard(dashboard?.market.id)} className="text-[10px] font-semibold uppercase tracking-[0.12em] underline">Retry</button></div>}

      {autoAnalysis && dashboard?.market.id === autoAnalysis.marketId && (
        <section className="border-b border-[#d9d6cf] bg-[#edf0eb]">
          <div className="grid gap-4 px-5 py-4 sm:grid-cols-[1fr_auto] sm:items-center sm:px-6">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#2f493d]">{autoAnalysis.running ? "Analyzing discovered websites…" : "Automatic market analysis complete"}</p>
              <p className="mt-1 text-sm text-[#64645e]">{autoAnalysis.completed} of {autoAnalysis.total} eligible websites processed · {autoAnalysis.succeeded} succeeded{autoAnalysis.failed > 0 ? ` · ${autoAnalysis.failed} could not be analyzed` : ""}</p>
            </div>
            <span className="font-editorial text-[30px] tabular-nums text-[#2f493d]">{Math.round((autoAnalysis.completed / autoAnalysis.total) * 100)}%</span>
          </div>
          <div className="h-[3px] bg-[#d9d6cf]"><div className="h-full bg-[#2f493d] transition-all" style={{ width: `${(autoAnalysis.completed / autoAnalysis.total) * 100}%` }} /></div>
        </section>
      )}

      {loading && !dashboard ? (
        <section className="px-6 py-28 text-center">
          <div className="mx-auto mb-5 h-7 w-7 animate-spin rounded-full border-2 border-[#d9d6cf] border-t-[#171714]" />
          <p className="font-editorial text-2xl">Preparing opportunity intelligence</p>
          <p className="mt-2 text-xs uppercase tracking-[0.12em] text-[#77766f]">Refreshing business details and website evidence</p>
        </section>
      ) : dashboard ? (
        <>
          <section className="grid border-b border-[#d9d6cf] lg:grid-cols-[1fr_auto] lg:items-center">
            <div className="px-5 py-5 sm:px-6">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#77766f]">Market / {dashboard.market.location}</p>
              <h1 className="font-editorial mt-2 text-[34px] leading-tight sm:text-[40px]">{dashboard.market.industry} in {dashboard.market.location}</h1>
              <p className="mt-2 text-xs text-[#77766f]">Discovered {formatDate(dashboard.market.createdAt)} · Live Google business details · Dashboard v{dashboard.dashboardVersion}</p>
            </div>
            <div className="flex flex-col gap-3 border-t border-[#d9d6cf] px-5 py-4 sm:flex-row sm:items-start sm:px-6 lg:border-l lg:border-t-0">
              <select value={dashboard.market.id} onChange={(e) => void switchMarket(e.target.value)} className="teqqi-control h-10 min-w-[280px] px-3 text-xs">
                {dashboard.historyNavigation.map((entry) => <option key={entry.id} value={entry.id}>{entry.industry} · {entry.location} · {formatDate(entry.createdAt)}</option>)}
              </select>
              <MarketRefreshButton searchId={dashboard.market.id} />
            </div>
          </section>

          <div className="grid border-l border-[#d9d6cf] sm:grid-cols-2 xl:grid-cols-5">
            <MetricCell index="01" label="Businesses" value={dashboard.summary.businessesFound} note={`${dashboard.summary.businessesWithWebsites} have websites`} />
            <MetricCell index="02" label="Analyzed" value={dashboard.summary.businessesAnalyzed} note={`${dashboard.summary.analysisCoveragePercent}% market coverage`} />
            <MetricCell index="03" label="Avg. website score" value={dashboard.summary.averageWebsiteScore === null ? "—" : Math.round(dashboard.summary.averageWebsiteScore)} note={dashboard.summary.lowestWebsiteScore === null ? "No scored sites yet" : `Range ${Math.round(dashboard.summary.lowestWebsiteScore)}–${Math.round(dashboard.summary.highestWebsiteScore ?? 0)}`} />
            <MetricCell index="04" label="Opportunities" value={dashboard.summary.totalOpportunities} note={`${dashboard.summary.businessesWithOpportunities} businesses affected`} />
            <MetricCell index="05" label="Top service" value={dashboard.summary.topRecommendedService ? serviceLabel(dashboard.summary.topRecommendedService.service) : "—"} note={dashboard.summary.topRecommendedService ? `${dashboard.summary.topRecommendedService.count} opportunities` : "No opportunities yet"} />
          </div>

          <section className="grid border-b border-[#d9d6cf] xl:grid-cols-[1.1fr_.9fr]">
            <div className="border-r border-[#d9d6cf]">
              <SectionLabel index="06" right={<span className="text-[10px] uppercase tracking-[0.12em] text-[#77766f]">{dashboard.summary.opportunityCoveragePercent}% coverage</span>}>Opportunity mix</SectionLabel>
              <div className="divide-y divide-[#dedbd4] px-5 py-2 sm:px-6">
                {dashboard.summary.opportunityCountsByService.length > 0 ? dashboard.summary.opportunityCountsByService.map((item) => (
                  <div key={item.service} className="flex items-center justify-between py-3.5">
                    <span className="text-sm">{serviceLabel(item.service)}</span>
                    <span className="font-editorial text-2xl">{item.count}</span>
                  </div>
                )) : <p className="py-8 text-sm text-[#8a8982]">No opportunity evidence yet.</p>}
              </div>
            </div>
            <div>
              <SectionLabel index="07">Website score distribution</SectionLabel>
              <div className="flex h-[180px] items-end gap-2 px-5 pb-5 pt-8 sm:px-6">
                {dashboard.summary.websiteScoreDistribution.map((band, index) => (
                  <div key={band.band} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-2">
                    <span className="text-[10px] text-[#77766f]">{band.count}</span>
                    <div className={`w-full ${index >= 1 && index <= 2 ? "bg-[#2f493d]" : "bg-[#d7d4ce]"}`} style={{ height: `${Math.max(12, (band.count / maxDistribution) * 96)}px` }} />
                    <span className="max-w-full truncate text-[9px] uppercase tracking-[0.08em] text-[#77766f]">{band.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="border-b border-[#d9d6cf]">
            <SectionLabel index="08" right={<span className="text-[10px] uppercase tracking-[0.12em] text-[#77766f]">Showing {dashboard.tableView.filteredRows} of {dashboard.tableView.totalRows}</span>}>Ranked businesses</SectionLabel>
            <div className="grid gap-px border-b border-[#d9d6cf] bg-[#d9d6cf] lg:grid-cols-5">
              <select value={priority} onChange={(e) => setPriority(e.target.value)} className="h-11 border-0 bg-[#f8f7f3] px-4 text-xs outline-none"><option value="">All priorities</option>{["CRITICAL","HIGH","MEDIUM","LOW"].map((value) => <option key={value}>{value}</option>)}</select>
              <select value={confidence} onChange={(e) => setConfidence(e.target.value)} className="h-11 border-0 bg-[#f8f7f3] px-4 text-xs outline-none"><option value="">All confidence</option>{["HIGH","MEDIUM","LOW"].map((value) => <option key={value}>{value}</option>)}</select>
              <select value={service} onChange={(e) => setService(e.target.value)} className="h-11 border-0 bg-[#f8f7f3] px-4 text-xs outline-none"><option value="">All services</option>{serviceOptions.map((value) => <option key={value} value={value}>{serviceLabel(value)}</option>)}</select>
              <select value={analysis} onChange={(e) => setAnalysis(e.target.value)} className="h-11 border-0 bg-[#f8f7f3] px-4 text-xs outline-none"><option value="ALL">All analysis</option><option value="ANALYZED">Analyzed</option><option value="NOT_ANALYZED">Not analyzed</option><option value="HAS_WEBSITE">Has website</option><option value="NO_WEBSITE">No website</option></select>
              <select value={sort} onChange={(e) => setSort(e.target.value)} className="h-11 border-0 bg-[#f8f7f3] px-4 text-xs outline-none"><option value="RANK">Evidence rank</option><option value="WEBSITE_SCORE_ASC">Score: low first</option><option value="WEBSITE_SCORE_DESC">Score: high first</option><option value="OPPORTUNITY_COUNT_DESC">Most opportunities</option><option value="BUSINESS_NAME_ASC">Business name</option><option value="RATING_DESC">Google rating</option></select>
            </div>
            <div className="flex flex-wrap items-center gap-px border-b border-[#d9d6cf] bg-[#d9d6cf]">
              <input value={minScore} onChange={(e) => setMinScore(e.target.value)} inputMode="numeric" placeholder="Min score" className="h-10 w-28 border-0 bg-[#f8f7f3] px-4 text-xs outline-none" />
              <input value={maxScore} onChange={(e) => setMaxScore(e.target.value)} inputMode="numeric" placeholder="Max score" className="h-10 w-28 border-0 bg-[#f8f7f3] px-4 text-xs outline-none" />
              <span className="ml-auto bg-[#f4f2ed] px-5 text-[10px] uppercase tracking-[0.1em] text-[#77766f]">Prioritized by website opportunity evidence, not Lead Score</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[1120px] border-collapse text-left">
                <thead className="border-b border-[#d9d6cf] text-[10px] uppercase tracking-[0.14em] text-[#77766f]">
                  <tr><th className="px-5 py-3 font-semibold">Rank</th><th className="px-5 py-3 font-semibold">Business</th><th className="px-5 py-3 font-semibold">Website score</th><th className="px-5 py-3 font-semibold">Best opportunity</th><th className="px-5 py-3 font-semibold">Priority</th><th className="px-5 py-3 font-semibold">Confidence</th><th className="px-5 py-3 font-semibold">Opps.</th><th className="px-5 py-3 font-semibold">Status</th></tr>
                </thead>
                <tbody className="divide-y divide-[#dedbd4]">
                  {rows.map((row) => (
                    <tr key={row.externalId} className="align-top transition hover:bg-[#f8f7f3]">
                      <td className="px-5 py-5 text-xs font-semibold text-[#8d8b84]">{String(row.rank).padStart(2, "0")}</td>
                      <td className="max-w-[330px] px-5 py-5">
                        <Link href={`/businesses/${encodeURIComponent(row.externalId)}`} className="text-[15px] font-medium hover:underline">{row.businessName}</Link>
                        <p className="mt-1 truncate text-xs text-[#77766f]">{row.formattedAddress ?? "Address unavailable"}</p>
                        <div className="mt-2 flex gap-4 text-[10px] font-semibold uppercase tracking-[0.09em]"><Link href={`/businesses/${encodeURIComponent(row.externalId)}`} className="hover:underline">Details →</Link>{row.websiteUrl && <a href={row.websiteUrl} target="_blank" rel="noreferrer" className="text-[#77766f] hover:underline">Website ↗</a>}</div>
                      </td>
                      <td className="px-5 py-5"><Score value={row.websiteScore} /></td>
                      <td className="max-w-[280px] px-5 py-5"><p className="text-sm font-medium">{row.bestOpportunity?.title ?? "No eligible opportunity"}</p><p className="mt-1 text-[11px] text-[#8a8982]">{row.bestOpportunity ? serviceLabel(row.bestOpportunity.recommendedService) : row.intelligenceAvailable ? "Analyzed" : "Awaiting analysis"}</p></td>
                      <td className="px-5 py-5">{row.bestOpportunity ? <span className={`inline-block border px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.1em] ${priorityClasses[row.bestOpportunity.priority]}`}>{row.bestOpportunity.priority}</span> : <span className="text-sm text-[#aaa8a1]">—</span>}</td>
                      <td className="px-5 py-5 text-xs font-semibold">{row.bestOpportunity?.confidence ?? "—"}</td>
                      <td className="px-5 py-5 font-editorial text-2xl">{row.opportunityCount}</td>
                      <td className="px-5 py-5"><span className={`inline-block border px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.1em] ${row.intelligenceAvailable ? "border-[#759080] text-[#2f493d]" : "border-[#aaa8a1] text-[#77766f]"}`}>{row.intelligenceAvailable ? "Analyzed" : "Not analyzed"}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {rows.length === 0 && <div className="px-5 py-16 text-center"><p className="font-editorial text-2xl">No businesses match these filters.</p><p className="mt-2 text-xs uppercase tracking-[0.1em] text-[#77766f]">Change or clear the filters to see more of this market.</p></div>}
          </section>

          <footer className="grid gap-4 px-5 py-5 text-[10px] uppercase leading-5 tracking-[0.09em] text-[#77766f] sm:px-6 lg:grid-cols-[auto_1fr]">
            <strong className="text-[#33332f]">Data note</strong>
            <p>Google Places business content is refreshed live and is not persisted by the dashboard. Website Scores and opportunities come from immutable TEQQI analysis runs. Commercial Lead Score remains intentionally unavailable until a business-level model is implemented.</p>
          </footer>
        </>
      ) : (
        <section className="px-6 py-28 text-center">
          <p className="font-editorial text-[34px]">No market intelligence yet</p>
          <p className="mx-auto mt-3 max-w-lg text-xs uppercase leading-5 tracking-[0.1em] text-[#77766f]">Run Business Discovery to create a market. TEQQI OS will automatically analyze eligible websites and organize the resulting opportunity intelligence.</p>
          <button onClick={() => setShowDiscovery(true)} className="mt-7 bg-[#2f493d] px-6 py-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-white">Search market →</button>
        </section>
      )}
    </main>
  );
}
