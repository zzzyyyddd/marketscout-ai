'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createWalletClient, custom, getAddress, type Address } from 'viem';
import { celo } from 'viem/chains';
import { ArrowLeft, CheckCircle2, Loader2, ShieldCheck, Sparkles } from 'lucide-react';
import CompetitorDashboard from '../competitor-dashboard';
import { isCompetitorReport, type CompetitorReport } from '@/lib/report';
import { paidReportKey, pendingPaymentKey } from '@/lib/payment-ui-state';

type Challenge = {
  message: string;
  nonce: string;
  issuedAt: string;
  expiresAt: string;
};

export default function RecoverPage() {
  const [reservationId, setReservationId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [report, setReport] = useState<CompetitorReport | null>(null);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
    if (!active) return;
    const fromUrl = new URLSearchParams(window.location.search).get('reservation');
    if (fromUrl) setReservationId(fromUrl);
    else {
      try {
        const pending = JSON.parse(localStorage.getItem('marketscout_pending_payment_v1') ?? '{}');
        const last = JSON.parse(localStorage.getItem('marketscout_last_paid_report_v1') ?? '{}');
        setReservationId(pending.reservationId ?? last.reservationId ?? '');
      } catch { /* Manual ID entry remains available. */ }
    }
    });
    return () => { active = false; };
  }, []);

  async function recover() {
    setBusy(true);
    setError('');
    setReport(null);

    try {
      const provider = (window as Window & {
        ethereum?: Parameters<typeof custom>[0];
      }).ethereum;

      if (!provider) throw new Error('Connect MetaMask or Rabby first');

      const wallet = createWalletClient({
        chain: celo,
        transport: custom(provider),
      });

      const accounts = await wallet.requestAddresses();
      const account: Address = getAddress(accounts[0]);

      async function post(payload: Record<string, unknown>) {
        const response = await fetch('/api/report-recovery', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          cache: 'no-store',
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error ?? 'Recovery failed');
        }

        return data;
      }

      const challenge = await post({
        action: 'challenge',
        reservationId: reservationId.trim(),
        payer: account,
      }) as Challenge;

      const signature = await wallet.signMessage({
        account,
        message: challenge.message,
      });

      const result = await post({
        action: 'redeem',
        reservationId: reservationId.trim(),
        payer: account,
        nonce: challenge.nonce,
        issuedAt: challenge.issuedAt,
        expiresAt: challenge.expiresAt,
        signature,
      });

      if (result.status !== 'recovered' || !isCompetitorReport(result.report)) throw new Error(result.error ?? 'Recovery pending. Do not pay again.');
      setReport(result.report);
      try {
        localStorage.setItem(paidReportKey(reservationId.trim()), JSON.stringify({ reservationId: reservationId.trim() }));
        const key = pendingPaymentKey(reservationId.trim());
        const pending = JSON.parse(localStorage.getItem(key) ?? '{}');
        if (pending.reservationId?.toLowerCase() === reservationId.trim().toLowerCase()) localStorage.removeItem(key);
      } catch { /* Render the recovered report even if browser storage fails. */ }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Recovery failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto max-w-7xl px-5 pb-20 pt-8 sm:px-8 lg:px-12">
        <nav aria-label="Main navigation" className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-6">
          <Link href="/" className="inline-flex items-center gap-2 text-lg font-bold tracking-tight text-white"><Sparkles size={20} className="text-emerald-400" aria-hidden="true" /> MarketScout AI</Link>
          <Link href="/" className="inline-flex items-center gap-2 text-sm text-slate-300 transition hover:text-emerald-300"><ArrowLeft size={16} aria-hidden="true" /> Back to MarketScout AI</Link>
        </nav>

        <div className="mx-auto mt-10 max-w-3xl sm:mt-14">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400">Your saved intelligence</p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Recover your report</h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-400 sm:text-base">Use the wallet that purchased your snapshot to retrieve the exact saved report. No payment or token approval is required.</p>

          <div className="mt-8 rounded-2xl border border-white/10 bg-slate-900/70 p-5 shadow-xl shadow-black/10 sm:p-7">
            <label className="block text-sm font-medium text-slate-200" htmlFor="reservation">Payment reservation ID</label>
            <input
              id="reservation"
              value={reservationId}
              onChange={(event) => setReservationId(event.target.value)}
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              className="mt-2 w-full rounded-xl border border-white/15 bg-slate-950 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20"
            />
            <button
              type="button"
              onClick={recover}
              disabled={busy || !reservationId.trim()}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
            >
              {busy ? <><Loader2 size={17} className="animate-spin" aria-hidden="true" /> Recovering report…</> : <><ShieldCheck size={17} aria-hidden="true" /> Sign & Recover Report</>}
            </button>
            <p className="mt-3 text-xs leading-relaxed text-slate-500">Your wallet signs an ownership message to unlock your saved report.</p>
            {error && <p role="alert" className="mt-4 rounded-lg border border-red-400/25 bg-red-400/10 p-3 text-sm text-red-300">{error}</p>}
            {busy && <p role="status" className="sr-only">Recovering your saved report</p>}
          </div>
        </div>

        {report && (
          <div className="mt-12 sm:mt-16">
            <div role="status" className="mb-8 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-emerald-400/25 bg-emerald-400/10 p-5 sm:p-6">
              <div className="flex items-start gap-3"><CheckCircle2 className="mt-0.5 shrink-0 text-emerald-400" size={22} aria-hidden="true" /><div><h2 className="font-semibold text-emerald-300">Report recovered successfully</h2><p className="mt-1 text-sm text-slate-300">Historical snapshot — not a new live scan</p></div></div>
              <span className="rounded-full border border-emerald-400/30 bg-slate-950/50 px-3 py-1.5 text-xs font-medium text-emerald-300">No additional payment</span>
            </div>
            <CompetitorDashboard report={report} historical={false} />
          </div>
        )}
      </div>
    </main>
  );
}
