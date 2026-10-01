/**
 * lib/rateLimiter.js — Upstash Redis rate limit (P1b)
 * Shared across Vercel instances. Falls back to null → caller uses memory/Supabase.
 */
const URL = process.env.UPSTASH_REDIS_REST_URL || '';
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || '';
const WINDOW_SEC = Number(process.env.AI_RATE_WINDOW_SEC || 60);
const MAX_HITS = Number(process.env.AI_RATE_MAX_HITS || 10);

function enabled() {
  return Boolean(URL && TOKEN);
}

async function rest(path) {
  const res = await fetch(`${URL}${path}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data?.error || `rate HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

/**
 * @returns {{ ok: true } | { ok: false, waitSec: number } | null}
 * null = Upstash not configured / failed → use existing fallback
 */
export async function checkRedisRateLimit(userId) {
  if (!enabled()) return null;
  const id = String(userId || 'anon');
  const key = `rq:rl:${id}`;
  try {
    const incr = await rest(`/incr/${encodeURIComponent(key)}`);
    const hits = Number(incr?.result || 0);
    if (hits === 1) {
      await rest(`/expire/${encodeURIComponent(key)}/${WINDOW_SEC}`);
    }
    if (hits > MAX_HITS) {
      let ttl = WINDOW_SEC;
      try {
        const t = await rest(`/ttl/${encodeURIComponent(key)}`);
        if (typeof t?.result === 'number' && t.result > 0) ttl = t.result;
      } catch (_) {}
      return { ok: false, waitSec: Math.max(1, ttl) };
    }
    return { ok: true, hits, max: MAX_HITS };
  } catch {
    return null;
  }
}

export function rateLimitStatus() {
  return { enabled: enabled(), windowSec: WINDOW_SEC, maxHits: MAX_HITS };
}

export default { checkRedisRateLimit, rateLimitStatus };
