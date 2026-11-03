import { randomBytes } from 'node:crypto';
import { privateKeyToAccount } from 'viem/accounts';
import { payingFetch } from '@celo/buy-core/x402';

const endpoint =
  'https://gateway.usebuy.ai/v1/social/instagram/profile';

const asset =
  '0x01C5C0122039549AD1493B8220cABEdD739BC44E';

const payTo =
  '0x20faAca5F980E29639A0FCC6dcA6988E18ed333B';

const account = privateKeyToAccount(
  `0x${randomBytes(32).toString('hex')}`
);

const offer = {
  scheme: 'exact',
  network: 'celo-sepolia',
  maxAmountRequired: '5000',
  resource: endpoint,
  description: 'Instagram profile',
  mimeType: 'application/json',
  payTo,
  maxTimeoutSeconds: 60,
  asset,
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

async function runScenario(name, behavior) {
  let probes = 0;
  let paidRequests = 0;
  let reservations = 0;
  let outcome;

  const mockFetch = async (_url, init = {}) => {
    const headers = new Headers(init.headers);

    const isPaid =
      headers.has('X-PAYMENT') ||
      headers.has('PAYMENT-SIGNATURE');

    if (!isPaid) {
      probes++;

      return new Response(challenge, {
        status: 402,
        headers: {
          'Content-Type': 'application/json',
        },
      });
    }

    paidRequests++;

    if (behavior === 'network-error') {
      throw new Error('Simulated network disconnect');
    }

    return new Response(
      JSON.stringify({ ok: behavior === 'success' }),
      {
        status: behavior === 'success' ? 200 : 500,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
  };

  try {
    await payingFetch(
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
        onBeforePayment: () => {
          reservations++;
        },
        onPayment: (info) => {
          outcome = info.outcome;
        },
      }
    );
  } catch (error) {
    if (behavior !== 'network-error') {
      console.log(
        'SDK error:',
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  const expectedOutcome =
    behavior === 'success'
      ? 'confirmed'
      : behavior === 'server-error'
        ? 'ambiguous'
        : undefined;

  const pass =
    probes === 1 &&
    paidRequests === 1 &&
    reservations === 1 &&
    outcome === expectedOutcome;

  console.log(
    `${pass ? 'PASS' : 'FAIL'} ${name}`,
    {
      probes,
      paidRequests,
      reservations,
      outcome: outcome ?? 'not reported',
    }
  );

  return pass;
}

const results = await Promise.all([
  runScenario('HTTP 200', 'success'),
  runScenario('HTTP 500', 'server-error'),
  runScenario('Network disconnect', 'network-error'),
]);

const passed = results.filter(Boolean).length;

console.log(`RESULT: ${passed}/3 PASS`);

if (passed !== 3) {
  process.exitCode = 1;
}
