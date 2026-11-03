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

const supabase = createClient(
  getEnv('SUPABASE_URL'),
  getEnv('SUPABASE_SECRET_KEY'),
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }
);

const ids = Array.from({ length: 12 }, () => randomUUID());

console.log('=== CONCURRENT RESERVATION TEST ===');

const results = await Promise.all(
  ids.map(async id => {
    const { data, error } = await supabase.rpc(
      'marketscout_reserve_payment',
      { p_id: id, p_amount: 5000 }
    );

    return { id, accepted: data === true && !error, error };
  })
);

const accepted = results.filter(r => r.accepted);
const errors = results.filter(r => r.error);

console.log('Accepted:', accepted.length);
console.log('Rejected:', results.length - accepted.length);
console.log('RPC errors:', errors.length);

console.log('');
console.log('=== CLEANUP ===');

const cleanup = await Promise.all(
  accepted.map(async r => {
    const { data, error } = await supabase.rpc(
      'marketscout_settle_payment',
      { p_id: r.id, p_status: 'rejected' }
    );

    return !error && data === true;
  })
);

console.log(
  'Cleaned:',
  cleanup.filter(Boolean).length,
  '/',
  accepted.length
);

console.log('');
console.log('=== RESULT ===');

if (errors.length > 0) {
  console.log('REVIEW: RPC errors occurred');
  process.exitCode = 1;
} else if (
  accepted.length <= 10 &&
  cleanup.every(Boolean)
) {
  console.log('PASS Concurrent budget limit respected');
} else {
  console.log('FAIL Budget or cleanup verification');
  process.exitCode = 1;
}
