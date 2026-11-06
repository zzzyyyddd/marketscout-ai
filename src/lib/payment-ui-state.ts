export type PendingPaymentStep =
  | 'signing'
  | 'authorization_ready_v2'
  | 'submitting'
  | 'unresolved'
  | 'settled_report_unavailable'
  | 'settled'
  | null;

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
