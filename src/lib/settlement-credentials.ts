import 'server-only';

/**
 * Dedicated settlement credential boundary.
 *
 * This credential must represent a genuinely separate
 * database identity with narrowly scoped permissions.
 *
 * Never reuse SUPABASE_SECRET_KEY here.
 * Never expose this credential to client-side code.
 *
 * Settlement remains disabled until the dedicated
 * identity and RPC permissions are implemented.
 */

export function getSettlementCredential(): string {
  const credential = process.env.MARKETSCOUT_SETTLEMENT_KEY;

  if (!credential) {
    throw new Error('Dedicated settlement credential unavailable');
  }

  if (
    credential === process.env.SUPABASE_SECRET_KEY
  ) {
    throw new Error(
      'Settlement credential must differ from general Supabase secret'
    );
  }

  throw new Error(
    'Dedicated settlement identity not yet implemented'
  );
}
