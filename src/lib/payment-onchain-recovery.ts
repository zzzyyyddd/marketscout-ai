import 'server-only';

import {
  createPublicClient,
  getAddress,
  http,
  parseAbiItem,
  type Address,
  type Hex,
} from 'viem';
import { celo } from 'viem/chains';

import {
  verifyOnchainPayment,
} from './payment-onchain-verifier';

import type {
  ExpectedPayment,
} from './payment-evidence-verifier';

const authorizationUsed = parseAbiItem(
  'event AuthorizationUsed(address indexed authorizer,bytes32 indexed nonce)'
);

const RPC = 'https://forno.celo.org';
const MAX_BLOCK_RANGE = BigInt(5000);

export async function findVerifiedMainnetPayment(
  expected: ExpectedPayment,
  fromBlock: bigint,
): Promise<Hex | null> {
  const client = createPublicClient({
    chain: celo,
    transport: http(RPC, {
      timeout: 15000,
      retryCount: 0,
    }),
  });

  if (await client.getChainId() !== celo.id) {
    throw new Error('Unexpected RPC network');
  }

  const latest = await client.getBlockNumber();

  if (fromBlock > latest) {
    return null;
  }

  if (latest - fromBlock > MAX_BLOCK_RANGE) {
    throw new Error('Recovery block range exceeds limit');
  }

  const logs = await client.getLogs({
    address: getAddress(expected.token) as Address,
    event: authorizationUsed,
    args: {
      authorizer: getAddress(expected.payer),
      nonce: expected.nonce,
    },
    fromBlock,
    toBlock: latest,
  });

  for (const log of logs) {
    if (!log.transactionHash) continue;

    const result = await verifyOnchainPayment(
      log.transactionHash,
      expected,
      'celo',
    );

    if (result.status === 'verified') {
      return result.txHash;
    }
  }

  return null;
}
