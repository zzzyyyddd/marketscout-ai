import {
  decodeEventLog,
  decodeFunctionData,
  isAddressEqual,
  parseAbi,
  parseAbiItem,
  type Address,
  type Hex,
} from 'viem';

import {
  getPaymentNetworkConfig,
  type PaymentNetwork,
} from './payment-network-config';

const authorizationAbi = parseAbi([
  'function transferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce,uint8 v,bytes32 r,bytes32 s)',
]);

const transferEvent = parseAbiItem(
  'event Transfer(address indexed from,address indexed to,uint256 value)'
);

const authorizationEvent = parseAbiItem(
  'event AuthorizationUsed(address indexed authorizer,bytes32 indexed nonce)'
);

export type PaymentEvidence = {
  chainId: number;
  transactionStatus: 'success' | 'reverted';
  token: Address;
  calldata: Hex;
  blockTimestamp: bigint;
  logs: Array<{
    address: Address;
    topics: readonly Hex[];
    data: Hex;
  }>;
};

export type ExpectedPayment = {
  payer: Address;
  recipient: Address;
  token: Address;
  amount: bigint;
  nonce: Hex;
  validAfter: bigint;
  validBefore: bigint;
};

export function verifyPaymentEvidence(
  evidence: PaymentEvidence,
  expected: ExpectedPayment,
  network: PaymentNetwork = 'celo-sepolia'
): boolean {
  try {
    const policy = getPaymentNetworkConfig(network);

    if (
      evidence.chainId !== policy.chainId ||
      evidence.transactionStatus !== 'success' ||
      !isAddressEqual(evidence.token, expected.token) ||
      !isAddressEqual(expected.token, policy.allowedToken) ||
      !isAddressEqual(expected.recipient, policy.allowedPayTo) ||
      expected.amount <= BigInt(0) ||
      expected.amount > policy.maxPerRequestAtomic
    ) {
      return false;
    }

    const decoded = decodeFunctionData({
      abi: authorizationAbi,
      data: evidence.calldata,
    });

    if (decoded.functionName !== 'transferWithAuthorization') {
      return false;
    }

    const [
      from,
      to,
      value,
      validAfter,
      validBefore,
      nonce,
    ] = decoded.args;

    if (
      !isAddressEqual(from, expected.payer) ||
      !isAddressEqual(to, expected.recipient) ||
      value !== expected.amount ||
      nonce.toLowerCase() !== expected.nonce.toLowerCase() ||
      validAfter !== expected.validAfter ||
      validBefore !== expected.validBefore ||
      !(validAfter < evidence.blockTimestamp) ||
      !(evidence.blockTimestamp < validBefore)
    ) {
      return false;
    }

    let transferMatches = 0;
    let authorizationMatches = 0;

    for (const log of evidence.logs) {
      if (!isAddressEqual(log.address, expected.token)) {
        continue;
      }

      try {
        const event = decodeEventLog({
          abi: [transferEvent],
          topics: log.topics.length > 0
            ? [...log.topics] as [Hex, ...Hex[]]
            : [],
          data: log.data,
          strict: true,
        });

        if (
          event.eventName === 'Transfer' &&
          isAddressEqual(event.args.from, expected.payer) &&
          isAddressEqual(event.args.to, expected.recipient) &&
          event.args.value === expected.amount
        ) {
          transferMatches++;
        }
      } catch {
        // Not a matching Transfer event.
      }

      try {
        const event = decodeEventLog({
          abi: [authorizationEvent],
          topics: log.topics.length > 0
            ? [...log.topics] as [Hex, ...Hex[]]
            : [],
          data: log.data,
          strict: true,
        });

        if (
          event.eventName === 'AuthorizationUsed' &&
          isAddressEqual(event.args.authorizer, expected.payer) &&
          event.args.nonce.toLowerCase() === expected.nonce.toLowerCase()
        ) {
          authorizationMatches++;
        }
      } catch {
        // Not a matching AuthorizationUsed event.
      }
    }

    return transferMatches === 1 && authorizationMatches === 1;
  } catch {
    return false;
  }
}
