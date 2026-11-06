import 'server-only';

import { getAddress, isAddress } from 'viem';
import { MAINNET_PAYMENT_POLICY as POLICY } from './payment-mainnet-policy';
import { validateInstagramUsername } from './payment-policy';

type PaymentAuthorization = {
  from: string;
  to: string;
  value: string;
  validAfter: string;
  validBefore: string;
  nonce: string;
};

export type PublicPaymentRequest = {
  username: string;
  payer: string;
  paymentHeader: string;
};

export function validatePublicPaymentRequest(
  input: unknown,
): PublicPaymentRequest {
  if (!input || typeof input !== 'object') {
    throw new Error('Invalid payment request');
  }

  const value = input as Record<string, unknown>;

  const username = validateInstagramUsername(value.username);

  if (typeof value.payer !== 'string' || !isAddress(value.payer)) {
    throw new Error('Invalid payer');
  }

  if (
    typeof value.paymentHeader !== 'string' ||
    value.paymentHeader.length < 50 ||
    value.paymentHeader.length > 16000 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(value.paymentHeader)
  ) {
    throw new Error('Invalid payment header');
  }

  return {
    username,
    payer: getAddress(value.payer),
    paymentHeader: value.paymentHeader,
  };
}

export function validatePublicAuthorization(
  authorization: PaymentAuthorization,
  expectedPayer: string,
): void {
  if (
    !isAddress(authorization.from) ||
    !isAddress(authorization.to) ||
    getAddress(authorization.from) !== getAddress(expectedPayer) ||
    getAddress(authorization.to) !== getAddress(POLICY.allowedPayTo) ||
    authorization.value !== POLICY.maxPerRequestAtomic.toString() ||
    !/^0x[0-9a-fA-F]{64}$/.test(authorization.nonce)
  ) {
    throw new Error('Payment authorization rejected');
  }

  const now = BigInt(Math.floor(Date.now() / 1000));
  const validAfter = BigInt(authorization.validAfter);
  const validBefore = BigInt(authorization.validBefore);

  if (
    validAfter > now ||
    validBefore <= now ||
    validBefore - now > BigInt(300)
  ) {
    throw new Error('Payment authorization expired or outside policy');
  }
}
