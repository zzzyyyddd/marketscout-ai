import 'server-only';

import { createClient } from '@supabase/supabase-js';

export async function readCachedProfile(username: string) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;

  if (!url || !key) {
    throw new Error('Cache database not configured');
  }

  const supabase = createClient(url, key, {
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

  const { data, error } = await supabase
    .from('marketscout_profile_cache')
    .select('username, report, source, network, expires_at')
    .eq('username', username)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();

  if (error) {
    throw new Error('Cache database unavailable');
  }

  return data;
}
