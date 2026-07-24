"use client";

import { FormEvent, useMemo, useState } from "react";

type BusinessResult = {
  provider: "GOOGLE_PLACES";
  externalId: string;
  name: string;
  websiteUrl: string | null;
  phone: string | null;
  formattedAddress: string | null;
  latitude: number | null;
  longitude: number | null;
  rating: number | null;
  providerStatus: string | null;
  resultPosition: number;
};

type SearchResponse = {
  ok: boolean;
  searchId: string;
  query: string;
  provider: "GOOGLE_PLACES";
  requestedMaxResults: number;
  returnedResults: number;
  results: BusinessResult[];
  discovery: {
    mode: "NEW_RESULTS_ONLY";
    previouslyDiscoveredCount: number;
    requestedNewResults: number;
    returnedNewResults: number;
    exhaustedAvailableNewResults: boolean;
  };
};

type ErrorResponse = {
  ok: false;
  error?: {
    code?: string;
    message?: string;
  };
};

const resultOptions = [5, 10, 20, 40, 60];

function formatPhone(phone: string | null) {
  return phone ?? "Not available";
}

function WebsiteLink({ url }: { url: string | null }) {
  if (!url) return <span className="text-slate-400">No website found</span>;

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="font-medium text-indigo-600 hover:text-indigo-800 hover:underline"
    >
      Visit website ↗
    </a>
  );
}

export default function Home() {
  const [industry, setIndustry] = useState("");
  const [location, setLocation] = useState("");
  const [maxResults, setMaxResults] = useState(20);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState<SearchResponse | null>(null);

  const resultLabel = useMemo(() => {
    if (!search) return null;
    return `${search.returnedResults} new ${search.returnedResults === 1 ? "business" : "businesses"} found`;
  }, [search]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const response = await fetch("/api/businesses/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ industry, location, maxResults }),
      });

      const data = (await response.json()) as SearchResponse | ErrorResponse;

      if (!response.ok || !data.ok) {
        const failed = data as ErrorResponse;
        throw new Error(failed.error?.message ?? "Business search failed.");
      }

      setSearch(data as SearchResponse);
    } catch (searchError) {
      setError(
        searchError instanceof Error
          ? searchError.message
          : "Something went wrong while searching for businesses.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f7f8fb] text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-950 text-sm font-bold text-white">
              TQ
            </div>
            <div>
              <p className="font-semibold leading-none">TEQQI OS</p>
              <p className="mt-1 text-xs text-slate-500">Lead intelligence workspace</p>
            </div>
          </div>
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
            Phase 5 · Business Discovery
          </span>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-6 py-10 lg:px-8 lg:py-14">
        <section className="mb-8 max-w-3xl">
          <p className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-indigo-600">
            Business Discovery
          </p>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            Find your next batch of new leads.
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600 sm:text-lg">
            Search a market by industry and location. TEQQI OS automatically excludes businesses
            you have already discovered, so each new search focuses on fresh results.
          </p>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <form onSubmit={handleSubmit} className="grid gap-4 lg:grid-cols-[1fr_1fr_180px_auto] lg:items-end">
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-slate-700">Industry</span>
              <input
                value={industry}
                onChange={(event) => setIndustry(event.target.value)}
                placeholder="e.g. Dentists"
                required
                className="h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-sm outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-slate-700">City / location</span>
              <input
                value={location}
                onChange={(event) => setLocation(event.target.value)}
                placeholder="e.g. Ottawa"
                required
                className="h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-sm outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-slate-700">Maximum results</span>
              <select
                value={maxResults}
                onChange={(event) => setMaxResults(Number(event.target.value))}
                className="h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-sm outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
              >
                {resultOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="submit"
              disabled={isLoading}
              className="h-12 rounded-xl bg-slate-950 px-6 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              {isLoading ? "Searching…" : "Find new businesses"}
            </button>
          </form>

          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span className="rounded-full bg-indigo-50 px-2.5 py-1 font-semibold text-indigo-700">New results only</span>
            <span>Previously discovered Google Place IDs are excluded from every new search.</span>
          </div>
        </section>

        {error && (
          <div className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {isLoading && (
          <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm">
            <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-slate-950" />
            <p className="font-semibold">Searching for new businesses…</p>
            <p className="mt-1 text-sm text-slate-500">
              Checking Google Places and excluding previously discovered results.
            </p>
          </section>
        )}

        {!isLoading && search && (
          <section className="mt-8 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-col gap-4 border-b border-slate-200 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-xl font-bold">{resultLabel}</h2>
                  <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                    Fresh discovery
                  </span>
                </div>
                <p className="mt-1 text-sm text-slate-500">{search.query}</p>
              </div>

              <div className="grid grid-cols-2 gap-3 text-right sm:flex sm:gap-6">
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-400">Requested</p>
                  <p className="font-semibold">{search.discovery.requestedNewResults}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-400">Found</p>
                  <p className="font-semibold">{search.discovery.returnedNewResults}</p>
                </div>
              </div>
            </div>

            {search.results.length === 0 ? (
              <div className="px-6 py-16 text-center">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-xl">✓</div>
                <h3 className="font-semibold">No new businesses found</h3>
                <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-500">
                  TEQQI OS did not find any businesses in the available Google results that have not already been discovered. Try a different industry, location, or more specific search term.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] border-collapse text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-6 py-3 font-semibold">#</th>
                      <th className="px-4 py-3 font-semibold">Business</th>
                      <th className="px-4 py-3 font-semibold">Website</th>
                      <th className="px-4 py-3 font-semibold">Phone</th>
                      <th className="px-4 py-3 font-semibold">Address</th>
                      <th className="px-4 py-3 font-semibold">Rating</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {search.results.map((business) => (
                      <tr key={business.externalId} className="align-top transition hover:bg-slate-50/80">
                        <td className="px-6 py-4 font-mono text-xs text-slate-400">{business.resultPosition}</td>
                        <td className="px-4 py-4">
                          <p className="font-semibold text-slate-900">{business.name}</p>
                          <p className="mt-1 text-xs text-slate-400">New business</p>
                        </td>
                        <td className="px-4 py-4"><WebsiteLink url={business.websiteUrl} /></td>
                        <td className="px-4 py-4 whitespace-nowrap text-slate-600">{formatPhone(business.phone)}</td>
                        <td className="max-w-xs px-4 py-4 leading-6 text-slate-600">
                          {business.formattedAddress ?? "Not available"}
                        </td>
                        <td className="px-4 py-4">
                          {business.rating === null ? (
                            <span className="text-slate-400">—</span>
                          ) : (
                            <span className="inline-flex items-center gap-1 font-semibold">
                              <span className="text-amber-500">★</span> {business.rating.toFixed(1)}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex flex-col gap-2 border-t border-slate-200 bg-slate-50 px-6 py-4 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
              <span>Search ID: {search.searchId}</span>
              <span>Business information provided by Google Places · live search data</span>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
