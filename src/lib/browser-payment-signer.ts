import 'client-only';

import {
  createWalletClient,
  custom,
  getAddress,
  type Address,
  type Hex,
  type TypedData,
  type TypedDataDefinition,
} from 'viem';
import { toAccount } from 'viem/accounts';
import { celo } from 'viem/chains';

type BrowserProvider = {
  request(args: {
    method: string;
    params?: unknown[];
  }): Promise<unknown>;
};

export async function createBrowserPaymentSigner(
  provider: BrowserProvider,
  expectedAddress: Address,
) {
  const [accounts, chainId] = await Promise.all([
    provider.request({
      method: 'eth_accounts',
    }),
    provider.request({
      method: 'eth_chainId',
    }),
  ]);

  if (
    !Array.isArray(accounts) ||
    typeof accounts[0] !== 'string'
  ) {
    throw new Error('Wallet is not connected');
  }

  const address = getAddress(accounts[0]);

  if (address !== getAddress(expectedAddress)) {
    throw new Error('Connected wallet address mismatch');
  }

  if (
    typeof chainId !== 'string' ||
    Number.parseInt(chainId, 16) !== celo.id
  ) {
    throw new Error('Wallet must be connected to Celo Mainnet');
  }

  const walletClient = createWalletClient({
    account: address,
    chain: celo,
    transport: custom(provider as never),
  });

  return toAccount({
    address,

    // These operations are deliberately unsupported.
    // Payment authorization only uses EIP-712 signing.
    async signMessage() {
      throw new Error('Message signing is disabled');
    },

    async signTransaction() {
      throw new Error('Transaction signing is disabled');
    },

    async signTypedData<
      const T extends TypedData | Record<string, unknown>,
      P extends keyof T | 'EIP712Domain' = keyof T,
    >(
      parameters: TypedDataDefinition<T, P>,
    ): Promise<Hex> {
      const [currentAccounts, currentChain] =
        await Promise.all([
          provider.request({ method: 'eth_accounts' }),
          provider.request({ method: 'eth_chainId' }),
        ]);

      if (
        !Array.isArray(currentAccounts) ||
        typeof currentAccounts[0] !== 'string' ||
        getAddress(currentAccounts[0]) !== address
      ) {
        throw new Error('Wallet account changed');
      }

      if (
        typeof currentChain !== 'string' ||
        Number.parseInt(currentChain, 16) !== celo.id
      ) {
        throw new Error('Wallet network changed');
      }

      return walletClient.signTypedData({
        ...parameters,
        account: address,
        chain: celo,
      } as never);
    },
  });
}
