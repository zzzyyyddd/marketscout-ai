import 'server-only';

import {
  validatePaymentRecoveryIdentity,
} from './public-payment-recovery-identity';

export interface RecoveryLookupKey {
  payer: string;
  nonce: string;
  network: 'celo';
}

export function prepareRecoveryLookup(
  payer: unknown,
  nonce: unknown,
): RecoveryLookupKey {
  const identity = validatePaymentRecoveryIdentity(
    payer,
    nonce,
  );

  return {
    payer: identity.payer.toLowerCase(),
    nonce: identity.nonce.toLowerCase(),
    network: identity.network,
  };
}
