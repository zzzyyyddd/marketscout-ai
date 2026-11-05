import { PAYMENT_POLICY } from './payment-policy';
import { MAINNET_PAYMENT_POLICY } from './payment-mainnet-policy';

export const PAYMENT_NETWORKS = {
  'celo-sepolia': {
    ...PAYMENT_POLICY,
    chainId: 11142220,
    caip2Network: 'eip155:11142220',
    rpcUrls: [
      'https://forno.celo-sepolia.celo-testnet.org',
      'https://celo-sepolia.drpc.org',
    ],
  },
  celo: {
    ...MAINNET_PAYMENT_POLICY,
    rpcUrls: [
      'https://forno.celo.org',
    ],
  },
} as const;

export type PaymentNetwork = keyof typeof PAYMENT_NETWORKS;

export function getPaymentNetworkConfig(
  network: PaymentNetwork
) {
  return PAYMENT_NETWORKS[network];
}
