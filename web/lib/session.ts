import { cookies } from 'next/headers';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
const COOKIE = 'dda_session';
function sign(id: string) {
  const secret = process.env.DDA_SESSION_SECRET || process.env.BLOB_READ_WRITE_TOKEN;
  if (!secret) throw new Error('Private storage is not connected yet.');
  return createHmac('sha256', secret).update(id).digest('hex');
}
export async function getSession(create = false) {
  const jar = await cookies();
  const value = jar.get(COOKIE)?.value;
  if (value) {
    const [id, signature] = value.split('.');
    if (/^[a-f0-9]{48}$/.test(id) && /^[a-f0-9]{64}$/.test(signature || '')) {
      const expected = sign(id);
      if (timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) return id;
    }
  }
  if (!create) throw new Error('Your upload session expired. Refresh this page to start again.');
  const id = randomBytes(24).toString('hex');
  jar.set(COOKIE, `${id}.${sign(id)}`, {httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/', maxAge: 60 * 60 * 24 * 30});
  return id;
}
export function requireSameOrigin(request: Request) {
  requestOrigin(request);
}
export function requestOrigin(request: Request) {
  const target = new URL(request.url);
  const host = new URL(`${target.protocol}//${request.headers.get('host') || target.host}`).host;
  const origin = request.headers.get('origin');
  if (origin) {
    const source = new URL(origin);
    if (source.protocol !== target.protocol || source.host !== host) throw new Error('Request origin does not match this app.');
    return source.origin;
  }
  return `${target.protocol}//${host}`;
}
