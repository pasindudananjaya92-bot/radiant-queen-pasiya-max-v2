/**
 * Wave 36C · Upstash Redis Desk
 * Pure REST (no @upstash/redis package required).
 * Env: UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN
 * Safe no-op when env missing.
 */
export const VERSION = '36C';

function cfg() {
  const url = (process.env.UPSTASH_REDIS_REST_URL || '').replace(/\/$/, '');
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || '';
  return { url, token, ok: Boolean(url && token) };
}

export function isConfigured() {
  return cfg().ok;
}

/** Run one Upstash REST command path e.g. ["PING"] or ["SET","k","v","EX","60"] */
async function rest(cmd) {
  const { url, token, ok } = cfg();
  if (!ok) return { ok: false, error: 'not_configured' };
  const path = cmd.map((c) => encodeURIComponent(String(c))).join('/');
  const endpoint = `${url}/${path}`;
  const start = Date.now();
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8000),
    });
    const ms = Date.now() - start;
    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      json = { result: text };
    }
    if (!res.ok) {
      return {
        ok: false,
        error: json?.error || text || `http_${res.status}`,
        ms,
        status: res.status,
      };
    }
    return { ok: true, result: json?.result, ms, raw: json };
  } catch (e) {
    return { ok: false, error: e.message || String(e), ms: Date.now() - start };
  }
}

export async function ping() {
  const r = await rest(['PING']);
  if (!r.ok) return { ok: false, detail: r.error || 'fail' };
  const pong = r.result;
  return { ok: pong === 'PONG' || pong === 'pong', detail: `${pong} · ${r.ms}ms` };
}

export async function cacheSet(key, value, ttlSeconds = 3600) {
  const k = String(key).slice(0, 200);
  const v = typeof value === 'string' ? value : JSON.stringify(value);
  if (ttlSeconds > 0) {
    const r = await rest(['SET', k, v, 'EX', String(ttlSeconds)]);
    if (!r.ok) throw new Error(r.error || 'set_failed');
    return { key: k, ttl: ttlSeconds, result: r.result };
  }
  const r = await rest(['SET', k, v]);
  if (!r.ok) throw new Error(r.error || 'set_failed');
  return { key: k, ttl: 0, result: r.result };
}

export async function cacheGet(key) {
  const r = await rest(['GET', String(key).slice(0, 200)]);
  if (!r.ok) throw new Error(r.error || 'get_failed');
  return r.result;
}

export async function cacheDel(key) {
  const r = await rest(['DEL', String(key).slice(0, 200)]);
  if (!r.ok) throw new Error(r.error || 'del_failed');
  return r.result;
}

export async function cacheIncr(key, by = 1) {
  const r = await rest(['INCRBY', String(key).slice(0, 200), String(by)]);
  if (!r.ok) throw new Error(r.error || 'incr_failed');
  return r.result;
}

/** Fixed window rate limit via INCR + EXPIRE */
export async function rateLimit(key, limit = 20, windowSec = 60) {
  if (!isConfigured()) {
    return { allowed: true, remaining: limit, resetSec: windowSec, skipped: true };
  }
  const k = `rl:${String(key).slice(0, 180)}`;
  const nRes = await rest(['INCR', k]);
  if (!nRes.ok) {
    return { allowed: true, remaining: limit, resetSec: windowSec, skipped: true, error: nRes.error };
  }
  const n = Number(nRes.result) || 0;
  if (n === 1) await rest(['EXPIRE', k, String(windowSec)]);
  const ttlRes = await rest(['TTL', k]);
  const ttl = Number(ttlRes.result);
  return {
    allowed: n <= limit,
    remaining: Math.max(0, limit - n),
    resetSec: ttl > 0 ? ttl : windowSec,
    count: n,
    skipped: false,
  };
}

export async function stats() {
  if (!isConfigured()) return { configured: false, version: VERSION };
  const p = await ping();
  return { configured: true, version: VERSION, ping: p };
}

export function helpText() {
  return (
    `⚡ *Upstash Cache · ${VERSION}*\n` +
    `Redis REST · free tier · no extra npm package\n\n` +
    `• \`cache help\` — this menu\n` +
    `• \`cache ping\` — latency check\n` +
    `• \`cache stats\` — configured + ping\n` +
    `• \`cache set <key> <value>\` — store (TTL 1h)\n` +
    `• \`cache get <key>\` — read\n` +
    `• \`cache del <key>\` — delete\n` +
    `• \`cache rate <key>\` — test rate-limit (20/min)\n\n` +
    `Env: \`UPSTASH_REDIS_REST_URL\` + \`UPSTASH_REDIS_REST_TOKEN\`\n` +
    `_If env missing, other bot commands still work._`
  );
}
