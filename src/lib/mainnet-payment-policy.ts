import {
  validateInstagramUsername,
  validatePaymentDestination,
} from './payment-policy';

export const MAINNET_PAYMENT_POLICY = {
  network: 'celo',
  chainId: 42220,
  allowedToken: '0xcebA9300f2b948710d2653dD7B07f33A8B32118C',
  allowedPayTo: '0x20faAca5F980E29639A0FCC6dcA6988E18ed333B',
  maxPerRequestAtomic: BigInt(5000),
  maxDailyAtomic: BigInt(50000),
  maxProfilesPerScan: 1,
} as const;

export { validateInstagramUsername };

export function validateMainnetPaymentRequirements(
  requirements: {
    network: string;
    asset: string;
    resource: string;
    payTo: string;
    maxAmountRequired: string;
    scheme: string;
  }
): number {
  validatePaymentDestination(requirements.resource);

  if (
    requirements.network !== MAINNET_PAYMENT_POLICY.network ||
    requirements.scheme !== 'exact' ||
    requirements.asset.toLowerCase() !==
      MAINNET_PAYMENT_POLICY.allowedToken.toLowerCase() ||
    requirements.payTo.toLowerCase() !==
      MAINNET_PAYMENT_POLICY.allowedPayTo.toLowerCase()
  ) {
    throw new Error('Mainnet payment requirements rejected');
  }

  if (!/^[0-9]+$/.test(requirements.maxAmountRequired)) {
    throw new Error('Invalid payment amount');
  }

  const amount = BigInt(requirements.maxAmountRequired);

  if (
    amount <= BigInt(0) ||
    amount > MAINNET_PAYMENT_POLICY.maxPerRequestAtomic
  ) {
    throw new Error('Mainnet payment amount rejected');
  }

  return Number(amount);
}
