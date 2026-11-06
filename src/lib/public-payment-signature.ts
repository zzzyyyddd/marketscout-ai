import 'server-only';

import {
  getAddress,
  verifyTypedData,
  type Address,
  type Hex,
} from 'viem';

import { MAINNET_PAYMENT_POLICY as POLICY } from './payment-mainnet-policy';
import { validatePublicPaymentPayload } from './public-payment-payload';

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid payment payload');
  }
  return value as JsonRecord;
}

function string(value: unknown): string {
  if (typeof value !== 'string') {
    throw new Error('Invalid payment field');
  }
  return value;
}

function uint(value: unknown): bigint {
  const raw = string(value);
  if (!/^(0|[1-9][0-9]*)$/.test(raw)) {
    throw new Error('Invalid unsigned integer');
  }
  return BigInt(raw);
}

export async function verifyPublicPaymentSignature(
  header: string,
  expectedPayer: string,
) {
  const validated = validatePublicPaymentPayload(
    header,
    expectedPayer,
  );

  const envelope = record(
    JSON.parse(Buffer.from(header, 'base64').toString('utf8'))
  );

  const payload = record(envelope.payload);
  const authorization = record(payload.authorization);

  const from = getAddress(string(authorization.from));
  const to = getAddress(string(authorization.to));
  const signature = string(payload.signature) as Hex;

  const valid = await verifyTypedData({
    address: from,
    domain: {
      name: 'USDC',
      version: '2',
      chainId: POLICY.chainId,
      verifyingContract: getAddress(POLICY.allowedToken),
    },
    types: {
      TransferWithAuthorization: [
        { name: 'from', type: 'address' },
        { name: 'to', type: 'address' },
        { name: 'value', type: 'uint256' },
        { name: 'validAfter', type: 'uint256' },
        { name: 'validBefore', type: 'uint256' },
        { name: 'nonce', type: 'bytes32' },
      ],
    },
    primaryType: 'TransferWithAuthorization',
    message: {
      from,
      to,
      value: uint(authorization.value),
      validAfter: uint(authorization.validAfter),
      validBefore: uint(authorization.validBefore),
      nonce: string(authorization.nonce) as Hex,
    },
    signature,
  });

  if (!valid) {
    throw new Error('Invalid EIP-712 payment signature');
  }

  if (from !== getAddress(expectedPayer as Address)) {
    throw new Error('Payment signer mismatch');
  }

  return validated;
}
