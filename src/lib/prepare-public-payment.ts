import 'client-only';

import type { Address } from 'viem';
import {
  validatePublicPaymentQuote,
  type PublicPaymentQuote,
} from './public-payment-validation';

export type PreparedPublicPayment = {
  payer: Address;
  quote: PublicPaymentQuote;
  requirements: {
    scheme: 'exact';
    network: 'celo';
    maxAmountRequired: string;
    resource: string;
    payTo: string;
    asset: string;
    maxTimeoutSeconds: number;
    extra: {
      name: 'USDC';
      version: '2';
    };
    v2Accepted: PublicPaymentQuote['accepted'];
  };
};

export function preparePublicPayment(
  payer: Address,
  rawQuote: unknown,
): PreparedPublicPayment {
  const quote = validatePublicPaymentQuote(rawQuote);

  if (!/^0x[0-9a-fA-F]{40}$/.test(payer)) {
    throw new Error('Invalid payer address');
  }
  if (quote.signingEnabled && payer.toLowerCase() !== quote.controlledTest?.payer.toLowerCase()) {
    throw new Error('Connect the approved test wallet');
  }

  const requirements = {
    scheme: 'exact' as const,
    network: 'celo' as const,
    maxAmountRequired: quote.amountAtomic,
    resource: quote.resource,
    payTo: quote.recipient,
    asset: quote.token,
    maxTimeoutSeconds: quote.accepted.maxTimeoutSeconds,
    extra: {
      name: 'USDC' as const,
      version: '2' as const,
    },
    v2Accepted: quote.accepted,
  };

  return {
    payer,
    quote,
    requirements,
  };
}
