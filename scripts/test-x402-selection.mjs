import {
  parseEnvelope,
  selectRequirements,
} from '@celo/buy-core/x402';

const resource =
  'https://gateway.usebuy.ai/v1/social/instagram/profile';

const recipient =
  '0x20faAca5F980E29639A0FCC6dcA6988E18ed333B';

function offer(network, asset) {
  return {
    scheme: 'exact',
    network,
    maxAmountRequired: '5000',
    resource,
    description: 'Instagram profile',
    mimeType: 'application/json',
    payTo: recipient,
    maxTimeoutSeconds: 60,
    asset,
    extra: {
      name: 'USD Coin',
      version: '2',
    },
  };
}

const envelope = {
  x402Version: 1,
  error: 'Payment required',
  accepts: [
    offer(
      'celo',
      '0xcebA9300f2b948710d2653dD7B07f33A8B32118C'
    ),
    offer(
      'celo-sepolia',
      '0x01C5C0122039549AD1493B8220cABEdD739BC44E'
    ),
  ],
};

const parsed = parseEnvelope(JSON.stringify(envelope));

if (!parsed) {
  throw new Error('SDK rejected the x402 envelope');
}

console.log('PASS SDK parsed x402 v1');

const selected = selectRequirements(
  parsed,
  'celo-sepolia',
  'USDC'
);

if (!selected) {
  throw new Error('SDK found no matching offer');
}

if (selected.network !== 'celo-sepolia') {
  throw new Error('SDK selected wrong network');
}

console.log('PASS SDK selected Celo Sepolia');

if (
  selected.asset.toLowerCase() !==
  '0x01C5C0122039549AD1493B8220cABEdD739BC44E'.toLowerCase()
) {
  throw new Error('SDK selected wrong token');
}

console.log('PASS SDK selected Sepolia USDC');
console.log('RESULT: 3/3 PASS');
