import 'server-only';
import { parsePaymentResponse, readBoundedGatewayBody } from './payment-response-proof';

import {
  MAINNET_PAYMENT_POLICY as POLICY,
} from './payment-mainnet-policy';

const GATEWAY =
  `https://${POLICY.allowedHost}${POLICY.allowedPath}`;

// https://usebuy.ai/limits documents a 150-second upstream deadline.
// Allow its response to arrive before aborting a request that may be charged.
const GATEWAY_RESPONSE_TIMEOUT_MS = 165000;

export type GatewayPaymentResult =
  | {
      status: 'received';
      txHash: `0x${string}`;
      body: unknown;
    }
  | {
      status: 'unresolved';
      reason: string;
      txHash?: `0x${string}`;
    };

export async function forwardPublicPaymentOnce(
  paymentHeader: string,
  username: string,
): Promise<GatewayPaymentResult> {
  let response: Response;

  try {
    response = await fetch(GATEWAY, {
      method: 'POST',
      redirect: 'manual',
      cache: 'no-store',
      signal: AbortSignal.timeout(GATEWAY_RESPONSE_TIMEOUT_MS),
      headers: {
        'Content-Type': 'application/json',
        'PAYMENT-SIGNATURE': paymentHeader,
      },
      body: JSON.stringify({ username }),
    });
  } catch {
    // The gateway may already have settled the authorization.
    // Never automatically resend it.
    return {
      status: 'unresolved',
      reason: 'Gateway response unavailable',
    };
  }

  // HTTP errors can follow settlement. The provider documents transaction and
  // output fields on settle_uncertain responses, even without a receipt header.
  // These are only candidates: on-chain verification and report validation are
  // mandatory after durable capture. Conflicting/malformed headers fail closed.
  let txHash: `0x${string}` | undefined;
  if (response.headers.has('PAYMENT-RESPONSE') || response.headers.has('X-PAYMENT-RESPONSE')) {
    try { txHash = parsePaymentResponse(response.headers); }
    catch {
      await response.body?.cancel().catch(() => {});
      return { status: 'unresolved', reason: 'Payment proof invalid or conflicting' };
    }
  }

  try {
    const body: unknown = await readBoundedGatewayBody(response);

    if (body && typeof body === 'object' && !Array.isArray(body)) {
      const candidate = (body as Record<string, unknown>).transaction;
      if (typeof candidate === 'string' && /^0x[0-9a-fA-F]{64}$/.test(candidate)) {
        if (txHash && txHash !== candidate.toLowerCase()) {
          return { status: 'unresolved', reason: 'Conflicting gateway transaction evidence' };
        }
        txHash = candidate.toLowerCase() as `0x${string}`;
      }
    }
    if (!txHash) return { status: 'unresolved', reason: 'Gateway transaction evidence missing' };

    return {
      status: 'received',
      txHash,
      body,
    };
  } catch {
    return {
      status: 'unresolved',
      reason: 'Gateway response body unavailable',
      txHash,
    };
  }
}
