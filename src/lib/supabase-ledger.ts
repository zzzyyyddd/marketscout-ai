import 'server-only';

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

export async function settlePayment(
  id: string,
  status: 'confirmed' | 'ambiguous'
): Promise<void> {
  const { data, error } = await getClient().rpc(
    'marketscout_settle_payment',
    {
      p_id: id,
      p_status: status,
    }
  );

  if (error || data !== true) {
    throw new Error('Payment settlement accounting failed');
  }
}
