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
  recovery?: {
    resumable?: boolean;
    scoringRunId?: string;
  };
};

export function RefreshAnalysisButton({ websiteUrl }: RefreshAnalysisButtonProps) {
  const router = useRouter();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resumeScoringRunId, setResumeScoringRunId] = useState<string | null>(null);

  async function refreshAnalysis() {
    if (!websiteUrl || isRefreshing) return;

    setIsRefreshing(true);
    setError(null);

    try {
      const response = await fetch("/api/websites/opportunities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: websiteUrl,
          forceRefresh: true,
          ...(resumeScoringRunId ? { resumeScoringRunId } : {}),
        }),
      });

      const result = (await response.json().catch(() => null)) as OpportunityRefreshResponse | null;

      if (!response.ok || result?.ok !== true) {
        const checkpoint = result?.recovery?.resumable === true
          && typeof result.recovery.scoringRunId === "string"
          ? result.recovery.scoringRunId
          : null;
        setResumeScoringRunId(checkpoint);
        throw new Error(
          checkpoint
            ? `${result?.error?.message ?? "The website analysis could not be refreshed."} Retry to resume from the completed scoring checkpoint.`
            : result?.error?.message ?? "The website analysis could not be refreshed.",
        );
      }

      setResumeScoringRunId(null);
      router.refresh();
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : "The website analysis could not be refreshed.");
    } finally {
      setIsRefreshing(false);
    }
  }

  return (
    <div className="flex w-full flex-col items-stretch gap-2 sm:w-auto sm:items-end">
      <button
        type="button"
        onClick={refreshAnalysis}
        disabled={!websiteUrl || isRefreshing}
        aria-busy={isRefreshing}
        className="w-full rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300 sm:w-auto"
      >
        {isRefreshing ? "Refreshing analysis…" : resumeScoringRunId ? "Resume analysis" : "Refresh analysis"}
      </button>
      {!websiteUrl && <p className="max-w-sm text-xs leading-5 text-slate-500">No website was found for this business, so TEQQI OS cannot run a website audit yet.</p>}
      {error && <p role="alert" className="max-w-md text-xs leading-5 text-rose-600">{error}</p>}
    </div>
  );
}
