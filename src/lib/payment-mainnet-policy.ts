/**
 * Celo mainnet x402 payment offer observed from the
 * buy-gateway Instagram profile endpoint.
 *
 * This file does NOT activate payments.
 * Revalidate the gateway offer before any paid call.
 */
export const MAINNET_PAYMENT_POLICY = {
  network: 'celo',
  caip2Network: 'eip155:42220',
  chainId: 42220,
  allowedToken: '0xcebA9300f2b948710d2653dD7B07f33A8B32118C',
  allowedPayTo: '0x20faAca5F980E29639A0FCC6dcA6988E18ed333B',
  allowedHost: 'gateway.usebuy.ai',
  allowedPath: '/v1/social/instagram/profile',
  maxPerRequestAtomic: BigInt(5000),
  maxDailyAtomic: BigInt(50000),
  maxProfilesPerScan: 1,
} as const;
