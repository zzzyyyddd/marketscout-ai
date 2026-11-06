import 'server-only';

import { getAddress, isAddress } from 'viem';
import { MAINNET_PAYMENT_POLICY as POLICY } from './payment-mainnet-policy';
import {
  validatePublicAuthorization,
} from './public-payment-relay-guard';

type RecordValue = Record<string, unknown>;

function asRecord(value: unknown): RecordValue {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value)
  ) {
    throw new Error('Invalid payment payload structure');
  }

  return value as RecordValue;
}

function requireString(value: unknown): string {
  if (typeof value !== 'string') {
    throw new Error('Invalid payment payload field');
  }

  return value;
}

export function validatePublicPaymentPayload(
  header: string,
  expectedPayer: string,
) {
  if (
    typeof header !== 'string' ||
    header.length < 50 ||
    header.length > 16000 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(header)
  ) {
    throw new Error('Invalid payment header');
  }

  const decoded: unknown = JSON.parse(
    Buffer.from(header, 'base64').toString('utf8')
  );

  const payload = asRecord(decoded);
  const inner = asRecord(payload.payload);
  const authorization = asRecord(inner.authorization);

  const accepted = asRecord(payload.accepted);
  const extra = asRecord(accepted.extra);

  if (
    payload.x402Version !== 2 ||
    payload.scheme !== 'exact' ||
    payload.network !== POLICY.caip2Network ||
    accepted.scheme !== 'exact' ||
    accepted.network !== POLICY.caip2Network ||
    accepted.amount !== POLICY.maxPerRequestAtomic.toString() ||
    typeof accepted.asset !== 'string' ||
    typeof accepted.payTo !== 'string' ||
    !isAddress(accepted.asset) ||
    !isAddress(accepted.payTo) ||
    getAddress(accepted.asset) !== getAddress(POLICY.allowedToken) ||
    getAddress(accepted.payTo) !== getAddress(POLICY.allowedPayTo) ||
    extra.name !== 'USDC' ||
    extra.version !== '2' ||
    !Number.isSafeInteger(accepted.maxTimeoutSeconds) ||
    Number(accepted.maxTimeoutSeconds) < 30 ||
    Number(accepted.maxTimeoutSeconds) > 300
  ) {
    throw new Error('Payment offer rejected');
  }

  const asset = getAddress(accepted.asset);
  const payTo = getAddress(accepted.payTo);

  if (inner.signature === undefined ||
      typeof inner.signature !== 'string' ||
      !/^0x[0-9a-fA-F]{130}$/.test(inner.signature)) {
    throw new Error('Invalid signature encoding');
  }

  const fields = {
    from: requireString(authorization.from),
    to: requireString(authorization.to),
    value: requireString(authorization.value),
    validAfter: requireString(authorization.validAfter),
    validBefore: requireString(authorization.validBefore),
    nonce: requireString(authorization.nonce),
  };

  validatePublicAuthorization(fields, expectedPayer);

  return {
    payer: getAddress(fields.from),
    nonce: fields.nonce,
    amountAtomic: fields.value,
    token: getAddress(asset),
    recipient: getAddress(payTo),
    validAfter: fields.validAfter,
    validBefore: fields.validBefore,
  };
}
