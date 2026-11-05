import 'server-only';

import type { Hex } from 'viem';
import type { PaymentNetwork } from './payment-network-config';
import type { PaymentAuthorizationMetadata } from './payment-authorization-metadata';
import { verifyOnchainPayment } from './payment-onchain-verifier';
import { settleVerifiedPayment } from './supabase-ledger';

export async function verifyAndSettlePayment(
  reservationId: string,
  txHash: Hex,
  authorization: PaymentAuthorizationMetadata,
  network: PaymentNetwork
): Promise<void> {
  const verification = await verifyOnchainPayment(
    txHash,
    authorization,
    network
  );

  if (verification.status !== 'verified') {
    throw new Error('Onchain verification unresolved');
  }

  await settleVerifiedPayment(
    reservationId,
    verification.txHash,
    authorization.payer,
    authorization.nonce
  );
}
