'use client';

import { useState } from 'react';
import { Search, AlertCircle, CheckCircle2 } from 'lucide-react';

type SearchResult =
  | { status: 'cached'; username: string }
  | { status: 'not_cached'; username: string }
  | { status: 'error'; message: string }
  | null;

export default function UsernameSearch({
  cachedUsername,
}: {
  cachedUsername: string;
}) {
  const [username, setUsername] = useState('');
  const [result, setResult] = useState<SearchResult>(null);

  function handleSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const normalized = username.trim().replace(/^@/, '').toLowerCase();

    if (
      !/^[a-z0-9._]{1,30}$/.test(normalized) ||
      normalized.startsWith('.') ||
      normalized.endsWith('.') ||
      normalized.includes('..')
    ) {
      setResult({
        status: 'error',
        message: 'Enter a valid Instagram username.',
      });
      return;
    }

    if (normalized === cachedUsername.toLowerCase()) {
      setResult({
        status: 'cached',
        username: normalized,
      });

      document.getElementById('competitor-report')?.scrollIntoView({
        behavior: 'smooth',
      });
    } else {
      setResult({
        status: 'not_cached',
        username: normalized,
      });
    }
  }

  return (
    <section className="mb-8 rounded-2xl border border-emerald-400/20 bg-emerald-400/5 p-6">
      <div className="mb-4 flex items-center gap-2 text-emerald-400">
        <Search size={20} />
        <h3 className="text-xl font-semibold">
          Analyze Instagram Competitor
        </h3>
      </div>

      <p className="mb-5 text-sm text-slate-300">
        Enter any public Instagram username to check available
        intelligence. New live x402 purchases are not enabled yet.
      </p>

      <form onSubmit={handleSearch} className="flex flex-col gap-3 sm:flex-row">
        <input
          value={username}
          onChange={(event) => {
            setUsername(event.target.value);
            setResult(null);
          }}
          placeholder="@instagram"
          aria-label="Instagram username"
          maxLength={31}
          className="min-w-0 flex-1 rounded-xl border border-white/20 bg-slate-950 px-4 py-3 text-white outline-none focus:border-emerald-400"
        />

        <button
          type="submit"
          className="rounded-xl bg-emerald-400 px-6 py-3 font-semibold text-slate-950 transition hover:bg-emerald-300"
        >
          Analyze
        </button>
      </form>

      {result?.status === 'cached' && (
        <div role="status" className="mt-4 flex items-start gap-2 text-sm text-emerald-300">
          <CheckCircle2 size={18} className="shrink-0" />
          <p>
            Cached historical report found for @{result.username}.
            The report below uses saved data, not a fresh scan.
          </p>
        </div>
      )}

      {result?.status === 'not_cached' && (
        <div role="status" className="mt-4 flex items-start gap-2 text-sm text-amber-300">
          <AlertCircle size={18} className="shrink-0" />
          <p>
            No cached report for @{result.username}.
            Live x402 analysis is not available yet.
            No payment was made.
          </p>
        </div>
      )}

      {result?.status === 'error' && (
        <p role="alert" className="mt-4 text-sm text-red-300">
          {result.message}
        </p>
      )}

      <p className="mt-4 text-xs text-slate-400">
        Try @instagram to explore our verified historical testnet dataset.
      </p>
    </section>
  );
}
