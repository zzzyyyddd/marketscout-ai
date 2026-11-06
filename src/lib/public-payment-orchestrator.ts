import 'server-only';

import { storeGatewayResponse, resumePaidResponse, assertResponseStorageReady } from './paid-response-store';

import {
  reservePublicPaymentAuthorization,
} from './public-payment-ledger';

import {
  forwardPublicPaymentOnce,
} from './public-payment-gateway-relay';

import {
  verifyPublicPaymentSignature,
} from './public-payment-signature';

export type PublicPaymentExecution =
  | {
      status: 'settled';
      reservationId: string;
      txHash: `0x${string}`;
      report: unknown;
    }
  | {
      status: 'unresolved';
      reservationId: string;
      reason: string;
    }
  | {
      status: 'settled_report_unavailable';
      reservationId: string;
      txHash: `0x${string}`;
    };

export async function executePublicPayment(
  paymentHeader: string,
  payer: string,
  username: string,
  reservationId?: string,
): Promise<PublicPaymentExecution> {
  const authorization =
    await verifyPublicPaymentSignature(paymentHeader, payer);

  if (!/^0x[0-9a-fA-F]{64}$/.test(authorization.nonce)) {
    throw new Error('Invalid authorization nonce');
  }

  // Atomic reservation stores the authorization evidence
  // before any request capable of charging the payer.
  const reservation =
    await reservePublicPaymentAuthorization(
      paymentHeader,
      payer,
      username,
      reservationId,
    );

  await assertResponseStorageReady(reservation.reservationId);

  const result =
    await forwardPublicPaymentOnce(paymentHeader, username);

  if (result.status === 'unresolved' && !result.txHash) {
    return {
      status: 'unresolved',
      reservationId: reservation.reservationId,
      reason: result.reason,
    };
  }

  const txHash = result.txHash;

  if (!txHash) {
    throw new Error('Missing gateway transaction hash');
  }

  // Persist proof and bounded JSON before verification, processing, or final storage.
  // A missing body remains missing; retry never obtains it by paying again.
  try {
    await storeGatewayResponse(
      reservation.reservationId, username, txHash,
      result.status === 'confirmed' ? result.body : null,
    );
  } catch {
    return { status: 'unresolved', reservationId: reservation.reservationId, reason: 'Gateway response storage failed; do not pay again' };
  }
  return resumePaidResponse(reservation.reservationId);
}
