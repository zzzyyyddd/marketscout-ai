import { NextResponse } from 'next/server';
import { getPaymentNetworkConfig } from '@/lib/payment-network-config';
import { getControlledPaymentScope, publicPaymentsEnabled } from '@/lib/public-payment-readiness';



const GATEWAY =
  'https://gateway.usebuy.ai/v1/social/instagram/profile';

type Offer = {
  scheme?: unknown;
  network?: unknown;
  amount?: unknown;
  asset?: unknown;
  payTo?: unknown;
  extra?: {
    name?: unknown;
    version?: unknown;
  };
};

export async function GET() {
  try {
    const policy = getPaymentNetworkConfig('celo');

    const response = await fetch(GATEWAY, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(12000),
    });

    if (response.status !== 402) {
      return NextResponse.json(
        { error: 'Gateway did not return a payment challenge' },
        { status: 502 }
      );
    }

    const encoded = response.headers.get('payment-required');

    if (!encoded || encoded.length > 16000) {
      return NextResponse.json(
        { error: 'Missing or oversized x402 v2 challenge' },
        { status: 502 }
      );
    }

    const challenge = JSON.parse(
      Buffer.from(encoded, 'base64').toString('utf8')
    );

    if (
      challenge?.x402Version !== 2 ||
      challenge?.resource?.url !== GATEWAY ||
      !Array.isArray(challenge.accepts)
    ) {
      return NextResponse.json(
        { error: 'Invalid gateway payment challenge' },
        { status: 502 }
      );
    }

    const matching = (challenge.accepts as Offer[]).filter(
      (offer) =>
        offer.scheme === 'exact' &&
        offer.network === policy.caip2Network &&
        offer.amount === policy.maxPerRequestAtomic.toString() &&
        typeof offer.asset === 'string' &&
        offer.asset.toLowerCase() ===
          policy.allowedToken.toLowerCase() &&
        typeof offer.payTo === 'string' &&
        offer.payTo.toLowerCase() ===
          policy.allowedPayTo.toLowerCase() &&
        offer.extra?.name === 'USDC' &&
        offer.extra?.version === '2'
    );

    if (matching.length !== 1) {
      return NextResponse.json(
        { error: 'Expected exactly one matching USDC Mainnet offer' },
        { status: 502 }
      );
    }

    return NextResponse.json(
      {
        x402Version: 2,
        network: policy.caip2Network,
        chainId: policy.chainId,
        token: policy.allowedToken,
        recipient: policy.allowedPayTo,
        amountAtomic: policy.maxPerRequestAtomic.toString(),
        amountUSDC: '0.005',
        resource: GATEWAY,
        accepted: matching[0],
        signingEnabled: publicPaymentsEnabled(),
        controlledTest: publicPaymentsEnabled() ? getControlledPaymentScope() : null,
      },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    );
  } catch {
    return NextResponse.json(
      { error: 'Unable to verify gateway payment offer' },
      { status: 502 }
    );
  }
}
