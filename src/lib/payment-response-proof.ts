import { MAINNET_PAYMENT_POLICY as POLICY } from './payment-mainnet-policy';

export function parsePaymentResponse(headers: Headers): `0x${string}` {
  function parse(encoded: string, legacy: boolean) {
    if (encoded.length > 8192 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) throw new Error('Invalid proof encoding');
    const bytes = Buffer.from(encoded, 'base64');
    if (bytes.toString('base64') !== encoded) throw new Error('Noncanonical proof');
    const proof: unknown = JSON.parse(bytes.toString('utf8'));
    if (!proof || typeof proof !== 'object' || Array.isArray(proof)) throw new Error('Invalid proof');
    const p = proof as Record<string, unknown>;
    if (p.success !== true || (p.network !== POLICY.caip2Network && !(legacy && p.network === POLICY.network)) ||
        typeof p.transaction !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(p.transaction) ||
        (p.payer !== undefined && (typeof p.payer !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(p.payer)))) throw new Error('Invalid settlement proof');
    return { transaction: p.transaction.toLowerCase() as `0x${string}`, payer: typeof p.payer === 'string' ? p.payer.toLowerCase() : undefined };
  }
  const modern = headers.get('PAYMENT-RESPONSE');
  const legacy = headers.get('X-PAYMENT-RESPONSE');
  if (modern === null && legacy === null) throw new Error('Missing proof');
  const a = modern === null ? null : parse(modern, false);
  const b = legacy === null ? null : parse(legacy, true);
  if (a && b && (a.transaction !== b.transaction || a.payer !== b.payer)) throw new Error('Conflicting proofs');
  return (a ?? b)!.transaction;
}

export const MAX_GATEWAY_BODY_BYTES = 512 * 1024;
export async function readBoundedGatewayBody(response: Response): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Missing body');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_GATEWAY_BODY_BYTES) throw new Error('Gateway body too large');
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } finally { await reader.cancel(); }
}
