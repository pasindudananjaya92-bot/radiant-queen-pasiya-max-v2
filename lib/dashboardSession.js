// Remember-Me session tokens for Command Center
import { createHmac, timingSafeEqual } from 'crypto';

function secret() {
  return String(process.env.DASH_SECRET || process.env.CRON_SECRET || '').trim();
}

function days() {
  const n = Number(process.env.DASH_SESSION_DAYS || 30);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 90) : 30;
}

function b64url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function fromB64url(s) {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + pad;
  return Buffer.from(b64, 'base64').toString('utf8');
}

export function createSessionToken(sub = 'founder') {
  const sec = secret();
  if (!sec) throw new Error('DASH_SECRET not set');
  const now = Math.floor(Date.now() / 1000);
  const exp = now + days() * 86400;
  const payload = { sub: String(sub), iat: now, exp };
  const body = b64url(JSON.stringify(payload));
  const sig = createHmac('sha256', sec).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifySessionToken(token) {
  const sec = secret();
  if (!sec || !token || typeof token !== 'string' || !token.includes('.')) {
    return { ok: false, error: 'bad token' };
  }
  const [body, sig] = token.split('.');
  const expect = createHmac('sha256', sec).update(body).digest('base64url');
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expect);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return { ok: false, error: 'bad signature' };
    }
  } catch {
    return { ok: false, error: 'sig error' };
  }
  try {
    const payload = JSON.parse(fromB64url(body));
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) {
      return { ok: false, error: 'expired' };
    }
    return { ok: true, payload };
  } catch {
    return { ok: false, error: 'bad payload' };
  }
}

export function sessionCookie(token) {
  const maxAge = days() * 86400;
  return `rq_dash_session=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

export function clearSessionCookie() {
  return 'rq_dash_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0';
}

export function readCookieToken(req) {
  const raw = String(req.headers?.cookie || '');
  const m = raw.match(/(?:^|;\s*)rq_dash_session=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : '';
}
