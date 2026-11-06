import 'server-only';

import {
  reserveMainnetAuthorization,
} from './supabase-ledger';
import {
  verifyPublicPaymentSignature,
} from './public-payment-signature';
import {
  MAINNET_PAYMENT_POLICY as POLICY,
} from './payment-mainnet-policy';

export async function reservePublicPaymentAuthorization(
  paymentHeader: string,
  expectedPayer: string,
  username: string,
): Promise<{
  reservationId: string;
  payer: string;
  nonce: string;
}> {
  const verified = await verifyPublicPaymentSignature(
    paymentHeader,
    expectedPayer,
  );

  if (
    verified.amountAtomic !==
    POLICY.maxPerRequestAtomic.toString()
  ) {
    throw new Error('Payment amount outside policy');
  }

  // One atomic database operation: reserve and attach evidence.
  // Never forward payment to the gateway if reservation fails.
  const reservationId = await reserveMainnetAuthorization({
    payer: verified.payer,
    nonce: verified.nonce,
    validAfter: BigInt(verified.validAfter),
    validBefore: BigInt(verified.validBefore),
    username: username.trim().toLowerCase(),
  });

  return {
    reservationId,
    payer: verified.payer,
    nonce: verified.nonce,
  };
}
