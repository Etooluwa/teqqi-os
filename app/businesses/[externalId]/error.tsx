"use client";

import Link from "next/link";

export default function BusinessDetailError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f5f7fb] px-4 py-12 text-slate-950">
      <section className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm sm:p-8">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-slate-950 text-sm font-bold text-white">TQ</div>
        <p className="mt-6 text-xs font-semibold uppercase tracking-[0.16em] text-rose-500">Business detail error</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">Something went wrong loading this intelligence.</h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-slate-500">
          Live business data or one of the persisted intelligence sources could not be loaded. You can retry without leaving the page.
        </p>
        <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
          <button type="button" onClick={reset} className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800">
            Try again
          </button>
          <Link href="/" className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            Back to dashboard
          </Link>
        </div>
      </section>
    </main>
  );
}
