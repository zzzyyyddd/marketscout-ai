import {
  isAddress,
  isAddressEqual,
  isHex,
  type Address,
  type Hex,
} from 'viem';

import {
  getPaymentNetworkConfig,
  type PaymentNetwork,
} from './payment-network-config';

export type PaymentAuthorizationMetadata = {
  payer: Address;
  recipient: Address;
  token: Address;
  amount: bigint;
  nonce: Hex;
  validAfter: bigint;
  validBefore: bigint;
};

function record(value: unknown): Record<string, unknown> {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value)
  ) {
    throw new Error('Invalid payment payload');
  }

  return value as Record<string, unknown>;
}

function uint(value: unknown): bigint {
  if (
    typeof value !== 'string' ||
    !/^(0|[1-9][0-9]*)$/.test(value)
  ) {
    throw new Error('Invalid authorization integer');
  }

  return BigInt(value);
}

export function extractPaymentAuthorization(
  headers: Headers,
  requirements: unknown,
  network: PaymentNetwork = 'celo-sepolia'
): PaymentAuthorizationMetadata {
  const policy = getPaymentNetworkConfig(network);
  const v1 = headers.get('X-PAYMENT');
  const v2 = headers.get('PAYMENT-SIGNATURE');

  if ((v1 === null) === (v2 === null)) {
    throw new Error('Missing or ambiguous payment header');
  }

  const encoded = v1 ?? v2!;

  if (
    encoded.length > 16384 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)
  ) {
    throw new Error('Invalid payment encoding');
  }

  let parsed: unknown;

  try {
    const decoded = Buffer.from(encoded, 'base64');
    if (decoded.toString('base64') !== encoded) {
      throw new Error('Noncanonical encoding');
    }

    parsed = JSON.parse(decoded.toString('utf8'));
  } catch {
    throw new Error('Invalid payment payload');
  }

  const envelope = record(parsed);
  const expectedVersion = v1 !== null ? 1 : 2;

  if (
    envelope.x402Version !== expectedVersion ||
    envelope.scheme !== 'exact'
  ) {
    throw new Error('Unexpected payment version or scheme');
  }
  const payload = record(envelope.payload);
  const authorization = record(payload.authorization);

  const payer = authorization.from;
  const recipient = authorization.to;
  const amount = authorization.value;
  const nonce = authorization.nonce;

  if (
    typeof payer !== 'string' ||
    typeof recipient !== 'string' ||
    typeof nonce !== 'string' ||
    !isAddress(payer) ||
    !isAddress(recipient) ||
    !isHex(nonce, { strict: true }) ||
    nonce.length !== 66
  ) {
    throw new Error('Invalid authorization fields');
  }

  const expected = record(requirements);

  if (expected.scheme !== 'exact') {
    throw new Error('Unexpected payment scheme');
  }

  const token = expected.asset;
  const payTo = expected.payTo;
  const expectedAmount = expected.maxAmountRequired;
  const expectedNetwork = expected.network;

  if (
    typeof token !== 'string' ||
    typeof payTo !== 'string' ||
    typeof expectedAmount !== 'string' ||
    expectedNetwork !== network ||
    !isAddress(token) ||
    !isAddress(payTo) ||
    !isAddressEqual(token, policy.allowedToken) ||
    !isAddressEqual(payTo, policy.allowedPayTo) ||
    !isAddressEqual(recipient, payTo)
  ) {
    throw new Error('Unexpected payment requirements');
  }

  if (
    envelope.network !== network &&
      envelope.network !== policy.caip2Network
  ) {
    throw new Error('Unexpected payment network');
  }

  if (v2 !== null) {
    const accepted = record(envelope.accepted);

    if (
      accepted.scheme !== 'exact' ||
        accepted.network !== policy.caip2Network ||
      typeof accepted.asset !== 'string' ||
      typeof accepted.payTo !== 'string' ||
      !isAddress(accepted.asset) ||
      !isAddress(accepted.payTo) ||
      !isAddressEqual(accepted.asset, token) ||
      !isAddressEqual(accepted.payTo, payTo) ||
        accepted.amount !== expectedAmount
    ) {
      throw new Error('Unexpected v2 payment offer');
    }
  }

  const atomicAmount = uint(amount);
  const requiredAmount = uint(expectedAmount);
  const validAfter = uint(authorization.validAfter);
  const validBefore = uint(authorization.validBefore);

  if (
    atomicAmount <= BigInt(0) ||
    atomicAmount !== requiredAmount ||
    atomicAmount > policy.maxPerRequestAtomic ||
    validBefore <= validAfter
  ) {
    throw new Error('Invalid authorization bounds');
  }

  return {
    payer,
    recipient,
    token,
    amount: atomicAmount,
    nonce,
    validAfter,
    validBefore,
  };
}
