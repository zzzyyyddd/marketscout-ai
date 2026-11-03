import { timingSafeEqual } from 'node:crypto';

export function isAuthorized(request: Request): boolean {
  const expected = process.env.MARKETSCOUT_ADMIN_TOKEN;
  const provided = request.headers.get('authorization');

  if (!expected || !provided?.startsWith('Bearer ')) {
    return false;
  }

  const token = provided.slice(7);
  const a = Buffer.from(token);
  const b = Buffer.from(expected);

  return a.length === b.length && timingSafeEqual(a, b);
}
