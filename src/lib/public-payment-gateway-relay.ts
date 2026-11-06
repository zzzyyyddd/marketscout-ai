import 'server-only';

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

  const encodedProof =
    response.headers.get('X-PAYMENT-RESPONSE');

  if (!encodedProof || encodedProof.length > 8192) {
    return {
      status: 'unresolved',
      reason: 'Payment proof missing',
    };
  }

  let txHash: unknown;

  try {
    const proof = JSON.parse(
      Buffer.from(encodedProof, 'base64').toString('utf8'),
    ) as Record<string, unknown>;

    txHash = proof.transaction;
  } catch {
    return {
      status: 'unresolved',
      reason: 'Payment proof invalid',
    };
  }

  if (
    typeof txHash !== 'string' ||
    !/^0x[0-9a-fA-F]{64}$/.test(txHash)
  ) {
    return {
      status: 'unresolved',
      reason: 'Transaction hash unavailable',
    };
  }

  try {
    const body: unknown = await response.json();

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
