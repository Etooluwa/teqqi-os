"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type RefreshAnalysisButtonProps = {
  websiteUrl: string | null;
};

type OpportunityRefreshResponse = {
  ok?: boolean;
  error?: {
    message?: string;
  };
};

export function RefreshAnalysisButton({ websiteUrl }: RefreshAnalysisButtonProps) {
  const router = useRouter();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refreshAnalysis() {
    if (!websiteUrl || isRefreshing) return;

    setIsRefreshing(true);
    setError(null);

    try {
      const response = await fetch("/api/websites/opportunities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: websiteUrl }),
      });

      const result = (await response.json().catch(() => null)) as OpportunityRefreshResponse | null;

      if (!response.ok || result?.ok !== true) {
        throw new Error(result?.error?.message ?? "The website analysis could not be refreshed.");
      }

      router.refresh();
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : "The website analysis could not be refreshed.");
    } finally {
      setIsRefreshing(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-2 sm:items-end">
      <button
        type="button"
        onClick={refreshAnalysis}
        disabled={!websiteUrl || isRefreshing}
        className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
      >
        {isRefreshing ? "Refreshing analysis…" : "Refresh analysis"}
      </button>
      {!websiteUrl && <p className="text-xs text-slate-500">A website URL is required to run a fresh audit.</p>}
      {error && <p role="alert" className="max-w-md text-xs leading-5 text-rose-600">{error}</p>}
    </div>
  );
}
