import 'server-only';
import { parsePaymentResponse, readBoundedGatewayBody } from './payment-response-proof';

import {
  MAINNET_PAYMENT_POLICY as POLICY,
} from './payment-mainnet-policy';

const GATEWAY =
  `https://${POLICY.allowedHost}${POLICY.allowedPath}`;

export type GatewayPaymentResult =
  | {
      status: 'confirmed';
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
      signal: AbortSignal.timeout(25000),
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

  if (!response.ok) {
    return {
      status: 'unresolved',
      reason: 'Gateway did not return confirmed success',
    };
  }

  let txHash: `0x${string}`;
  try { txHash = parsePaymentResponse(response.headers); }
  catch { return { status: 'unresolved', reason: 'Payment proof invalid or conflicting' }; }

  try {
    const body: unknown = await readBoundedGatewayBody(response);

    return {
      status: 'confirmed',
      txHash: txHash as `0x${string}`,
      body,
    };
  } catch {
    return {
      status: 'unresolved',
      reason: 'Gateway response body unavailable',
      txHash: txHash as `0x${string}`,
    };
  }
}
