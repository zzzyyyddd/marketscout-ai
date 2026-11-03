export const PAYMENT_POLICY = {
  network: 'celo-sepolia',
  allowedToken: '0x01C5C0122039549AD1493B8220cABEdD739BC44E',
  allowedPayTo: '0x20faAca5F980E29639A0FCC6dcA6988E18ed333B',
  allowedHost: 'gateway.usebuy.ai',
  allowedPath: '/v1/social/instagram/profile',
  maxPerRequestAtomic: BigInt(5000),
  maxDailyAtomic: BigInt(50000),
  maxProfilesPerScan: 1,
} as const;

export function validateInstagramUsername(
  value: unknown
): string {
  if (typeof value !== 'string') {
    throw new Error('Username must be a string');
  }

  const username = value.trim().replace(/^@/, '');

  if (!/^(?!.*\.\.)(?!\.)(?!.*\.$)[A-Za-z0-9._]{1,30}$/.test(username)) {
    throw new Error('Invalid Instagram username');
  }

  return username;
}

export function validatePaymentDestination(
  url: string
): void {
  const parsed = new URL(url);

  if (
    parsed.protocol !== 'https:' ||
    parsed.hostname !== PAYMENT_POLICY.allowedHost ||
    parsed.pathname !== PAYMENT_POLICY.allowedPath ||
    parsed.search !== '' ||
    parsed.hash !== '' ||
    parsed.port !== ''
  ) {
    throw new Error('Payment destination not allowed');
  }
}


export function validatePaymentRequirements(
  requirements: {
    network: string;
    asset: string;
    resource: string;
    payTo: string;
    maxAmountRequired: string;
  }
): number {
  validatePaymentDestination(requirements.resource);

  const amount = BigInt(requirements.maxAmountRequired);

  if (
    requirements.payTo.toLowerCase() !==
      PAYMENT_POLICY.allowedPayTo.toLowerCase() ||
    requirements.network !== PAYMENT_POLICY.network ||
    requirements.asset.toLowerCase() !==
      PAYMENT_POLICY.allowedToken.toLowerCase() ||
    amount <= BigInt(0) ||
    amount > PAYMENT_POLICY.maxPerRequestAtomic
  ) {
    throw new Error('Payment requirements rejected');
  }

  return Number(amount);
}
