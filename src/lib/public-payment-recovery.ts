import 'server-only';

export type PaymentRecoveryState =
  | 'reserved'
  | 'unresolved'
  | 'settled'
  | 'settled_report_unavailable';

export interface PaymentRecoveryRecord {
  reservationId: string;
  state: PaymentRecoveryState;
  txHash?: `0x${string}`;
  message: string;
}

export function createPaymentRecoveryRecord(
  reservationId: string,
  state: PaymentRecoveryState,
  txHash?: `0x${string}`,
): PaymentRecoveryRecord {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      reservationId,
    )
  ) {
    throw new Error('Invalid reservation ID');
  }

  return {
    reservationId,
    state,
    ...(txHash ? { txHash } : {}),
    message:
      state === 'settled'
        ? 'Payment verified.'
        : state === 'settled_report_unavailable'
          ? 'Payment settled; report recovery required. Do not pay again.'
          : 'Payment status requires reconciliation. Do not pay again.',
  };
}
