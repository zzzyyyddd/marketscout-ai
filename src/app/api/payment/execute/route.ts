import { NextResponse } from 'next/server';
import {
  verifyCurrentGatewayOffer,
} from '@/lib/public-payment-offer-binding';

import {
  validatePublicPaymentRequest,
} from '@/lib/public-payment-relay-guard';
import {
  verifyPublicPaymentSignature,
} from '@/lib/public-payment-signature';

import { executePublicPayment } from '@/lib/public-payment-orchestrator';
import { assertControlledPaymentScope, publicPaymentsEnabled } from '@/lib/public-payment-readiness';


const MAX_REQUEST_BYTES = 20000;

// Leave time to durably stage a response after the provider's 150s deadline.
// The hosting platform must honor this budget before payments are enabled.
export const maxDuration = 300;

function json(
  body: Record<string, unknown>,
  status: number,
) {
  return NextResponse.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store, private',
    },
  });
}

export async function POST(request: Request) {
  // No gateway forwarding or settlement until explicitly enabled
  // after ledger, quote, and Mainnet verification are complete.

  if (!publicPaymentsEnabled()) {
    return json(
      { error: 'Public payments disabled' },
      503
    );
  }

  try {
    const contentType = request.headers.get('content-type') ?? '';

    if (!contentType.toLowerCase().startsWith('application/json')) {
      return json({ error: 'JSON required' }, 415);
    }

    const contentLength = request.headers.get('content-length');

    if (
      contentLength !== null &&
      (!/^\d+$/.test(contentLength) ||
        Number(contentLength) > MAX_REQUEST_BYTES)
    ) {
      return json({ error: 'Request too large' }, 413);
    }

    const raw = await request.text();

    if (Buffer.byteLength(raw, 'utf8') > MAX_REQUEST_BYTES) {
      return json({ error: 'Request too large' }, 413);
    }

    const body: unknown = JSON.parse(raw);

    const validated = validatePublicPaymentRequest(body);

    assertControlledPaymentScope(validated.payer, validated.username, validated.reservationId);

    await verifyPublicPaymentSignature(
      validated.paymentHeader,
      validated.payer
    );

    // Compare the supplied x402 v2 offer with a fresh
    // gateway challenge before any payment execution.
    const decodedPayment = JSON.parse(
      Buffer.from(validated.paymentHeader, 'base64').toString('utf8')
    ) as Record<string, unknown>;

    await verifyCurrentGatewayOffer(decodedPayment.accepted);

    // A valid signature is NOT proof of payment.
    // Ledger execution remains blocked until the Mainnet
    // database migration and settlement verifier are approved.
    const execution = await executePublicPayment(
      validated.paymentHeader,
      validated.payer,
      validated.username,
      validated.reservationId,
    );

    if (execution.status === 'unresolved') {
      return json({
        status: 'unresolved',
        reservationId: execution.reservationId,
        message: 'Payment status uncertain. Do not retry automatically.',
      }, 202);
    }

    if (execution.status === 'settled_report_unavailable') {
      return json({
        status: 'settled_report_unavailable',
        reservationId: execution.reservationId,
        txHash: execution.txHash,
        message: 'Payment settled, but report is unavailable. Do not pay again.',
      }, 202);
    }

    return json({
      status: 'settled',
      network: 'celo',
      reservationId: execution.reservationId,
      txHash: execution.txHash,
      report: execution.report,
    }, 200);
  } catch {
    return json(
      { error: 'Invalid payment authorization' },
      400
    );
  }
}
