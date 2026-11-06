import 'server-only';

import { isAddress, type Address, type Hex } from 'viem';

export interface PaymentRecoveryIdentity {
  payer: Address;
  nonce: Hex;
  network: 'celo';
}

export function validatePaymentRecoveryIdentity(
  payer: unknown,
  nonce: unknown,
): PaymentRecoveryIdentity {
  if (
    typeof payer !== 'string' ||
    !isAddress(payer)
  ) {
    throw new Error('Invalid recovery wallet');
  }

  if (
    typeof nonce !== 'string' ||
    !/^0x[0-9a-fA-F]{64}$/.test(nonce)
  ) {
    throw new Error('Invalid recovery nonce');
  }

  return {
    payer: payer as Address,
    nonce: nonce as Hex,
    network: 'celo',
  };
}
