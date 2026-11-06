'use client';

import { useEffect, useRef, useState } from 'react';
import { isCompetitorReport } from '@/lib/report';
import type { CompetitorReport } from '@/lib/report';
import { Search, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import PaymentQuoteReview from './payment-quote-review';
import {
  validatePublicPaymentExecutionResult,
} from '@/lib/public-payment-client';
import PublicPaymentPanel from './public-payment-panel';

type SearchResult =
  | { status: 'cached'; username: string; historical: boolean }
  | { status: 'not_cached'; username: string }
  | { status: 'error'; message: string }
  | null;

export default function UsernameSearch({
  cachedUsername,
  onReportSelected,
  onSearchStarted,
  onReportUnavailable,
  onLiveReportSelected,
}: {
  cachedUsername: string;
  onReportSelected?: (
    report: CompetitorReport,
    mode: string,
    network?: string
  ) => void;
  onSearchStarted?: () => void;
  onReportUnavailable?: () => void;
  onLiveReportSelected?: (
    report: CompetitorReport,
    txHash: string,
  ) => void;
}) {
  // Handles a response after a future, explicitly enabled payment.
  // This function does not sign, send, or initiate a payment.
  function handlePaymentResult(raw: unknown) {
    const result = validatePublicPaymentExecutionResult(raw);

    if (result.status === 'settled') {
      onLiveReportSelected?.(result.report, result.txHash);
      return;
    }

    if (result.status === 'unresolved') {
      setResult({
        status: 'error',
        message:
          'Payment status uncertain. Do not pay again. ' +
          'Reservation: ' + result.reservationId,
      });
      return;
    }

    setResult({
      status: 'error',
      message:
        'Payment confirmed, but the report is unavailable. ' +
        'Do not pay again. Transaction: ' + result.txHash,
    });
  }

  void handlePaymentResult;
  const [username, setUsername] = useState('');
  const [result, setResult] = useState<SearchResult>(null);
  const [loading, setLoading] = useState(false);
  const requestRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => requestRef.current?.abort();
  }, []);

  async function handleSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const normalized = username.trim().replace(/^@/, '').toLowerCase();

    if (
      !/^[a-z0-9._]{1,30}$/.test(normalized) ||
      normalized.startsWith('.') ||
      normalized.endsWith('.') ||
      normalized.includes('..')
    ) {
      onReportUnavailable?.();
      setResult({
        status: 'error',
        message: 'Enter a valid Instagram username.',
      });
      return;
    }

    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;

    setLoading(true);
    setResult(null);
    onSearchStarted?.();

    try {
      const response = await fetch(
        `/api/profile?username=${encodeURIComponent(normalized)}`,
        { cache: 'no-store', signal: controller.signal }
      );

      if (!response.ok) {
        throw new Error('Profile lookup failed.');
      }

      const data = await response.json();

      if (controller.signal.aborted) return;

      if (data.status === 'cached' && data.username === normalized) {
        if (
          !isCompetitorReport(data.report) ||
          data.report.username.toLowerCase() !== normalized ||
          typeof data.mode !== 'string' ||
          (data.network !== undefined && typeof data.network !== 'string')
        ) {
          throw new Error('Invalid cached report.');
        }

        if (!onReportSelected && normalized !== cachedUsername.toLowerCase()) {
          throw new Error('Dashboard is not connected.');
        }

        onReportSelected?.(
          data.report,
          data.mode,
          data.network
        );

        setResult({
          status: 'cached',
          username: normalized,
          historical:
            data.mode === 'historical_snapshot' &&
            normalized === 'instagram' &&
            data.network === 'celo-sepolia',
        });

        requestAnimationFrame(() => {
          if (controller.signal.aborted) return;
          document.getElementById('competitor-report')?.scrollIntoView({
            behavior: 'smooth',
          });
        });
      } else if (
        data.status === 'not_cached' &&
        data.username === normalized
      ) {
        onReportUnavailable?.();
        setResult({ status: 'not_cached', username: normalized });
      } else {
        throw new Error('Unexpected API response.');
      }
    } catch {
      if (controller.signal.aborted) return;
      onReportUnavailable?.();
      setResult({
        status: 'error',
        message: 'Unable to check this profile. Please try again.',
      });
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null;
        setLoading(false);
      }
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

      <PublicPaymentPanel />

      <form onSubmit={handleSearch} className="flex flex-col gap-3 sm:flex-row">
        <input
          value={username}
          onChange={(event) => {
            requestRef.current?.abort();
            requestRef.current = null;
            setLoading(false);
            setUsername(event.target.value);
            setResult(null);
            onReportUnavailable?.();
          }}
          placeholder="@instagram"
          aria-label="Instagram username"
          maxLength={31}
          className="min-w-0 flex-1 rounded-xl border border-white/20 bg-slate-950 px-4 py-3 text-white outline-none focus:border-emerald-400 disabled:opacity-60"
        />

        <button
          type="submit"
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-400 px-6 py-3 font-semibold text-slate-950 transition hover:bg-emerald-300 disabled:opacity-60"
        >
          {loading ? <Loader2 size={18} className="animate-spin" /> : <Search size={18} />}
          {loading ? 'Checking...' : 'View Saved Report'}
        </button>
      </form>

      <div className="mt-3">
        <button
          type="button"
          disabled
          aria-label="Pay 0.005 USDC and scan live, currently unavailable"
          title="Live Mainnet payments are not enabled yet"
          className="w-full cursor-not-allowed rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-5 py-3 text-sm font-semibold text-emerald-200 opacity-60"
        >
          Pay 0.005 USDC & Scan Live — Coming Soon
        </button>
      </div>

      {result?.status === 'cached' && (
        <div role="status" className="mt-4 flex items-start gap-2 text-sm text-emerald-300">
          <CheckCircle2 size={18} className="shrink-0" />
          <p>
            {result.historical
              ? 'Historical snapshot'
              : 'Cached report'} found for @{result.username}.
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

      {result?.status === 'not_cached' && (
        <PaymentQuoteReview username={result.username} />
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
