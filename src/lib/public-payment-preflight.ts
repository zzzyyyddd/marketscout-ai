import 'client-only';

import {
  createPublicClient,
  getAddress,
  http,
  type Address,
  type EIP1193Provider,
} from 'viem';
import { celo } from 'viem/chains';

import { preparePublicPayment } from './prepare-public-payment';

const publicClient = createPublicClient({
  chain: celo,
  transport: http('https://forno.celo.org'),
});

const balanceAbi = [{
  type: 'function',
  name: 'balanceOf',
  inputs: [{ name: 'owner', type: 'address' }],
  outputs: [{ type: 'uint256' }],
  stateMutability: 'view',
}] as const;

export async function checkPublicPaymentPreflight(
  rawQuote: unknown,
) {
  const provider = (window as Window & {
    ethereum?: EIP1193Provider;
  }).ethereum;

  if (!provider) {
    throw new Error('MetaMask or Rabby is not available');
  }

  const accounts = await provider.request({
    method: 'eth_accounts',
  }) as string[];

  if (!Array.isArray(accounts) || !accounts[0]) {
    throw new Error('Connect your wallet first');
  }

  const payer: Address = getAddress(accounts[0]);

  const chainId = await provider.request({
    method: 'eth_chainId',
  }) as string;

  if (BigInt(chainId) !== BigInt(celo.id)) {
    throw new Error('Switch wallet to Celo Mainnet');
  }

  const prepared = preparePublicPayment(payer, rawQuote);

  const balance = await publicClient.readContract({
    address: getAddress(prepared.quote.token),
    abi: balanceAbi,
    functionName: 'balanceOf',
    args: [payer],
  });

  if (balance < BigInt(prepared.quote.amountAtomic)) {
    throw new Error('Insufficient USDC balance for this scan');
  }

  return {
    payer,
    chainId: celo.id,
    balanceAtomic: balance.toString(),
    prepared,
  };
}
