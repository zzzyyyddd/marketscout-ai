import 'server-only';
import type { PaymentNetwork } from './payment-network-config';

import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

function getClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;

  if (!url || !key) {
    throw new Error('Supabase ledger is not configured');
  }

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      fetch: (input, init) =>
        fetch(input, {
          ...init,
          signal: AbortSignal.timeout(10000),
        }),
    },
  });
}

export async function reservePayment(
  amount: number
): Promise<string> {
  if (
    !Number.isSafeInteger(amount) ||
    amount <= 0 ||
    amount > 5000
  ) {
    throw new Error('Invalid payment amount');
  }

  const id = randomUUID();

  const { data, error } = await getClient().rpc(
    'marketscout_reserve_payment',
    {
      p_id: id,
      p_amount: amount,
    }
  );

  if (error || data !== true) {
    throw new Error(
      'Payment reservation unavailable or budget exceeded'
    );
  }

  return id;
}

export async function attachPaymentAuthorization(
  id: string,
  metadata: {
    payer: string;
    recipient: string;
    token: string;
    amount: bigint;
    nonce: string;
    validAfter: bigint;
    validBefore: bigint;
  }
,
  network: PaymentNetwork): Promise<void> {
  const { data, error } = await getClient().rpc(
    'marketscout_attach_payment_authorization',
    {
      p_id: id,
      p_payer: metadata.payer,
      p_recipient: metadata.recipient,
      p_token: metadata.token,
      p_amount: Number(metadata.amount),
      p_nonce: metadata.nonce,
      p_valid_after: Number(metadata.validAfter),
      p_valid_before: Number(metadata.validBefore),
      p_network: network,
    }
  );

  if (error || data !== true) {
    throw new Error('Payment evidence persistence failed');
  }
}

export async function settleVerifiedPayment(
  id: string,
  txHash: string,
  payer: string,
  nonce: string
): Promise<void> {
  const { data, error } = await getClient().rpc(
    'marketscout_settle_verified_payment',
    {
      p_id: id,
      p_tx_hash: txHash,
      p_payer: payer,
      p_nonce: nonce,
    }
  );

  if (error || data !== true) {
    throw new Error('Verified payment settlement failed');
  }
}
