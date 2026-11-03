'use client';

import { useState } from 'react';
import { Search, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';

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
  const [loading, setLoading] = useState(false);

  async function handleSearch(event: React.FormEvent<HTMLFormElement>) {
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

    setLoading(true);
    setResult(null);

    try {
      const response = await fetch(
        `/api/profile?username=${encodeURIComponent(normalized)}`,
        { cache: 'no-store' }
      );

      if (!response.ok) {
        throw new Error('Profile lookup failed.');
      }

      const data = await response.json();

      if (data.status === 'cached' && data.username === normalized) {
        if (data.username !== cachedUsername.toLowerCase()) {
          throw new Error('Cached report is not available in this dashboard.');
        }

        setResult({ status: 'cached', username: normalized });

        document.getElementById('competitor-report')?.scrollIntoView({
          behavior: 'smooth',
        });
      } else if (
        data.status === 'not_cached' &&
        data.username === normalized
      ) {
        setResult({ status: 'not_cached', username: normalized });
      } else {
        throw new Error('Unexpected API response.');
      }
    } catch {
      setResult({
        status: 'error',
        message: 'Unable to check this profile. Please try again.',
      });
    } finally {
      setLoading(false);
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
        Search available Instagram intelligence.
        Live x402 purchases are not enabled yet.
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
          disabled={loading}
          className="min-w-0 flex-1 rounded-xl border border-white/20 bg-slate-950 px-4 py-3 text-white outline-none focus:border-emerald-400 disabled:opacity-60"
        />

        <button
          type="submit"
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-400 px-6 py-3 font-semibold text-slate-950 transition hover:bg-emerald-300 disabled:opacity-60"
        >
          {loading ? <Loader2 size={18} className="animate-spin" /> : <Search size={18} />}
          {loading ? 'Checking...' : 'Analyze'}
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
        Try @instagram to explore our historical testnet dataset.
      </p>
    </section>
  );
}
