import 'server-only';

import { createClient } from '@supabase/supabase-js';
import { isCompetitorReport } from './report';
import type { CompetitorReport } from './report';
import { validateInstagramUsername } from './payment-policy';

export async function writeCachedProfile(
  username: string,
  report: CompetitorReport
): Promise<boolean> {
  const normalizedUsername =
    validateInstagramUsername(username).toLowerCase();

  if (
    !isCompetitorReport(report) ||
    report.username.toLowerCase() !== normalizedUsername
  ) {
    throw new Error('Invalid cache report');
  }

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

  const { data, error } = await supabase.rpc(
    'marketscout_store_profile_cache',
    {
      p_username: normalizedUsername,
      p_report: report,
      p_source: 'live',
      p_network: 'celo-sepolia',
      p_fetched_at: new Date().toISOString(),
      p_ttl_seconds: 86400,
    }
  );

  if (error) {
    throw new Error('Cache write failed');
  }

  if (typeof data !== 'boolean') {
    throw new Error('Unexpected cache write result');
  }

  return data;
}
