'use client';

import { useEffect, useState } from 'react';

type Quote = {
  amountUSDC: string;
  network: string;
  recipient: string;
  signingEnabled: boolean;
};

export default function PublicPaymentPanel() {
  const [quote, setQuote] = useState<Quote | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();

    async function loadQuote() {
      try {
        const response = await fetch('/api/payment/quote', {
          cache: 'no-store',
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error('Payment quote unavailable');
        }

        const data = await response.json() as Quote;
        if (!controller.signal.aborted) setQuote(data);
      } catch {
        if (!controller.signal.aborted) {
          setError('Unable to load current Mainnet price');
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void loadQuote();
    return () => controller.abort();
  }, []);


  return (
    <section className="mb-4 rounded-xl border border-emerald-400/20 bg-slate-900 p-4">
      <h2 className="text-xl font-bold text-white">
        Analysis Snapshot Pricing
      </h2>

      <p className="mt-2 text-sm text-slate-400">
        Each payment buys one saved Instagram analysis snapshot with USDC on Celo Mainnet.
      </p>

      {loading && (
        <p className="mt-4 text-sm text-slate-400">
          Checking current gateway price...
        </p>
      )}

      {error && (
        <p className="mt-4 text-sm text-amber-300">
          {error}
        </p>
      )}

      {quote && (
        <div className="mt-5 space-y-3">
          <p className="text-2xl font-bold text-emerald-400">
            {quote.amountUSDC} USDC
            <span className="ml-2 text-sm font-normal text-slate-400">
              per scan
            </span>
          </p>

          <p className="text-xs text-slate-400">
            Network: {quote.network}
          </p>

          <p className="break-all text-xs text-slate-400">
            Recipient: {quote.recipient}
          </p>
        </div>
      )}

      <p className="mt-3 text-xs text-amber-300">
        Live scans require wallet authorization. Review the
        amount, network, and recipient before signing.
      </p>
    </section>
  );
}
