import 'server-only';
import { assertControlledPaymentScope } from './public-payment-readiness';

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
  assertControlledPaymentScope(payer, username, reservationId);
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
      result.status === 'received' ? result.body : null,
    );
  } catch {
    // Retry only the idempotent database write, never the paid gateway request.
    // The first write may have committed despite a lost acknowledgement.
    try {
      await storeGatewayResponse(
        reservation.reservationId, username, txHash,
        result.status === 'received' ? result.body : null,
      );
    } catch {
      // A rejected/mismatched/oversized profile must not discard known payment
      // evidence. Existing staging is immutable, so this cannot erase a body.
      try { await storeGatewayResponse(reservation.reservationId, username, txHash, null); }
      catch { /* Resume can still read a write whose acknowledgement was lost. */ }
    }
  }
  return resumePaidResponse(reservation.reservationId);
}
