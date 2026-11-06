import 'server-only';

import { validateScanReport } from './scan-report-validation';
import { storePaidReport } from './paid-report-store';

import {
  reservePublicPaymentAuthorization,
} from './public-payment-ledger';

import {
  forwardPublicPaymentOnce,
} from './public-payment-gateway-relay';

import {
  verifyPublicPaymentSignature,
} from './public-payment-signature';

import {
  verifyAndSettlePayment,
} from './payment-verified-settlement';

import {
  MAINNET_PAYMENT_POLICY as POLICY,
} from './payment-mainnet-policy';

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
): Promise<PublicPaymentExecution> {
  const authorization =
    await verifyPublicPaymentSignature(paymentHeader, payer);

  if (!/^0x[0-9a-fA-F]{64}$/.test(authorization.nonce)) {
    throw new Error('Invalid authorization nonce');
  }

  const validatedNonce =
    authorization.nonce as `0x${string}`;

  // Atomic reservation stores the authorization evidence
  // before any request capable of charging the payer.
  const reservation =
    await reservePublicPaymentAuthorization(
      paymentHeader,
      payer,
      username,
    );

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

  // A transaction hash is evidence to investigate, not proof
  // that payment settled. Verify on-chain before updating ledger.
  try {
    await verifyAndSettlePayment(
      reservation.reservationId,
      txHash,
      {
        payer: authorization.payer,
        recipient: authorization.recipient,
        token: authorization.token,
        amount: BigInt(authorization.amountAtomic),
        nonce: validatedNonce,
        validAfter: BigInt(authorization.validAfter),
        validBefore: BigInt(authorization.validBefore),
      },
      POLICY.network,
    );
  } catch {
    return {
      status: 'unresolved',
      reservationId: reservation.reservationId,
      reason: 'On-chain settlement not verified',
    };
  }

  // Payment verified, but the gateway response may be missing.
  // Do not charge again to recover a missing report.
  if (result.status === 'unresolved') {
    return {
      status: 'settled_report_unavailable',
      reservationId: reservation.reservationId,
      txHash,
    };
  }

  let report: ReturnType<typeof validateScanReport>;

  try {
    report = validateScanReport(result.body, username);
  } catch {
    return {
      status: 'settled_report_unavailable',
      reservationId: reservation.reservationId,
      txHash,
    };
  }

  // Persist the verified report before acknowledging delivery.
  // A storage failure must never trigger another payment.
  try {
    await storePaidReport(
      reservation.reservationId,
      username,
      report,
    );
  } catch {
    return {
      status: 'settled_report_unavailable',
      reservationId: reservation.reservationId,
      txHash,
    };
  }

  return {
    status: 'settled',
    reservationId: reservation.reservationId,
    txHash,
    report,
  };
}
