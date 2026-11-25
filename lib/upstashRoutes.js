/**
 * Wave 36C · Upstash routes
 * Prefixes: cache | upstash | redis
 */
import * as U from './upstashManager.js';

function isFounder(ctx) {
  const admin = String(process.env.ADMIN_ID || process.env.FOUNDER_ID || '')
    .split(/[\s,]+/)
    .filter(Boolean);
  const uid = String(ctx?.from?.id || ctx?.message?.from?.id || '');
  if (!admin.length) return true;
  return admin.includes(uid);
}

export async function tryHandle(text = '', ctx = null) {
  const raw = String(text || '').trim().replace(/^\//, '');
  if (!raw) return null;
  if (!/^(cache|upstash|redis)\b/i.test(raw)) return null;
  if (ctx && !isFounder(ctx)) return '🔒 Founder only.';

  const lower = raw.toLowerCase();

  if (/^(cache|upstash|redis)(\s+help|\s+\?|$)/i.test(lower)) {
    return U.helpText();
  }

  if (!U.isConfigured()) {
    return (
      '❌ Upstash not configured.\n\n' +
      'Mobile setup:\n' +
      '1. Open https://console.upstash.com → Create Redis (free)\n' +
      '2. REST API → copy UPSTASH_REDIS_REST_URL + TOKEN\n' +
      '3. Vercel → Env → add both → Redeploy\n\n' +
      'Other bot commands keep working.'
    );
  }

  try {
    if (/^(cache|upstash|redis)\s+ping$/i.test(lower)) {
      const p = await U.ping();
      return p.ok ? `✅ Upstash PONG — ${p.detail}` : `❌ Upstash: ${p.detail}`;
    }

    if (/^(cache|upstash|redis)\s+stats$/i.test(lower)) {
      const s = await U.stats();
      const line = s.ping?.detail || '—';
      return `⚡ *Upstash · ${U.VERSION}*\nConfigured: ${s.configured}\nPing: ${line}`;
    }

    const setM = raw.match(/^(?:cache|upstash|redis)\s+set\s+(\S+)\s+(.+)$/is);
    if (setM) {
      const key = setM[1];
      const value = setM[2].trim();
      await U.cacheSet(key, value, 3600);
      return `✅ Cached \`${key}\` (TTL 1h)\n${value.slice(0, 200)}`;
    }

    const getM = raw.match(/^(?:cache|upstash|redis)\s+get\s+(\S+)$/i);
    if (getM) {
      const val = await U.cacheGet(getM[1]);
      if (val == null || val === undefined) return `⚡ Key not found: \`${getM[1]}\``;
      return `⚡ \`${getM[1]}\`\n\n${String(val).slice(0, 3500)}`;
    }

    const delM = raw.match(/^(?:cache|upstash|redis)\s+(del|delete|rm)\s+(\S+)$/i);
    if (delM) {
      await U.cacheDel(delM[2]);
      return `🗑 Deleted \`${delM[2]}\``;
    }

    const rateM = raw.match(/^(?:cache|upstash|redis)\s+rate(?:limit)?\s+(\S+)$/i);
    if (rateM) {
      const rl = await U.rateLimit(rateM[1], 20, 60);
      if (rl.skipped) return `⚡ Rate-limit skipped (Redis soft-fail) · allowed`;
      return (
        `⚡ Rate \`${rateM[1]}\`\n` +
        `Allowed: ${rl.allowed ? 'YES' : 'NO'}\n` +
        `Count: ${rl.count} · Remaining: ${rl.remaining}\n` +
        `Reset: ~${rl.resetSec}s`
      );
    }

    return U.helpText();
  } catch (err) {
    return `❌ Cache error:\n${err.message || err}`;
  }
}

export default { tryHandle };
