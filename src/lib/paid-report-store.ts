import 'server-only';

import { createClient } from '@supabase/supabase-js';

import {
  isCompetitorReport,
  type CompetitorReport,
} from './report';

function getClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;

  if (!url || !key) {
    throw new Error('Paid report database is not configured');
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

export async function readPaidReport(reservationId: string): Promise<CompetitorReport | null> {
  const { data, error } = await getClient().rpc(
    'marketscout_read_paid_report', { p_reservation_id: reservationId },
  );
  if (error) throw new Error('Paid report read unavailable');
  return isCompetitorReport(data) ? data : null;
}

export async function storePaidReport(
  reservationId: string,
  username: string,
  report: CompetitorReport,
): Promise<void> {
  const normalizedUsername = username.trim().toLowerCase();

  if (
    !/^[0-9a-fA-F-]{36}$/.test(reservationId) ||
    !/^[a-z0-9._]{1,30}$/.test(normalizedUsername) ||
    !isCompetitorReport(report)
  ) {
    throw new Error('Invalid paid report storage request');
  }

  const { data, error } = await getClient().rpc(
    'marketscout_store_paid_report',
    {
      p_reservation_id: reservationId,
      p_username: normalizedUsername,
      p_report: report,
    },
  );

  if (error || data !== true) {
    throw new Error('Verified paid report persistence failed');
  }
}
