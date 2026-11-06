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
import { buildBrowserPublicPayment } from '@/lib/build-browser-public-payment';
import { validatePublicPaymentQuote } from '@/lib/public-payment-validation';
import { canOfferPaidReportRecovery, canSafelyResumePayment, paymentButtonLabel, type PendingPaymentStep } from '@/lib/payment-ui-state';

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
  function handlePaymentResult(raw: unknown, reservationId: string, target: string) {
    const result = validatePublicPaymentExecutionResult(raw);
    if (result.reservationId.toLowerCase() !== reservationId.toLowerCase() ||
        (result.status === 'settled' && result.report.username.toLowerCase() !== target)) {
      throw new Error('Payment response does not match this scan. Do not pay again.');
    }

    setRecoveryId(result.reservationId);
    setPaymentStep(result.status);
    // Storage can fail after the paid response arrives. Keep delivery and the
    // recovery link available even when the browser receipt cannot be updated.
    try {
      const pending = JSON.parse(localStorage.getItem('marketscout_pending_payment_v1') ?? '{}');
      localStorage.setItem('marketscout_pending_payment_v1', JSON.stringify({ ...pending, reservationId: result.reservationId, status: result.status }));
    } catch { /* The pre-payment receipt and visible recovery ID remain available. */ }
    if (result.status === 'settled') {
      try {
        localStorage.setItem('marketscout_last_paid_report_v1', JSON.stringify({ reservationId: result.reservationId }));
        localStorage.removeItem('marketscout_pending_payment_v1');
      } catch { /* A receipt failure must not hide a durably stored report. */ }
      setCompleted(true);
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
        'Do not pay again. Reservation: ' + result.reservationId +
        '. Transaction: ' + result.txHash +
        '. Recovery: /recover',
    });
  }

  const [completed, setCompleted] = useState(false);
  const [recoveryId, setRecoveryId] = useState('');
  const operationRef = useRef(false);
  const [paying, setPaying] = useState(false);
  const [paymentLocked, setPaymentLocked] = useState(true);
  const [paymentStateChecked, setPaymentStateChecked] = useState(false);
  const [paymentStep, setPaymentStep] = useState<PendingPaymentStep>(null);
  const [paymentMessage, setPaymentMessage] = useState('');
  const [paymentEnabled, setPaymentEnabled] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/payment/quote', { cache: 'no-store', signal: controller.signal })
      .then(async response => {
        if (!response.ok) return;
        const quote = validatePublicPaymentQuote(await response.json());
        if (!controller.signal.aborted) setPaymentEnabled(quote.signingEnabled);
      })
      .catch(() => { /* Remain disabled if readiness cannot be verified. */ });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
    if (!active) return;
    try {
      const previous = localStorage.getItem('marketscout_pending_payment_v1');
      if (previous) {
        const pending = JSON.parse(previous) as { reservationId?: string; username?: string; status?: string };
        setRecoveryId(pending.reservationId ?? '');
        setPaymentStep((pending.status ?? null) as PendingPaymentStep);
        if (canSafelyResumePayment(pending.status)) {
          setPaymentLocked(false);
          setPaymentMessage('No payment request was submitted. Resume this same request; no charge can have been initiated from this saved state.');
        } else {
          setPaymentLocked(true);
          setPaymentMessage('A payment request may have been submitted. Do not pay again; check its saved report or recovery status.');
        }
      } else {
        const last = localStorage.getItem('marketscout_last_paid_report_v1');
        if (last) {
          setRecoveryId(JSON.parse(last).reservationId ?? '');
          setCompleted(true);
          setPaymentLocked(true);
        } else setPaymentLocked(false);
      }
      setPaymentStateChecked(true);
    } catch {
      setPaymentStep('unresolved');
      setPaymentLocked(true);
      setPaymentStateChecked(true);
      setPaymentMessage(
        'Unable to verify previous payment state. Do not pay again.'
      );
    }
    });
    return () => { active = false; };
  }, []);

  async function handleLivePayment() {
    if (!paymentEnabled) return;
    if (operationRef.current || paying || paymentLocked) return;

    let previousPending: { reservationId?: string; username?: string; status?: string } | null = null;
    try {
      const stored = localStorage.getItem('marketscout_pending_payment_v1');
      if (stored) previousPending = JSON.parse(stored);
      if (previousPending && !canSafelyResumePayment(previousPending.status)) {
        setPaymentLocked(true);
        setPaymentMessage('A payment request may have been submitted. Do not pay again until its status is verified.');
        return;
      }
    } catch {
      setPaymentLocked(true);
      setPaymentMessage('Payment state unavailable. Do not pay again.');
      return;
    }

    const target = username.trim().replace(/^@/, '').toLowerCase();

    if (!/^[a-z0-9._]{1,30}$/.test(target) ||
        target.startsWith('.') || target.endsWith('.') ||
        target.includes('..')) {
      setPaymentMessage('Enter a valid Instagram username.');
      return;
    }
    if (previousPending && previousPending.username !== target) {
      setPaymentMessage('Resume the existing request for @' + (previousPending.username ?? 'the saved username') + ' first.');
      return;
    }

    operationRef.current = true;
    setPaying(true);
    setPaymentMessage('');

    let authorizationCreated = false;
    let executionRequestStarted = false;
    let operationId: string | undefined;

    try {
      const quoteResponse = await fetch('/api/payment/quote', {
        cache: 'no-store',
      });

      if (!quoteResponse.ok) throw new Error('Payment quote unavailable');

      const quote = validatePublicPaymentQuote(await quoteResponse.json());

      if (!quote.signingEnabled || !quote.controlledTest) {
        throw new Error('Payment signing is not enabled');
      }
      if (quote.controlledTest.username !== target) throw new Error('Enter the approved test username: @' + quote.controlledTest.username);

      const confirmed = window.confirm(
        'Authorize a payment of 0.005 USDC on Celo Mainnet ' +
        'for a live Instagram scan of @' + target + '?\n\n' +
        'Recipient: ' + quote.recipient + '\n\n' +
        'Do not retry if payment status becomes uncertain.'
      );

      if (!confirmed) return;

      const reservationId = quote.controlledTest.reservationId;
      const activeReservationId = previousPending?.reservationId ?? reservationId;
      operationId = activeReservationId;
      localStorage.setItem('marketscout_pending_payment_v1', JSON.stringify({ reservationId: activeReservationId, username: target, status: 'signing' }));
      setPaymentStep('signing');
      setPaymentLocked(true);
      setRecoveryId(activeReservationId);
      const payment = await buildBrowserPublicPayment(quote, target);
      authorizationCreated = true;
      setPaymentLocked(true);
      setPaymentStep('authorization_ready_v2');

      try {
        localStorage.setItem(
          'marketscout_pending_payment_v1',
          JSON.stringify({
            reservationId: activeReservationId,
            username: target,
            payer: payment.payer,
            createdAt: new Date().getTime(),
            status: 'authorization_ready_v2',
          })
        );
      } catch {
        throw new Error(
          'Cannot safely persist payment authorization. ' +
          'Do not pay again until status is verified.'
        );
      }

      // Persist this conservative state before the request. From this point a
      // network interruption can no longer be treated as a pre-payment retry.
      localStorage.setItem('marketscout_pending_payment_v1', JSON.stringify({
        reservationId: activeReservationId,
        username: target,
        payer: payment.payer,
        createdAt: new Date().getTime(),
        status: 'submitting',
      }));
      setPaymentStep('submitting');
      executionRequestStarted = true;

      const response = await fetch('/api/payment/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reservationId: activeReservationId,
          username: target,
          payer: payment.payer,
          paymentHeader: payment.paymentHeader,
        }),
      });

      const data: unknown = await response.json();

      if (response.status !== 200 && response.status !== 202) {
        throw new Error('Payment execution failed. Do not pay again.');
      }

      handlePaymentResult(data, activeReservationId, target);
      setPaymentMessage(
        response.status === 200
          ? 'Payment verified. Paid analysis snapshot loaded.'
          : ''
      );
    } catch (cause) {
      if (!authorizationCreated && operationId) {
        try {
          const current = JSON.parse(localStorage.getItem('marketscout_pending_payment_v1') ?? '{}');
          if (current.reservationId === operationId) localStorage.removeItem('marketscout_pending_payment_v1');
          setPaymentStep(null);
          setPaymentLocked(false);
        } catch { setPaymentStep('unresolved'); setPaymentLocked(true); }
      } else if (authorizationCreated && !executionRequestStarted) {
        // Signing completed, but the durable pre-request marker was not written,
        // so /api/payment/execute has not been called and this is safe to resume.
        setPaymentLocked(false);
      }
      setPaymentMessage(
        authorizationCreated && !executionRequestStarted
          ? 'No payment request was submitted. Resume this same reservation when ready.'
          : (cause instanceof Error ? cause.message : 'Payment failed') +
            (authorizationCreated ? ' Do not pay again.' : '')
      );
    } finally {
      operationRef.current = false;
      setPaying(false);
    }
  }
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
        Explore saved Instagram reports or purchase a new analysis snapshot
        for 0.005 USDC on Celo Mainnet.
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
          disabled={!paymentEnabled || paying || paymentLocked}
          onClick={handleLivePayment}
          aria-label="Pay 0.005 USDC for one analysis snapshot"
          className="w-full cursor-pointer rounded-xl border border-emerald-400 bg-emerald-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {paymentButtonLabel({ enabled: paymentEnabled, paying, locked: paymentLocked, completed, stateChecked: paymentStateChecked, step: paymentStep })}
        </button>
      </div>

      {canOfferPaidReportRecovery(paymentStep) && <a className="mt-3 block text-emerald-400 underline" href={recoveryId ? `/recover?reservation=${encodeURIComponent(recoveryId)}` : '/recover'}>Recover payment / report — no new payment</a>}
      {paymentMessage && (
        <p role="status" className="mt-3 text-sm text-amber-300">
          {paymentMessage}
        </p>
      )}

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
            A live scan requires wallet authorization when enabled.
            No payment was made by this lookup.
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
