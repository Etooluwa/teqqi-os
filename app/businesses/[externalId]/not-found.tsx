import Link from "next/link";

export default function BusinessDetailNotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f5f7fb] px-4 py-12 text-slate-950">
      <section className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm sm:p-8">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-slate-950 text-sm font-bold text-white">TQ</div>
        <p className="mt-6 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Business unavailable</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">We couldn’t load this business.</h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-slate-500">
          The business may no longer be part of your TEQQI OS discovery history, or the business identifier may be invalid.
        </p>
        <Link href="/" className="mt-6 inline-flex rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800">
          Back to dashboard
        </Link>
      </section>
    </main>
  );
}
