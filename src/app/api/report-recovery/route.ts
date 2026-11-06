import { randomBytes, createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  getAddress,
  verifyMessage,
  type Hex,
} from 'viem';
import {
  buildRecoveryMessage,
  RECOVERY_CHALLENGE_TTL_SECONDS,
} from '@/lib/paid-report-recovery-challenge';
import { resumePaidResponse } from '@/lib/paid-response-store';
import { isCompetitorReport } from '@/lib/report';



const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function respond(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'private, no-store' },
  });
}

function database() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error('Database unavailable');
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function hash(nonce: string) {
  return createHash('sha256').update(nonce).digest('hex');
}

export async function POST(request: Request) {
  if (process.env.MARKETSCOUT_RECOVERY_ENABLED === 'false') {
    return respond({ error: 'Recovery disabled' }, 503);
  }

  try {
    const contentType = request.headers.get('content-type') ?? '';
    if (!contentType.toLowerCase().startsWith('application/json')) {
      return respond({ error: 'JSON required' }, 415);
    }

    const raw = await request.text();
    if (Buffer.byteLength(raw) > 4096) {
      return respond({ error: 'Request too large' }, 413);
    }

    const input: unknown = JSON.parse(raw);
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      return respond({ error: 'Invalid request' }, 400);
    }

    const body = input as Record<string, unknown>;
    const action = body.action;
    const reservationId = body.reservationId;

    if (typeof reservationId !== 'string' || !UUID.test(reservationId)) {
      return respond({ error: 'Invalid reservation' }, 400);
    }

    if (typeof body.payer !== 'string') {
      return respond({ error: 'Invalid wallet' }, 400);
    }

    const payer = getAddress(body.payer);
    const domain = new URL(request.url).host.toLowerCase();
    const db = database();

    if (action === 'challenge') {
      const nonce = randomBytes(32).toString('hex');
      const issuedAt = new Date();
      const expiresAt = new Date(
        issuedAt.getTime() + RECOVERY_CHALLENGE_TTL_SECONDS * 1000,
      );

      const challenge = {
        reservationId,
        payer,
        nonce,
        domain,
        issuedAt: issuedAt.toISOString(),
        expiresAt: expiresAt.toISOString(),
      };

      const { data, error } = await db.rpc(
        'marketscout_issue_recovery_challenge',
        {
          p_nonce_hash: hash(nonce),
          p_reservation_id: reservationId,
          p_payer: payer,
          p_domain: domain,
          p_issued_at: challenge.issuedAt,
          p_expires_at: challenge.expiresAt,
        },
      );

      if (error || data !== true) {
        return respond({ error: 'Recovery unavailable' }, 404);
      }

      return respond({
        message: buildRecoveryMessage(challenge),
        nonce,
        issuedAt: challenge.issuedAt,
        expiresAt: challenge.expiresAt,
      });
    }

    if (action === 'redeem') {
      if (
        typeof body.nonce !== 'string' ||
        !/^[0-9a-f]{64}$/.test(body.nonce) ||
        typeof body.signature !== 'string' ||
        !/^0x[0-9a-fA-F]{130}$/.test(body.signature) ||
        typeof body.issuedAt !== 'string' ||
        typeof body.expiresAt !== 'string'
      ) {
        return respond({ error: 'Invalid recovery proof' }, 400);
      }

      const issued = Date.parse(body.issuedAt);
      const expires = Date.parse(body.expiresAt);
      const now = Date.now();

      if (
        !Number.isFinite(issued) ||
        !Number.isFinite(expires) ||
        issued > now + 30000 ||
        expires <= issued ||
        expires <= now ||
        expires - issued > RECOVERY_CHALLENGE_TTL_SECONDS * 1000
      ) {
        return respond({ error: 'Recovery challenge expired' }, 400);
      }

      const message = buildRecoveryMessage({
        reservationId,
        payer,
        nonce: body.nonce,
        domain,
        issuedAt: body.issuedAt,
        expiresAt: body.expiresAt,
      });

      const valid = await verifyMessage({
        address: payer,
        message,
        signature: body.signature as Hex,
      });

      if (!valid) {
        return respond({ error: 'Invalid wallet signature' }, 403);
      }

      const { data, error } = await db.rpc(
        'marketscout_consume_processing_challenge',
        {
          p_nonce_hash: hash(body.nonce),
          p_reservation_id: reservationId,
          p_payer: payer,
          p_domain: domain,
          p_issued_at: body.issuedAt,
          p_expires_at: body.expiresAt,
        },
      );

      if (error || data !== true) {
        return respond({ error: 'Report unavailable' }, 404);
      }

      const result = await resumePaidResponse(reservationId);
      if (result.status === 'settled' && isCompetitorReport(result.report)) return respond({ status: 'recovered', report: result.report });
      // Older persisted reports remain recoverable after staging retention expires.
      const saved = await db.rpc('marketscout_read_paid_report', { p_reservation_id: reservationId });
      if (!saved.error && isCompetitorReport(saved.data)) return respond({ status: 'recovered', report: saved.data });
      return respond({ error: 'Report processing remains unresolved. Do not pay again.', reservationId }, 202);
    }

    return respond({ error: 'Unknown action' }, 400);
  } catch {
    return respond({ error: 'Recovery request rejected' }, 400);
  }
}
