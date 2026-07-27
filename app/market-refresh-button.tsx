"use client";

import { useState } from "react";

type SearchDetailResponse =
  | {
      ok: true;
      search: {
        industry: string;
        location: string;
        requestedMaxResults: number;
      };
    }
  | { ok: false; error?: { message?: string } };

type DiscoveryResponse =
  | { ok: true; searchId: string; cache?: { forceRefresh?: boolean } }
  | { ok: false; error?: { message?: string } };

export function MarketRefreshButton({ searchId }: { searchId: string }) {
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refreshMarket() {
    if (refreshing) return;
    setRefreshing(true);
    setError(null);

    try {
      const searchResponse = await fetch(`/api/businesses/search/${encodeURIComponent(searchId)}`, { cache: "no-store" });
      const searchBody = (await searchResponse.json()) as SearchDetailResponse;
      if (!searchResponse.ok || !searchBody.ok) {
        throw new Error(!searchBody.ok ? searchBody.error?.message ?? "Could not load the current market." : "Could not load the current market.");
      }

      const response = await fetch("/api/businesses/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          industry: searchBody.search.industry,
          location: searchBody.search.location,
          maxResults: searchBody.search.requestedMaxResults,
          reuseRecent: true,
          forceRefresh: true,
        }),
      });
      const body = (await response.json()) as DiscoveryResponse;
      if (!response.ok || !body.ok) {
        throw new Error(!body.ok ? body.error?.message ?? "Market refresh failed." : "Market refresh failed.");
      }

      window.location.assign("/");
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : "Market refresh failed.");
      setRefreshing(false);
    }
  }

  return (
    <div className="flex flex-col items-stretch gap-1.5 sm:items-end">
      <button
        type="button"
        onClick={refreshMarket}
        disabled={refreshing}
        aria-busy={refreshing}
        className="h-10 border border-[#d9d6cf] bg-[#f8f7f3] px-4 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#2d2d29] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
      >
        {refreshing ? "Refreshing…" : "Refresh market"}
      </button>
      <p className="max-w-xs text-[10px] uppercase leading-4 tracking-[0.08em] text-[#8a8982]">Bypasses cache and requests unseen businesses.</p>
      {error && <p role="alert" className="max-w-xs text-xs leading-5 text-[#9a3f34]">{error}</p>}
    </div>
  );
}
