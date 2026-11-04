/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const assert = require('node:assert/strict');

const source = fs.readFileSync(
  'src/app/api/scan/route.ts',
  'utf8'
);

const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    esModuleInterop: true,
  },
}).outputText;

const report = {
  username: 'nike',
  followers: 100,
  sampledPosts: 1,
};

let scenario;
let cacheCalls;
let paymentCalls;
let settlementCalls;

const mocks = {
  'next/server': {
    NextResponse: {
      json: (data, options = {}) =>
        Response.json(data, {
          status: options.status ?? 200,
        }),
    },
  },
  'viem/accounts': {
    privateKeyToAccount: () => ({ address: 'mock' }),
  },
  '@celo/buy-core/x402': {
    payingFetch: async (_ctx, _url, options) => {
      paymentCalls++;

      await options.onBeforePayment({
        maxAmountRequired: '5000',
      });

      await options.onPayment({
        outcome: scenario.outcome,
      }).catch(error => {
        options.onAccountingError(error);
      });

      return Response.json(
        scenario.invalidReport
          ? { invalid: true }
          : { username: 'nike' },
        { status: scenario.httpStatus ?? 200 }
      );
    },
  },
  '@/lib/auth': {
    isAuthorized: () => true,
  },
  '@/lib/payment-policy': {
    PAYMENT_POLICY: {
      maxPerRequestAtomic: 5000n,
    },
    validateInstagramUsername: value => {
      if (value !== 'nike') {
        throw new Error('Invalid username');
      }
      return value;
    },
    validatePaymentDestination: () => true,
    validatePaymentRequirements: () => 5000n,
  },
  '@/lib/supabase-ledger': {
    reservePayment: async () => 'mock-reservation',
    settlePayment: async () => {
      settlementCalls++;
      if (scenario.settlementFails) {
        throw new Error('Mock settlement failure');
      }
    },
  },
  '@/lib/scan-report-validation': {
    validateScanReport: raw => {
      if (raw.invalid) {
        throw new Error('Invalid report');
      }
      return report;
    },
  },
  '@/lib/profile-cache-write': {
    writeCachedProfile: async () => {
      cacheCalls++;
      if (scenario.cacheFails) {
        throw new Error('Mock cache failure');
      }
      return scenario.cacheStored !== false;
    },
  },
};

const sandbox = {
  exports: {},
  require: name => {
    if (!(name in mocks)) {
      throw new Error(`Unexpected import: ${name}`);
    }
    return mocks[name];
  },
  process: {
    env: {
      MARKETSCOUT_ENABLE_PAYMENTS: 'true',
      NODE_ENV: 'test',
      MARKETSCOUT_NETWORK: 'celo-sepolia',
      MARKETSCOUT_PRIVATE_KEY: '0x' + '1'.repeat(64),
    },
  },
  Response,
  Request,
  Headers,
  console: {
    error: () => {},
  },
};

vm.runInNewContext(compiled, sandbox);

const { POST } = sandbox.exports;

async function run(name, settings, expected) {
  scenario = settings;
  cacheCalls = 0;
  paymentCalls = 0;
  settlementCalls = 0;

  const request = new Request(
    'http://localhost/api/scan',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ username: 'nike' }),
    }
  );

  try {
    const response = await POST(request);
    const body = await response.json();

    assert.equal(response.status, expected.status);
    assert.equal(cacheCalls, expected.cacheCalls);
    assert.equal(paymentCalls, 1);
    assert.equal(settlementCalls, 1);

    if (expected.cacheStatus) {
      assert.equal(
        body.cache.status,
        expected.cacheStatus
      );
      assert.equal(body.report.username, 'nike');
    } else {
      assert.equal(body.report, undefined);
    }

    console.log(`PASS ${name}`);
    return true;
  } catch (error) {
    console.log(`FAIL ${name}: ${error.message}`);
    return false;
  }
}

(async () => {
  const results = [];

  results.push(await run(
    'Confirmed + cache stored',
    { outcome: 'confirmed' },
    { status: 200, cacheCalls: 1, cacheStatus: 'stored' }
  ));

  results.push(await run(
    'Confirmed + cache failure',
    { outcome: 'confirmed', cacheFails: true },
    { status: 200, cacheCalls: 1, cacheStatus: 'failed' }
  ));

  results.push(await run(
    'Confirmed + cache not updated',
    { outcome: 'confirmed', cacheStored: false },
    { status: 200, cacheCalls: 1, cacheStatus: 'not_updated' }
  ));

  results.push(await run(
    'Ambiguous payment',
    { outcome: 'ambiguous', httpStatus: 500 },
    { status: 502, cacheCalls: 0 }
  ));

  results.push(await run(
    'Invalid gateway report',
    { outcome: 'confirmed', invalidReport: true },
    { status: 502, cacheCalls: 0 }
  ));

  results.push(await run(
    'Confirmed + settlement failure',
    { outcome: 'confirmed', settlementFails: true },
    { status: 200, cacheCalls: 1, cacheStatus: 'stored' }
  ));

  const passed = results.filter(Boolean).length;

  console.log(`RESULT: ${passed}/6 PASS`);

  if (passed !== 6) {
    process.exitCode = 1;
  }
})();
