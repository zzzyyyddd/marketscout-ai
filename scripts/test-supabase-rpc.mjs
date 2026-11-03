import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const env = readFileSync('.env.local', 'utf8');

function getEnv(name) {
  const line = env.split('\n').find(
    line => line.startsWith(`${name}=`)
  );

  return line?.slice(name.length + 1)
    .trim()
    .replace(/^["']|["']$/g, '');
}

const url = getEnv('SUPABASE_URL');
const key = getEnv('SUPABASE_SECRET_KEY');

if (!url || !key) {
  throw new Error('Supabase configuration missing');
}

const supabase = createClient(url, key, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

const id = randomUUID();

console.log('=== SUPABASE RPC TEST ===');

const reserve = await supabase.rpc(
  'marketscout_reserve_payment',
  {
    p_id: id,
    p_amount: 5000,
  }
);

if (reserve.error || reserve.data !== true) {
  console.error(
    'FAIL Reserve:',
    reserve.error?.message ?? reserve.data
  );
  process.exitCode = 1;
} else {
  console.log('PASS Remote reservation');

  const settle = await supabase.rpc(
    'marketscout_settle_payment',
    {
      p_id: id,
      p_status: 'rejected',
    }
  );

  if (settle.error || settle.data !== true) {
    console.error(
      'FAIL Settlement:',
      settle.error?.message ?? settle.data
    );
    console.error(
      'WARNING: Test reservation may remain active'
    );
    process.exitCode = 1;
  } else {
    console.log('PASS Remote settlement');
  }
}

console.log('=== PAYMENT SAFETY ===');
console.log(
  getEnv('MARKETSCOUT_ENABLE_PAYMENTS') === 'true'
    ? 'WARNING Payments enabled'
    : 'PASS Payments disabled'
);
