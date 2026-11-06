import 'server-only';

import { getAddress, type Address } from 'viem';

export const RECOVERY_CHALLENGE_TTL_SECONDS = 300;

export interface RecoveryChallenge {
  reservationId: string;
  payer: Address;
  nonce: string;
  domain: string;
  issuedAt: string;
  expiresAt: string;
}

export function buildRecoveryMessage(
  challenge: RecoveryChallenge,
): string {
  if (!/^[0-9a-fA-F-]{36}$/.test(challenge.reservationId)) {
    throw new Error('Invalid reservation ID');
  }

  if (!/^[0-9a-f]{64}$/.test(challenge.nonce)) {
    throw new Error('Invalid recovery nonce');
  }

  const payer = getAddress(challenge.payer);

  if (
    !challenge.domain ||
    !/^[a-z0-9.-]+(?::[0-9]{1,5})?$/.test(challenge.domain)
  ) {
    throw new Error('Invalid recovery domain');
  }

  const issued = Date.parse(challenge.issuedAt);
  const expires = Date.parse(challenge.expiresAt);

  if (
    !Number.isFinite(issued) ||
    !Number.isFinite(expires) ||
    expires <= issued ||
    expires - issued > RECOVERY_CHALLENGE_TTL_SECONDS * 1000
  ) {
    throw new Error('Invalid challenge lifetime');
  }

  return [
    'MarketScout AI — Paid Report Recovery',
    '',
    'This signature proves wallet ownership.',
    'It does not authorize any payment or token transfer.',
    '',
    `Domain: ${challenge.domain}`,
    `Reservation: ${challenge.reservationId}`,
    `Wallet: ${payer}`,
    `Nonce: ${challenge.nonce}`,
    `Issued At: ${challenge.issuedAt}`,
    `Expires At: ${challenge.expiresAt}`,
  ].join('\n');
}
