import 'server-only';

import { createClient } from '@supabase/supabase-js';

import {
  prepareRecoveryLookup,
} from './public-payment-recovery-lookup';

export interface PaymentRecoveryRow {
  reservation_id: string;
  payment_status: string;
  reconciliation_state: string;
  transaction_hash: string | null;
  amount_atomic: number;
}

export async function lookupMainnetPayment(
  payer: string,
  nonce: string,
): Promise<PaymentRecoveryRow | null> {
  const key = prepareRecoveryLookup(payer, nonce);

  const url = process.env.SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;

  if (!url || !secret) {
    throw new Error('Supabase server configuration unavailable');
  }

  const supabase = createClient(url, secret, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const { data, error } = await supabase.rpc(
    'marketscout_lookup_mainnet_payment',
    {
      p_payer: key.payer,
      p_nonce: key.nonce,
    },
  );

  if (error) {
    throw new Error('Payment recovery lookup unavailable');
  }

  if (!Array.isArray(data) || data.length === 0) {
    return null;
  }

  return data[0] as PaymentRecoveryRow;
}
