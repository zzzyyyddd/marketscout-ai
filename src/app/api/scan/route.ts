import { NextResponse } from 'next/server';
import { privateKeyToAccount } from 'viem/accounts';
import { payingFetch } from '@celo/buy-core/x402';
import { isAuthorized } from '@/lib/auth';
import {
  PAYMENT_POLICY,
  validateInstagramUsername,
  validatePaymentDestination,
  validatePaymentRequirements,
} from '@/lib/payment-policy';
import {
  reservePayment,
  attachPaymentAuthorization,
} from '@/lib/supabase-ledger';
import {
  validateScanReport,
} from '@/lib/scan-report-validation';
import { writeCachedProfile } from '@/lib/profile-cache-write';
import {
  extractPaymentAuthorization,
  type PaymentAuthorizationMetadata,
} from '@/lib/payment-authorization-metadata';
import { verifyAndSettlePayment } from '@/lib/payment-verified-settlement';
import {
  getPaymentNetworkConfig,
  type PaymentNetwork,
} from '@/lib/payment-network-config';



const ENDPOINT =
  'https://gateway.usebuy.ai/v1/social/instagram/profile';

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  if (
    process.env.MARKETSCOUT_ENABLE_PAYMENTS !== 'true' ||
    process.env.NODE_ENV === 'production'
  ) {
    return NextResponse.json(
      { error: 'Live payments disabled' },
      { status: 503 }
    );
  }

  // This implementation is local-development only.
  // Never enable it in a public deployment.
  const configuredNetwork = process.env.MARKETSCOUT_NETWORK;
  if (configuredNetwork !== 'celo-sepolia') {
    return NextResponse.json(
      { error: 'Unsupported payment network' },
      { status: 503 }
    );
  }

  const network: PaymentNetwork = configuredNetwork as PaymentNetwork;
  const policy = getPaymentNetworkConfig(network);

  let username: string;

  try {
    const body = await request.json();
    username = validateInstagramUsername(body.username);
    validatePaymentDestination(ENDPOINT);
  } catch {
    return NextResponse.json(
      { error: 'Invalid scan request' },
      { status: 400 }
    );
  }

  const key = process.env.MARKETSCOUT_PRIVATE_KEY;

  if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)) {
    return NextResponse.json(
      { error: 'Wallet not configured' },
      { status: 503 }
    );
  }

  const account = privateKeyToAccount(
    key as `0x${string}`
  );

  let reservationId: string | undefined;
  let selectedRequirements: Parameters<
    typeof extractPaymentAuthorization
  >[1] | undefined;
  let paidRequestSent = false;
  let accountingSettled = false;
  let authorizationMetadata:
    PaymentAuthorizationMetadata | undefined;
  let paymentOutcome:
    | 'confirmed'
    | 'rejected'
    | 'ambiguous'
    | undefined;

  try {
    const response = await payingFetch(
      {
        account,
        network,
        preferredToken: 'USDC',
        fetchImpl: async (input, init) => {
          const headers = new Headers(init?.headers);
          const hasPayment =
            headers.has('X-PAYMENT') ||
            headers.has('PAYMENT-SIGNATURE');

          if (!hasPayment) {
            return fetch(input, init);
          }

          if (paidRequestSent) {
            throw new Error('Duplicate paid request blocked');
          }

          if (!reservationId || !selectedRequirements) {
            throw new Error('Payment reservation missing');
          }

          const metadata = extractPaymentAuthorization(
            headers,
            selectedRequirements,
              network
          );

          if (
            metadata.payer.toLowerCase() !==
            account.address.toLowerCase()
          ) {
            throw new Error('Unexpected payment payer');
          }

          // Prevent another paid attempt even if persistence fails.
          paidRequestSent = true;

          await attachPaymentAuthorization(
            reservationId,
            metadata,
              network
          );

          authorizationMetadata = metadata;

          return fetch(input, init);
        },
      },
      ENDPOINT,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username }),
        maxAmount: policy.maxPerRequestAtomic,
        maxRetries: 1,

        onBeforePayment: async (requirements) => {
          const amount =
            validatePaymentRequirements(requirements);

          reservationId = await reservePayment(amount);
          selectedRequirements = requirements;
        },

        onPayment: async (info) => {
          paymentOutcome = info.outcome;

          if (!reservationId || !authorizationMetadata) {
            throw new Error('Payment evidence missing');
          }

          if (
            info.outcome !== 'confirmed' ||
            !info.txHash ||
            !/^0x[0-9a-fA-F]{64}$/.test(info.txHash)
          ) {
            throw new Error(
              'Payment not independently verifiable'
            );
          }

          await verifyAndSettlePayment(
            reservationId,
            info.txHash as `0x${string}`,
            authorizationMetadata,
            network
          );

          accountingSettled = true;
        },

        onAccountingError: (error) => {
          console.error(
            'Payment accounting failed:',
            error instanceof Error ? error.message : 'Unknown error'
          );
        },
      }
    );

    if (!response.ok || paymentOutcome !== 'confirmed' || !accountingSettled) {
      return NextResponse.json(
        { error: 'Paid scan did not complete successfully' },
        { status: 502 }
      );
    }

    const raw = await response.json();
    const report = validateScanReport(
      raw,
      username
    );

    let cacheStatus: 'stored' | 'not_updated' | 'failed' =
      'failed';

    try {
      const stored = await writeCachedProfile(
        username,
        report
      );

      cacheStatus = stored ? 'stored' : 'not_updated';
    } catch (error) {
      console.error(
        'Cache write failed after confirmed payment:',
        error instanceof Error ? error.message : 'Unknown error'
      );
    }

    return NextResponse.json({
      mode: 'live',
      network,
      username,
      report,
      cache: {
        status: cacheStatus,
      },
    });
  } catch (error) {
    console.error(
      'Scan failed:',
      error instanceof Error ? error.message : 'Unknown error'
    );

    // Any reservation without a confirmed outcome stays reserved.
    // Never automatically retry an uncertain payment.
    return NextResponse.json(
      { error: 'Scan unavailable; do not retry automatically' },
      { status: 502 }
    );
  }
}
