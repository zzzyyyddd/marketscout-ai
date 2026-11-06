'use client';

import { useState } from 'react';
import { checkPublicPaymentPreflight } from '@/lib/public-payment-preflight';
import {
  validatePublicPaymentQuote,
  type PublicPaymentQuote,
} from '@/lib/public-payment-validation';

export default function PaymentQuoteReview({
  username,
}: {
  username: string;
}) {
  const [quote, setQuote] = useState<PublicPaymentQuote | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [walletReady, setWalletReady] = useState(false);
  const [walletAddress, setWalletAddress] = useState('');
  const [walletError, setWalletError] = useState('');
  const [checkingWallet, setCheckingWallet] = useState(false);

  async function checkWallet() {
    if (!quote) return;

    setCheckingWallet(true);
    setWalletReady(false);
    setWalletError('');

    try {
      const result = await checkPublicPaymentPreflight(quote);
      setWalletAddress(result.payer);
      setWalletReady(true);
    } catch (cause) {
      setWalletError(
        cause instanceof Error ? cause.message : 'Wallet check failed'
      );
    } finally {
      setCheckingWallet(false);
    }
  }

  async function reviewQuote() {
    setLoading(true);
    setError('');
    setQuote(null);
    setWalletReady(false);
    setWalletAddress('');
    setWalletError('');

    try {
      const response = await fetch('/api/payment/quote', {
        cache: 'no-store',
      });

      if (!response.ok) {
        throw new Error('Payment quote unavailable');
      }

      const data: unknown = await response.json();
      setQuote(validatePublicPaymentQuote(data));
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Unable to validate payment quote'
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-4 rounded-xl border border-emerald-400/20 bg-slate-950/70 p-4">
      <h4 className="font-semibold text-white">
        Live x402 Scan — Payment Preview
      </h4>

      <p className="mt-2 text-sm text-slate-300">
        No saved report for @{username}. Review the Celo Mainnet
        payment quote before a future live scan.
      </p>

      <button
        type="button"
        onClick={reviewQuote}
        disabled={loading}
        className="mt-3 rounded-lg border border-emerald-400 px-4 py-2 text-sm font-semibold text-emerald-300 disabled:opacity-50"
      >
        {loading ? 'Checking quote...' : 'Review 0.005 USDC Quote'}
      </button>

      {quote && (
        <div role="status" className="mt-4 space-y-2 text-sm text-slate-300">
          <p>
            Network: <strong className="text-white">Celo Mainnet</strong>
          </p>
          <p>
            Price: <strong className="text-white">{quote.amountAtomic === '5000' ? '0.005 USDC' : 'Invalid amount'}</strong>
          </p>
          <p className="break-all">
            Recipient: {quote.recipient}
          </p>
          <p className="break-all">
            Token: {quote.token}
          </p>
          <button
            type="button"
            onClick={checkWallet}
            disabled={checkingWallet}
            className="rounded-lg border border-sky-400 px-4 py-2 font-semibold text-sky-300 disabled:opacity-50"
          >
            {checkingWallet ? 'Checking wallet...' : 'Check Wallet Readiness'}
          </button>

          {walletReady && (
            <p className="break-all text-emerald-300">
              Wallet ready: {walletAddress}. No payment authorized.
            </p>
          )}

          {walletError && (
            <p role="alert" className="text-red-300">
              {walletError}
            </p>
          )}

          <p className="text-amber-300">
            Wallet readiness does not authorize payment. Signing is requested only after you confirm a live scan.
          </p>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-3 text-sm text-red-300">
          {error}
        </p>
      )}
    </div>
  );
}
