/**
 * lib/aiCache.js — Upstash Redis response cache (P1b)
 * Free tier friendly. No-op if env missing.
 */
const URL = process.env.UPSTASH_REDIS_REST_URL || '';
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || '';
const TTL = Number(process.env.AI_CACHE_TTL_SEC || 86400); // 24h

function enabled() {
  return Boolean(URL && TOKEN);
}

function cacheKey(prompt) {
  const s = String(prompt || '').trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 800);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `rq:ai:${(h >>> 0).toString(16)}`;
}

async function rest(path, init = {}) {
  const res = await fetch(`${URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      ...(init.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data?.error || `cache HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export async function getCached(prompt) {
  if (!enabled()) return null;
  try {
    const key = cacheKey(prompt);
    const data = await rest(`/get/${encodeURIComponent(key)}`);
    const val = data?.result;
    if (val == null || val === '') return null;
    return String(val);
  } catch {
    return null;
  }
}

export async function setCached(prompt, answer) {
  if (!enabled()) return false;
  const text = String(answer || '').trim();
  if (!text || text.length < 8) return false;
  // do not cache errors / quota messages
  const low = text.toLowerCase();
  if (
    low.includes('ai error') ||
    low.includes('temporarily unavailable') ||
    low.includes('quota') ||
    low.includes('set groq') ||
    low.startsWith('ai vision error')
  ) {
    return false;
  }
  try {
    const key = cacheKey(prompt);
    // SET key value EX ttl
    await rest(
      `/set/${encodeURIComponent(key)}/${encodeURIComponent(text.slice(0, 3500))}?EX=${TTL}`
    );
    return true;
  } catch {
    return false;
  }
}

export function cacheStatus() {
  return { enabled: enabled(), ttlSec: TTL };
}

export default { getCached, setCached, cacheStatus };
