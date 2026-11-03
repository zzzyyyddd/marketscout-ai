import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');

const source = readFileSync(
  'src/lib/payment-policy.ts',
  'utf8'
);

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
  require
);

const {
  PAYMENT_POLICY,
  validatePaymentRequirements,
} = mod.exports;

const valid = {
  network: 'celo-sepolia',
  asset: PAYMENT_POLICY.allowedToken,
  payTo: PAYMENT_POLICY.allowedPayTo,
  resource:
    'https://gateway.usebuy.ai/v1/social/instagram/profile',
  maxAmountRequired: '5000',
};

const cases = [
  ['Valid payment', valid, true],
  ['Fake token', {
    ...valid,
    asset: '0x0000000000000000000000000000000000000001',
  }, false],
  ['Wrong payment recipient', {
    ...valid,
    payTo: '0x0000000000000000000000000000000000000001',
  }, false],
  ['Wrong network', {
    ...valid,
    network: 'celo',
  }, false],
  ['Wrong destination', {
    ...valid,
    resource: 'https://example.com/collect',
  }, false],
  ['Excessive amount', {
    ...valid,
    maxAmountRequired: '5001',
  }, false],
  ['Zero amount', {
    ...valid,
    maxAmountRequired: '0',
  }, false],
  ['Negative amount', {
    ...valid,
    maxAmountRequired: '-1',
  }, false],
  ['URL query manipulation', {
    ...valid,
    resource: valid.resource + '?redirect=evil',
  }, false],
  ['URL subdomain manipulation', {
    ...valid,
    resource:
      'https://gateway.usebuy.ai.evil.com/v1/social/instagram/profile',
  }, false],
];

let failures = 0;

for (const [name, requirements, expected] of cases) {
  let accepted = false;

  try {
    validatePaymentRequirements(requirements);
    accepted = true;
  } catch {}

  const pass = accepted === expected;

  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}`);

  if (!pass) failures++;
}

console.log(
  `\nRESULT: ${cases.length - failures}/${cases.length} PASS`
);

if (failures) process.exitCode = 1;
