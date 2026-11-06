import 'server-only';
import { createClient } from '@supabase/supabase-js';
import type { PaymentAuthorizationMetadata } from './payment-authorization-metadata';
import { verifyAndSettlePayment } from './payment-verified-settlement';
import { validateScanReport } from './scan-report-validation';
import { storePaidReport } from './paid-report-store';
import type { PublicPaymentExecution } from './public-payment-orchestrator';

function database() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error('Response storage unavailable');
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(10000) }) },
  });
}

export async function assertResponseStorageReady(id: string) {
  const { error } = await database().rpc('marketscout_read_staged_response', { p_reservation_id: id });
  if (error) throw new Error('Response staging migration unavailable');
}

export async function storeGatewayResponse(id: string, username: string, txHash: string, body: unknown) {
  const { data, error } = await database().rpc('marketscout_stage_gateway_response', {
    p_reservation_id: id, p_username: username, p_tx_hash: txHash, p_body: body,
  });
  if (error || data !== true) throw new Error('Response staging failed');
}

// This path accepts no payment signature and has no gateway dependency.
export async function resumePaidResponse(reservationId: string): Promise<PublicPaymentExecution> {
  const { data, error } = await database().rpc('marketscout_read_staged_response', { p_reservation_id: reservationId });
  if (error || !data) return { status: 'unresolved', reservationId, reason: 'Saved gateway response unavailable; do not pay again' };
  const row = data as { username: string; txHash: `0x${string}`; body: unknown; authorization: Record<string, string> };
  const a = row.authorization;
  const authorization = {
    payer: a.payer, recipient: a.recipient, token: a.token, nonce: a.nonce,
    amount: BigInt(a.amount), validAfter: BigInt(a.validAfter), validBefore: BigInt(a.validBefore),
  } as PaymentAuthorizationMetadata;
  try { await verifyAndSettlePayment(reservationId, row.txHash, authorization, 'celo'); }
  catch { return { status: 'unresolved', reservationId, reason: 'Settlement verification requires retry' }; }
  try {
    const report = validateScanReport(row.body, row.username);
    await storePaidReport(reservationId, row.username, report);
    return { status: 'settled', reservationId, txHash: row.txHash, report };
  } catch { return { status: 'settled_report_unavailable', reservationId, txHash: row.txHash }; }
}
