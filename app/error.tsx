'use client';

import Link from 'next/link';

type ErrorPageProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function GlobalError({ error, reset }: ErrorPageProps) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-slate-100">
      <div className="w-full max-w-lg space-y-6 rounded-2xl border border-slate-800 bg-slate-900/80 p-8 shadow-xl">
        <div className="space-y-2">
          <p className="text-sm uppercase tracking-[0.25em] text-rose-300">Something went wrong</p>
          <h1 className="text-3xl font-semibold">We hit an unexpected error</h1>
          <p className="text-slate-300">
            The app could not complete that action. You can retry now or return to the dashboard.
          </p>
        </div>

        <div className="rounded-lg border border-rose-900 bg-rose-950/50 px-4 py-3 text-sm text-rose-200">
          <p className="font-medium">Unexpected application error</p>
          {error.digest ? <p className="mt-1 text-xs text-rose-300/80">Reference: {error.digest}</p> : null}
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={reset}
            className="rounded-lg bg-sky-500 px-4 py-2 font-medium text-white transition hover:bg-sky-400"
          >
            Try again
          </button>
          <Link
            href="/"
            className="rounded-lg border border-slate-700 px-4 py-2 font-medium text-slate-100 transition hover:border-slate-500"
          >
            Go to dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}
