import 'server-only';

import {
  createPublicClient,
  http,
  isAddressEqual,
  type Hex,
} from 'viem';
import { celo, celoSepolia } from 'viem/chains';
import {
  getPaymentNetworkConfig,
  type PaymentNetwork,
} from './payment-network-config';

import {
  verifyPaymentEvidence,
  type ExpectedPayment,
  type PaymentEvidence,
} from './payment-evidence-verifier';

function createClient(
  rpcUrl: string,
  network: PaymentNetwork
) {
  return createPublicClient({
    chain: network === 'celo' ? celo : celoSepolia,
    transport: http(rpcUrl, {
      timeout: 15000,
      retryCount: 0,
    }),
  });
}

export type OnchainVerificationResult =
  | {
      status: 'verified';
      txHash: Hex;
      blockNumber: bigint;
    }
  | {
      status: 'unresolved';
      reason: string;
    };

export async function verifyOnchainPayment(
  txHash: Hex,
  expected: ExpectedPayment,
  network: PaymentNetwork = 'celo-sepolia'
): Promise<OnchainVerificationResult> {
  const policy = getPaymentNetworkConfig(network);

  for (const rpcUrl of policy.rpcUrls) {
    try {
      const client = createClient(rpcUrl, network);

      const chainId = await client.getChainId();

      if (chainId !== policy.chainId) {
        continue;
      }

      const [tx, receipt] = await Promise.all([
        client.getTransaction({ hash: txHash }),
        client.getTransactionReceipt({ hash: txHash }),
      ]);

      if (
        tx.blockNumber === null ||
        receipt.status !== 'success' ||
        receipt.transactionHash.toLowerCase() !==
          txHash.toLowerCase() ||
        receipt.blockNumber !== tx.blockNumber ||
        !tx.to ||
        !isAddressEqual(tx.to, expected.token)
      ) {
        continue;
      }

      const block = await client.getBlock({
        blockNumber: tx.blockNumber,
      });

      if (
        receipt.blockHash.toLowerCase() !==
          block.hash.toLowerCase() ||
        tx.blockHash?.toLowerCase() !==
          block.hash.toLowerCase()
      ) {
        continue;
      }

      const evidence: PaymentEvidence = {
        chainId,
        transactionStatus: 'success',
        token: tx.to,
        calldata: tx.input,
        blockTimestamp: block.timestamp,
        logs: receipt.logs.map((log) => ({
          address: log.address,
          topics: log.topics,
          data: log.data,
        })),
      };

      if (!verifyPaymentEvidence(evidence, expected, network)) {
        continue;
      }

      return {
        status: 'verified',
        txHash,
        blockNumber: tx.blockNumber,
      };
    } catch {
      // Try the next RPC; never confirm without full evidence.
    }
  }

  return {
    status: 'unresolved',
    reason: 'No RPC provided complete matching evidence',
  };
}
