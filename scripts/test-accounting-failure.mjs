import { randomBytes } from 'node:crypto';
import { privateKeyToAccount } from 'viem/accounts';
import { payingFetch } from '@celo/buy-core/x402';

const endpoint =
  'https://gateway.usebuy.ai/v1/social/instagram/profile';

const offer = {
  scheme: 'exact',
  network: 'celo-sepolia',
  maxAmountRequired: '5000',
  resource: endpoint,
  description: 'Instagram profile',
  mimeType: 'application/json',
  payTo: '0x20faAca5F980E29639A0FCC6dcA6988E18ed333B',
  maxTimeoutSeconds: 60,
  asset: '0x01C5C0122039549AD1493B8220cABEdD739BC44E',
  extra: {
    name: 'USD Coin',
    version: '2',
  },
};

const challenge = JSON.stringify({
  x402Version: 1,
  error: 'Payment required',
  accepts: [offer],
});

const account = privateKeyToAccount(
  `0x${randomBytes(32).toString('hex')}`
);

async function test(name, failAt) {
  let probes = 0;
  let paidRequests = 0;
  let accountingErrors = 0;
  let reservationId;
  let paymentOutcome;
  let reportedSuccess = false;

  const mockFetch = async (_url, init = {}) => {
    const headers = new Headers(init.headers);

    if (
      !headers.has('X-PAYMENT') &&
      !headers.has('PAYMENT-SIGNATURE')
    ) {
      probes++;

      return new Response(challenge, {
        status: 402,
        headers: {
          'Content-Type': 'application/json',
        },
      });
    }

    paidRequests++;

    return new Response(
      JSON.stringify({ ok: true }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
  };

  try {
    const response = await payingFetch(
      {
        account,
        network: 'celo-sepolia',
        preferredToken: 'USDC',
        fetchImpl: mockFetch,
      },
      endpoint,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username: 'instagram' }),
        maxAmount: 5000n,
        maxRetries: 1,

        onBeforePayment: async () => {
          if (failAt === 'reservation') {
            throw new Error('Simulated Supabase reservation failure');
          }

          reservationId = 'mock-reservation-id';
        },

        onPayment: async (info) => {
          if (!reservationId) {
            throw new Error('Missing reservation');
          }

          if (failAt === 'settlement') {
            throw new Error('Simulated Supabase settlement failure');
          }

          paymentOutcome = info.outcome;
        },

        onAccountingError: () => {
          accountingErrors++;
        },
      }
    );

    reportedSuccess =
      response.ok &&
      paymentOutcome === 'confirmed';

  } catch (error) {
    console.log(
      'DIAGNOSTIC',
      name,
      error instanceof Error ? error.message : String(error)
    );
  }

  const pass =
    probes === 1 &&
    paidRequests === (failAt === 'reservation' ? 0 : 1) &&
    accountingErrors === (failAt === 'settlement' ? 1 : 0) &&
    reportedSuccess === false;

  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}`, {
    probes,
    paidRequests,
    accountingErrors,
    reportedSuccess,
  });

  return pass;
}

const results = [];

results.push(
  await test('Reservation failure blocks payment', 'reservation')
);

results.push(
  await test('Settlement failure blocks success', 'settlement')
);

const passed = results.filter(Boolean).length;

console.log(`RESULT: ${passed}/2 PASS`);

if (passed !== 2) {
  process.exitCode = 1;
}
