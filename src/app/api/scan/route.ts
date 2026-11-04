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
  settlePayment,
} from '@/lib/supabase-ledger';
import {
  validateScanReport,
} from '@/lib/scan-report-validation';
import { writeCachedProfile } from '@/lib/profile-cache-write';


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
  if (process.env.MARKETSCOUT_NETWORK !== 'celo-sepolia') {
    return NextResponse.json(
      { error: 'Unsupported payment network' },
      { status: 503 }
    );
  }

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
  let accountingSettled = false;
  let paymentOutcome:
    | 'confirmed'
    | 'rejected'
    | 'ambiguous'
    | undefined;

  try {
    const response = await payingFetch(
      {
        account,
        network: 'celo-sepolia',
        preferredToken: 'USDC',
      },
      ENDPOINT,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username }),
        maxAmount: PAYMENT_POLICY.maxPerRequestAtomic,
        maxRetries: 1,

        onBeforePayment: async (requirements) => {
          const amount =
            validatePaymentRequirements(requirements);

          reservationId = await reservePayment(amount);
        },

        onPayment: async (info) => {
          // Record the gateway outcome before ledger accounting.
          // A failed ledger write must not erase a confirmed outcome.
          paymentOutcome = info.outcome;

          if (!reservationId) {
            throw new Error('Missing payment reservation');
          }

          // Even a rejected HTTP response can have settled.
          await settlePayment(
            reservationId,
            info.outcome === 'confirmed'
              ? 'confirmed'
              : 'ambiguous'
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
      network: 'celo-sepolia',
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
