import { NextResponse } from 'next/server';

import {
  validatePublicPaymentRequest,
} from '@/lib/public-payment-relay-guard';

import {
  verifyPublicPaymentSignature,
} from '@/lib/public-payment-signature';

import {
  lookupMainnetPayment,
} from '@/lib/public-payment-recovery-db';


function json(body: unknown, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store, private' },
  });
}

export async function POST(request: Request) {
  if (process.env.MARKETSCOUT_PUBLIC_PAYMENTS !== 'true') {
    return json({ error: 'Payment recovery disabled' }, 503);
  }

  try {
    const contentType = request.headers.get('content-type') ?? '';

    if (!contentType.toLowerCase().startsWith('application/json')) {
      return json({ error: 'JSON required' }, 415);
    }

    const contentLength = request.headers.get('content-length');

    if (
      contentLength !== null &&
      (!/^\d+$/.test(contentLength) || Number(contentLength) > 20000)
    ) {
      return json({ error: 'Request too large' }, 413);
    }

    const raw = await request.text();

    if (Buffer.byteLength(raw, 'utf8') > 20000) {
      return json({ error: 'Request too large' }, 413);
    }

    const validated = validatePublicPaymentRequest(
      JSON.parse(raw) as unknown,
    );

    const authorization = await verifyPublicPaymentSignature(
      validated.paymentHeader,
      validated.payer,
    );

    const record = await lookupMainnetPayment(
      authorization.payer,
      authorization.nonce,
    );

    if (!record) {
      return json({ status: 'not_found' }, 404);
    }

    return json({
      status: record.payment_status,
      reconciliation: record.reconciliation_state,
      reservationId: record.reservation_id,
      txHash: record.transaction_hash,
      amountAtomic: record.amount_atomic,
      network: 'celo',
    }, 200);
  } catch {
    return json({ error: 'Recovery request invalid or unavailable' }, 400);
  }
}
