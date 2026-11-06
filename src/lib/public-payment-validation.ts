import { getAddress, isAddress } from 'viem';
import { MAINNET_PAYMENT_POLICY as POLICY } from './payment-mainnet-policy';

export type PublicPaymentQuote = {
  x402Version: number;
  network: string;
  chainId: number;
  token: string;
  recipient: string;
  amountAtomic: string;
  resource: string;
  accepted: {
    scheme: string;
    network: string;
    amount: string;
    asset: string;
    payTo: string;
    maxTimeoutSeconds: number;
    extra?: {
      name?: string;
      version?: string;
    };
  };
  signingEnabled: boolean;
};

export function validatePublicPaymentQuote(
  value: unknown,
): PublicPaymentQuote {
  if (!value || typeof value !== 'object') {
    throw new Error('Invalid payment quote');
  }

  const q = value as Partial<PublicPaymentQuote>;
  const a = q.accepted;

  if (!a || typeof a !== 'object') {
    throw new Error('Missing accepted payment offer');
  }

  if (
    !isAddress(q.token ?? '') ||
    !isAddress(q.recipient ?? '') ||
    !isAddress(a.asset ?? '') ||
    !isAddress(a.payTo ?? '')
  ) {
    throw new Error('Invalid payment address');
  }

  const resource = new URL(q.resource ?? '');

  if (
    resource.protocol !== 'https:' ||
    resource.hostname !== POLICY.allowedHost ||
    resource.pathname !== POLICY.allowedPath ||
    resource.search !== '' ||
    resource.hash !== '' ||
    resource.port !== '' ||
    resource.username !== '' ||
    resource.password !== ''
  ) {
    throw new Error('Payment resource rejected');
  }

  if (
    q.x402Version !== 2 ||
    q.network !== POLICY.caip2Network ||
    q.chainId !== POLICY.chainId ||
    getAddress(q.token!) !== getAddress(POLICY.allowedToken) ||
    getAddress(q.recipient!) !== getAddress(POLICY.allowedPayTo) ||
    q.amountAtomic !== POLICY.maxPerRequestAtomic.toString() ||
    a.scheme !== 'exact' ||
    a.network !== POLICY.caip2Network ||
    a.amount !== q.amountAtomic ||
    getAddress(a.asset) !== getAddress(POLICY.allowedToken) ||
    getAddress(a.payTo) !== getAddress(POLICY.allowedPayTo) ||
    !Number.isSafeInteger(a.maxTimeoutSeconds) ||
    a.maxTimeoutSeconds < 30 ||
    a.maxTimeoutSeconds > 300 ||
    a.extra?.name !== 'USDC' ||
    a.extra?.version !== '2'
  ) {
    throw new Error('Payment quote does not match Mainnet policy');
  }

  return q as PublicPaymentQuote;
}
