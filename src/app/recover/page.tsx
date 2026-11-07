'use client';

import { useEffect, useState } from 'react';
import { createWalletClient, custom, getAddress, type Address } from 'viem';
import { celo } from 'viem/chains';
import { isCompetitorReport } from '@/lib/report';
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
  const [report, setReport] = useState<unknown>(null);

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
    <main className="mx-auto max-w-3xl px-6 py-16 text-white">
      <h1 className="text-3xl font-bold">Recover Paid Report</h1>
      <p className="mt-3 text-slate-400">
        Retrieve a previously saved report using your payment wallet.
        No payment or token approval is required.
      </p>

      <label className="mt-8 block text-sm" htmlFor="reservation">
        Payment reservation ID
      </label>
      <input
        id="reservation"
        value={reservationId}
        onChange={(event) => setReservationId(event.target.value)}
        placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
        className="mt-2 w-full rounded-xl border border-white/20 bg-slate-900 p-3"
      />

      <button
        type="button"
        onClick={recover}
        disabled={busy || !reservationId.trim()}
        className="mt-4 rounded-xl bg-emerald-400 px-5 py-3 font-semibold text-slate-950 disabled:opacity-50"
      >
        {busy ? 'Recovering...' : 'Sign & Recover Report'}
      </button>

      {error && (
        <p role="alert" className="mt-5 text-red-400">{error}</p>
      )}

      {report !== null && (
        <section className="mt-8 rounded-xl border border-emerald-400/30 p-5">
          <h2 className="font-semibold text-emerald-400">
            Report recovered successfully
          </h2>
          {isCompetitorReport(report) && <p className="mt-2 text-sm text-slate-400">
            {report.generatedAt ? <>Snapshot generated <time dateTime={report.generatedAt}>{report.generatedAt}</time></> : 'Historical snapshot · generation time not recorded'}
          </p>}
          <pre className="mt-4 overflow-auto whitespace-pre-wrap text-xs">
            {JSON.stringify(report, null, 2)}
          </pre>
        </section>
      )}
    </main>
  );
}
