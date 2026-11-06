import 'client-only';

import { buildPayment } from '@celo/buy-core/x402';
import { isAddress, type Address } from 'viem';

import { createBrowserPaymentSigner } from './browser-payment-signer';
import { checkPublicPaymentPreflight } from './public-payment-preflight';

export async function buildBrowserPublicPayment(
  rawQuote: unknown,
): Promise<{
  payer: Address;
  paymentHeader: string;
}> {
  const preflight = await checkPublicPaymentPreflight(rawQuote);

  const provider = (window as Window & {
    ethereum?: {
      request(args: {
        method: string;
        params?: unknown[];
      }): Promise<unknown>;
    };
  }).ethereum;

  if (!provider) {
    throw new Error('Wallet provider unavailable');
  }

  const account = await createBrowserPaymentSigner(
    provider,
    preflight.payer,
  );

  // This requests an EIP-712 signature when invoked.
  // Creating this module does not sign or spend anything.
  const payTo = preflight.prepared.requirements.payTo;
  const asset = preflight.prepared.requirements.asset;

  if (!isAddress(payTo) || !isAddress(asset)) {
    throw new Error('Invalid payment recipient or USDC address');
  }

  const payment = await buildPayment({
    account,
    requirements: {
      ...preflight.prepared.requirements,
      payTo,
      asset,
      description: 'Instagram competitor profile scan',
      mimeType: 'application/json',
    },
    chainId: preflight.chainId,
    x402Version: 2,
  });

  const payload = {
    ...payment,
    network: preflight.prepared.quote.accepted.network,
    accepted: preflight.prepared.quote.accepted,
  };

  // Browser-compatible base64 encoding.
  const bytes = new TextEncoder().encode(
    JSON.stringify(payload),
  );

  let binary = '';

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return {
    payer: preflight.payer,
    paymentHeader: btoa(binary),
  };
}
