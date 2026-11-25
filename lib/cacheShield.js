/**
 * Setup-1 · Upstash Shield helpers
 * Rate-limit + short cache for expensive paths (think / public)
 */
import * as U from './upstashManager.js';

export const VERSION = '37A-S1';

/** Rate limit a founder/user action. Soft-allow if Redis down. */
export async function shieldRate(userKey, limit = 30, windowSec = 60) {
  const key = `shield:${String(userKey || 'anon').slice(0, 80)}`;
  return U.rateLimit(key, limit, windowSec);
}

/** Cache get/set for think-like payloads */
export async function shieldCacheGet(key) {
  if (!U.isConfigured()) return null;
  try {
    return await U.cacheGet(`think:${String(key).slice(0, 120)}`);
  } catch {
    return null;
  }
}

export async function shieldCacheSet(key, value, ttlSec = 900) {
  if (!U.isConfigured()) return { ok: false, skipped: true };
  try {
    await U.cacheSet(`think:${String(key).slice(0, 120)}`, value, ttlSec);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

export async function shieldStatus() {
  const s = await U.stats();
  return {
    version: VERSION,
    redis: s.configured,
    ping: s.ping?.detail || null,
  };
}
