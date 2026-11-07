export type PendingPaymentStep =
  | 'signing'
  | 'authorization_ready_v2'
  | 'submitting'
  | 'unresolved'
  | 'settled_report_unavailable'
  | 'settled'
  | null;

type Marker = { reservationId?: string; username?: string; status?: string };
export const pendingPaymentKey = (reservationId: string) =>
  `marketscout_pending_payment_v1:${reservationId.toLowerCase()}`;
export const paidReportKey = (reservationId: string) =>
  `marketscout_last_paid_report_v1:${reservationId.toLowerCase()}`;

export function findPendingPayment(storage: Pick<Storage, 'getItem' | 'key' | 'length'>, username: string, reservationId: string): Marker | null {
  const parse = (raw: string): Marker => {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid payment marker');
    return value as Marker;
  };
  const legacy = storage.getItem('marketscout_pending_payment_v1');
  const candidates: Marker[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (!key?.startsWith('marketscout_pending_payment_v1:')) continue;
    const raw = storage.getItem(key);
    if (!raw) throw new Error('Invalid scoped payment marker');
    const marker = parse(raw);
    if (typeof marker.reservationId !== 'string' || typeof marker.username !== 'string' ||
        pendingPaymentKey(marker.reservationId) !== key) throw new Error('Invalid scoped payment marker');
    if (marker.username.toLowerCase() === username || marker.reservationId.toLowerCase() === reservationId.toLowerCase()) candidates.push(marker);
  }
  if (legacy) {
    const marker = parse(legacy);
    if (typeof marker.username !== 'string' || !marker.username ||
        marker.username.toLowerCase() === username || marker.reservationId?.toLowerCase() === reservationId.toLowerCase()) candidates.push(marker);
  }
  // Any ambiguous or submitted matching marker must take precedence over a
  // separate pre-signing marker for the same purchase.
  return candidates.find(marker => !canSafelyResumePayment(marker.status) || marker.reservationId?.toLowerCase() !== reservationId.toLowerCase()) ?? candidates[0] ?? null;
}

export function canSafelyResumePayment(step: unknown): boolean {
  // Neither state can have reached /api/payment/execute. The suffix distinguishes
  // the new persisted transition from the older ambiguous authorization_created state.
  return step === 'signing' || step === 'authorization_ready_v2';
}

export function canOfferPaidReportRecovery(step: unknown): boolean {
  return step === 'submitting' || step === 'unresolved' ||
    step === 'settled_report_unavailable' || step === 'settled';
}

export function paymentButtonLabel(input: {
  enabled: boolean;
  paying: boolean;
  locked: boolean;
  completed: boolean;
  stateChecked: boolean;
  step: unknown;
}): string {
  if (!input.enabled) return 'Payments temporarily unavailable';
  if (!input.stateChecked) return 'Checking saved payment state…';
  if (input.completed) return 'Snapshot delivered';
  if (input.step === 'settled') return 'Snapshot delivered';
  if (input.paying && input.step === 'signing') return 'Waiting for wallet authorization…';
  if (input.step === 'signing') return 'Wallet authorization not submitted — resume';
  if (input.step === 'authorization_ready_v2') return 'Authorization ready — payment not submitted';
  if (input.step === 'submitting') return 'Payment request processing — do not retry';
  if (input.step === 'settled_report_unavailable') return 'Payment settled — report unavailable';
  if (input.step === 'unresolved') return 'Payment status uncertain — do not retry';
  if (input.locked) return 'Payment status uncertain — do not retry';
  if (input.paying) return 'Processing payment…';
  return 'Pay 0.005 USDC & Analyze';
}
