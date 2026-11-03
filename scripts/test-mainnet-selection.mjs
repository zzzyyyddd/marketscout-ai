import {
  parseEnvelope,
  selectRequirements,
} from '@celo/buy-core/x402';

const endpoint =
  'https://gateway.usebuy.ai/v1/social/instagram/profile';

const expectedAsset =
  '0xcebA9300f2b948710d2653dD7B07f33A8B32118C';

const expectedRecipient =
  '0x20faAca5F980E29639A0FCC6dcA6988E18ed333B';

const response = await fetch(endpoint, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ username: 'instagram' }),
  signal: AbortSignal.timeout(15000),
});

if (response.status !== 402) {
  throw new Error(`Expected HTTP 402, got ${response.status}`);
}

console.log('PASS Gateway returned HTTP 402');

const envelope = parseEnvelope(await response.text());

if (!envelope) {
  throw new Error('SDK rejected gateway x402 envelope');
}

console.log('PASS SDK parsed live x402 challenge');

const selected = selectRequirements(
  envelope,
  'celo',
  'USDC'
);

if (!selected) {
  throw new Error('No compatible mainnet offer');
}

console.log('Selected network:', selected.network);
console.log('Selected asset:', selected.asset);
console.log('Selected amount:', selected.maxAmountRequired);
console.log('Selected recipient:', selected.payTo);

if (selected.network !== 'celo') {
  throw new Error('Wrong network');
}

console.log('PASS Celo Mainnet selected');

if (
  selected.asset.toLowerCase() !==
  expectedAsset.toLowerCase()
) {
  throw new Error('Wrong token selected');
}

console.log('PASS Mainnet USDC selected');

if (BigInt(selected.maxAmountRequired) !== 5000n) {
  throw new Error('Unexpected payment amount');
}

console.log('PASS Payment amount is 5000 atomic units');

if (
  selected.payTo.toLowerCase() !==
  expectedRecipient.toLowerCase()
) {
  throw new Error('Unexpected payment recipient');
}

console.log('PASS Recipient matches observed allowlist');

console.log('RESULT: 6/6 PASS');
console.log('NO PAYMENT SENT');
