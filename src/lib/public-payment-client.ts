import 'client-only';

import type { CompetitorReport } from './report';
import { isCompetitorReport } from './report';

export type PublicPaymentExecutionResult =
  | {
      status: 'settled';
      reservationId: string;
      txHash: string;
      report: CompetitorReport;
    }
  | {
      status: 'unresolved';
      reservationId: string;
      message: string;
    }
  | {
      status: 'settled_report_unavailable';
      reservationId: string;
      txHash: string;
      message: string;
    };

export function validatePublicPaymentExecutionResult(
  value: unknown,
): PublicPaymentExecutionResult {
  if (!value || typeof value !== 'object') {
    throw new Error('Invalid payment response');
  }

  const data = value as Record<string, unknown>;

  if (
    typeof data.reservationId !== 'string' ||
    !data.reservationId
  ) {
    throw new Error('Missing payment reservation');
  }

  if (data.status === 'settled') {
    if (
      typeof data.txHash !== 'string' ||
      !/^0x[0-9a-fA-F]{64}$/.test(data.txHash) ||
      !isCompetitorReport(data.report)
    ) {
      throw new Error('Invalid settled payment report');
    }

    return {
      status: 'settled',
      reservationId: data.reservationId,
      txHash: data.txHash,
      report: data.report,
    };
  }

  if (data.status === 'unresolved') {
    return {
      status: 'unresolved',
      reservationId: data.reservationId,
      message:
        typeof data.message === 'string'
          ? data.message
          : 'Payment status uncertain. Do not retry.',
    };
  }

  if (data.status === 'settled_report_unavailable') {
    if (
      typeof data.txHash !== 'string' ||
      !/^0x[0-9a-fA-F]{64}$/.test(data.txHash)
    ) {
      throw new Error('Missing settlement transaction hash');
    }

    return {
      status: 'settled_report_unavailable',
      reservationId: data.reservationId,
      txHash: data.txHash,
      message:
        typeof data.message === 'string'
          ? data.message
          : 'Payment settled. Report unavailable.',
    };
  }

  throw new Error('Unknown payment execution status');
}
