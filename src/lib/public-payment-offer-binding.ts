import 'server-only';

import { MAINNET_PAYMENT_POLICY as POLICY } from './payment-mainnet-policy';

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value)
  ) {
    throw new Error('Invalid gateway offer structure');
  }

  return value as JsonRecord;
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(canonical).join(',')}]`;
  }

  const record = asRecord(value);

  return `{${Object.keys(record)
    .sort()
    .map((key) => {
      if (record[key] === undefined) {
        throw new Error('Undefined offer field');
      }

      return `${JSON.stringify(key)}:${canonical(record[key])}`;
    })
    .join(',')}}`;
}

export async function verifyCurrentGatewayOffer(
  accepted: unknown,
  fetcher: typeof fetch = fetch,
): Promise<void> {
  const supplied = asRecord(accepted);

  const url =
    `https://${POLICY.allowedHost}${POLICY.allowedPath}`;

  const response = await fetcher(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    cache: 'no-store',
    redirect: 'error',
    signal: AbortSignal.timeout(12000),
  });

  if (response.status !== 402) {
    throw new Error('Gateway payment challenge unavailable');
  }

  const encoded = response.headers.get('payment-required');

  if (!encoded || encoded.length > 16000) {
    throw new Error('Invalid gateway challenge header');
  }

  const challenge = asRecord(
    JSON.parse(Buffer.from(encoded, 'base64').toString('utf8')),
  );

  const resource = asRecord(challenge.resource);

  if (
    challenge.x402Version !== 2 ||
    resource.url !== url ||
    !Array.isArray(challenge.accepts)
  ) {
    throw new Error('Gateway challenge rejected');
  }

  const matching = challenge.accepts.filter(
    (offer: unknown) => canonical(offer) === canonical(supplied),
  );

  if (matching.length !== 1) {
    throw new Error('Payment offer no longer matches gateway');
  }
}
