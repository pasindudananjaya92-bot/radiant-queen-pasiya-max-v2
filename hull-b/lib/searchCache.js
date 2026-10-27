/**
 * v4000 C2 — 24h answer cache (Supabase)
 * Key: sha1(focus + normalized query)
 */
import { createHash } from 'crypto';

function sb() {
  const url = process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
  if (!url || !key) return null;
  return { url: url.replace(/\/$/, ''), key };
}

async function sbFetch(path, opts = {}) {
  const c = sb();
  if (!c) return null;
  const res = await fetch(c.url + '/rest/v1/' + path, {
    ...opts,
    headers: {
      apikey: c.key,
      Authorization: 'Bearer ' + c.key,
      'Content-Type': 'application/json',
      Prefer: opts.prefer || 'return=representation',
      ...(opts.headers || {}),
    },
  });
  const text = await res.text();
  let j = null;
  try {
    j = text ? JSON.parse(text) : null;
  } catch (_) {
    j = null;
  }
  if (!res.ok) return null;
  return j;
}

export function cacheKey(focus, query) {
  const norm = String(focus || 'web') + '|' + String(query || '').trim().toLowerCase().replace(/\s+/g, ' ');
  return createHash('sha1').update(norm).digest('hex');
}

async function _analytics(hit, focus) {
  try {
    const { recordCacheEvent } = await import('./cacheAnalytics.js');
    await recordCacheEvent({ focus: focus || 'web', hit: !!hit });
  } catch (_) {}
}

export async function getCachedAnswer(focus, query) {
  const key = cacheKey(focus, query);
  const ttlHours = Number(process.env.ASK_CACHE_TTL_HOURS || 24);
  const since = new Date(Date.now() - ttlHours * 3600 * 1000).toISOString();
  const rows = await sbFetch(
    'rq_ask_cache?key=eq.' +
      encodeURIComponent(key) +
      '&created_at=gte.' +
      encodeURIComponent(since) +
      '&select=answer,engine,focus,created_at&limit=1'
  );
  if (!rows || !rows.length) {
    await _analytics(false, focus);
    return null;
  }
  await _analytics(true, focus);
  return rows[0];
}

export async function setCachedAnswer(focus, query, answer, engine) {
  const key = cacheKey(focus, query);
  const row = {
    key,
    focus: String(focus || 'web').slice(0, 32),
    query: String(query || '').slice(0, 500),
    answer: String(answer || '').slice(0, 8000),
    engine: String(engine || '').slice(0, 64),
  };
  // upsert by key
  await sbFetch('rq_ask_cache?on_conflict=key', {
    method: 'POST',
    body: JSON.stringify(row),
    prefer: 'resolution=merge-duplicates,return=minimal',
  });
}

export default { getCachedAnswer, setCachedAnswer, cacheKey };
