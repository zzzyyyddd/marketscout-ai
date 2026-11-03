import { randomBytes } from 'node:crypto';
import {
  mkdtempSync,
  readFileSync,
  writeFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { privateKeyToAccount } from 'viem/accounts';
import { payingFetch } from '@celo/buy-core/x402';

const require = createRequire(import.meta.url);
const ts = require('typescript');

const originalCwd = process.cwd();
const dir = mkdtempSync(join(tmpdir(), 'marketscout-ledger-'));

const source = readFileSync(
  'src/lib/budget-ledger.ts',
  'utf8'
).replace("import 'server-only';", '');

const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    esModuleInterop: true,
  },
}).outputText;

const modulePath = join(dir, 'ledger.cjs');
writeFileSync(modulePath, compiled);

process.chdir(dir);

const {
  reservePayment,
  settlePayment,
} = require(modulePath);

const { DatabaseSync } = require('node:sqlite');

const db = new DatabaseSync(
  join(dir, '.market-scout-state', 'budget.sqlite')
);

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

let failures = 0;

async function test(name, behavior, expectedStatus) {
  let reservationId;
  let paidRequests = 0;

  const mockFetch = async (_url, init = {}) => {
    const headers = new Headers(init.headers);

    if (!headers.has('X-PAYMENT')) {
      return new Response(challenge, {
        status: 402,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    paidRequests++;

    if (behavior === 'disconnect') {
      throw new Error('Simulated disconnect');
    }

    return new Response('{}', {
      status: behavior === 'success' ? 200 : 500,
    });
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
        body: JSON.stringify({ username: 'instagram' }),
        headers: { 'Content-Type': 'application/json' },
        maxAmount: 5000n,
        maxRetries: 1,
        onBeforePayment: () => {
          reservationId = reservePayment(5000);
        },
        onPayment: (info) => {
          settlePayment(
            reservationId,
            info.outcome === 'confirmed'
              ? 'confirmed'
              : 'ambiguous'
          );
        },
      }
    );
  } catch {}

  const row = db.prepare(
    'SELECT status FROM payments WHERE id=?'
  ).get(reservationId);

  const pass =
    paidRequests === 1 &&
    row?.status === expectedStatus;

  console.log(
    `${pass ? 'PASS' : 'FAIL'} ${name}: ` +
    `status=${row?.status}, paidRequests=${paidRequests}`
  );

  if (!pass) failures++;
}

try {
  await test('HTTP 200', 'success', 'confirmed');
  await test('HTTP 500', 'error', 'ambiguous');
  await test('Network disconnect', 'disconnect', 'reserved');

  const rows = db.prepare(
    `SELECT status, SUM(amount) AS total
     FROM payments GROUP BY status`
  ).all();

  console.log('Ledger summary:', rows);
  console.log(`RESULT: ${3 - failures}/3 PASS`);

  if (failures) process.exitCode = 1;
} finally {
  db.close();
  process.chdir(originalCwd);
  rmSync(dir, { recursive: true, force: true });
}
