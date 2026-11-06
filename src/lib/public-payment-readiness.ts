import 'server-only';

export type ControlledPaymentScope = {
  payer: string;
  username: string;
  reservationId: string;
};

// Default closed. The operator may enable only this single approved scope.
// The fixed UUID is reserved by the existing atomic INSERT, so even a fresh
// authorization cannot cause a second paid forwarding for this test.
export function getControlledPaymentScope(): ControlledPaymentScope | null {
  const payer = process.env.MARKETSCOUT_CONTROLLED_TEST_PAYER ?? '';
  const username = process.env.MARKETSCOUT_CONTROLLED_TEST_USERNAME ?? '';
  const reservationId = process.env.MARKETSCOUT_CONTROLLED_TEST_RESERVATION_ID ?? '';
  if (!/^0x[0-9a-fA-F]{40}$/.test(payer) || /^0x0{40}$/i.test(payer) ||
      !/^[a-z0-9._]{1,30}$/.test(username) || username.startsWith('.') ||
      username.endsWith('.') || username.includes('..') ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(reservationId)) return null;
  return { payer, username, reservationId };
}

export function publicPaymentsEnabled(): boolean {
  return process.env.MARKETSCOUT_PUBLIC_PAYMENTS === 'true' &&
    process.env.MARKETSCOUT_CONTROLLED_TEST_ENABLED === 'true' &&
    getControlledPaymentScope() !== null;
}

export function assertControlledPaymentScope(
  payer: string, username: string, reservationId?: string,
): void {
  const scope = getControlledPaymentScope();
  if (!publicPaymentsEnabled() || !scope) throw new Error('Public payments disabled');
  if (payer.toLowerCase() !== scope.payer.toLowerCase() ||
      username !== scope.username || reservationId?.toLowerCase() !== scope.reservationId.toLowerCase()) {
    throw new Error('Request outside controlled payment scope');
  }
}
