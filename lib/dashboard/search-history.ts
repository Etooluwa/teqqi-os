import type { DashboardSearchSummary } from "./types";

export type DashboardHistoryEntry = DashboardSearchSummary & {
  selected: boolean;
  dashboardPath: string;
};

const TABLE_PARAM_NAMES = [
  "priority",
  "confidence",
  "service",
  "analysis",
  "minScore",
  "maxScore",
  "sort",
] as const;

export function buildDashboardHistoryEntries(
  history: readonly DashboardSearchSummary[],
  selectedSearchId: string,
  currentParams: URLSearchParams,
): DashboardHistoryEntry[] {
  const seen = new Set<string>();

  return history.map((entry) => {
    if (seen.has(entry.id)) throw new Error(`Duplicate dashboard search history entry ${entry.id}.`);
    seen.add(entry.id);

    const params = new URLSearchParams();
    params.set("searchId", entry.id);
    for (const name of TABLE_PARAM_NAMES) {
      const value = currentParams.get(name);
      if (value !== null && value.trim() !== "") params.set(name, value);
    }

    return {
      ...entry,
      selected: entry.id === selectedSearchId,
      dashboardPath: `/api/dashboard?${params.toString()}`,
    };
  });
}
