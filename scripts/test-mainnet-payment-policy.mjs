import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');

const load = (filename, dependencies = {}) => {
  const source = readFileSync(filename, 'utf8');

  const js = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;

  const mod = { exports: {} };

  new Function('module', 'exports', 'require', js)(
    mod,
    mod.exports,
    (name) => dependencies[name] ?? require(name)
  );

  return mod.exports;
};

const oldPolicy = load('src/lib/payment-policy.ts');

const mainnet = load(
  'src/lib/mainnet-payment-policy.ts',
  { './payment-policy': oldPolicy }
);

const {
  MAINNET_PAYMENT_POLICY: policy,
  validateMainnetPaymentRequirements: validate,
} = mainnet;

const valid = {
  network: 'celo',
  scheme: 'exact',
  asset: policy.allowedToken,
  payTo: policy.allowedPayTo,
  resource:
    'https://gateway.usebuy.ai/v1/social/instagram/profile',
  maxAmountRequired: '5000',
};

const cases = [
  ['Valid mainnet USDC', valid, true],
  ['Sepolia rejected', {
    ...valid, network: 'celo-sepolia',
  }, false],
  ['Wrong token rejected', {
    ...valid, asset: '0x0000000000000000000000000000000000000001',
  }, false],
  ['Wrong recipient rejected', {
    ...valid, payTo: '0x0000000000000000000000000000000000000001',
  }, false],
  ['Wrong scheme rejected', {
    ...valid, scheme: 'deferred',
  }, false],
  ['Wrong destination rejected', {
    ...valid, resource: 'https://example.com/pay',
  }, false],
  ['Excess amount rejected', {
    ...valid, maxAmountRequired: '5001',
  }, false],
  ['Zero amount rejected', {
    ...valid, maxAmountRequired: '0',
  }, false],
  ['Negative amount rejected', {
    ...valid, maxAmountRequired: '-1',
  }, false],
  ['Malformed amount rejected', {
    ...valid, maxAmountRequired: 'not-a-number',
  }, false],
  ['Query manipulation rejected', {
    ...valid, resource: valid.resource + '?redirect=evil',
  }, false],
  ['Subdomain manipulation rejected', {
    ...valid,
    resource:
      'https://gateway.usebuy.ai.evil.com/v1/social/instagram/profile',
  }, false],
];

let passed = 0;

for (const [name, input, expected] of cases) {
  let accepted = false;

  try {
    validate(input);
    accepted = true;
  } catch {}

  const ok = accepted === expected;

  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
  if (ok) passed++;
}

console.log(`RESULT: ${passed}/${cases.length} PASS`);

if (passed !== cases.length) process.exitCode = 1;
