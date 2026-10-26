/**
 * v4000 C5 — Query-cache analytics
 * Tracks hits/misses on rq_ask_cache and estimates Tavily credits saved.
 */
function sb() {
  const url = process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
  if (!url || !key) return null;
  return { url: url.replace(/\/$/, ''), key };
}

async function sbFetch(path, opts = {}) {
  const c = sb();
  if (!c) throw new Error('Supabase not configured');
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
    j = { raw: text };
  }
  if (!res.ok) {
    throw new Error(
      (j && (j.message || j.error || j.hint || j.raw)) || 'SB ' + res.status
    );
  }
  return j;
}

/**
 * Increment hit or miss counter for a cache key (best-effort).
 * Table: rq_cache_stats (optional — created by C5 SQL)
 */
export async function recordCacheEvent({ focus, hit }) {
  try {
    await sbFetch('rq_cache_stats', {
      method: 'POST',
      body: JSON.stringify({
        focus: String(focus || 'web').slice(0, 32),
        hit: !!hit,
      }),
      prefer: 'return=minimal',
    });
  } catch (_) {
    /* table may not exist yet — ignore */
  }
}

export async function getCacheStats() {
  // Prefer dedicated stats table
  try {
    const rows = await sbFetch(
      'rq_cache_stats?select=hit,focus,created_at&order=created_at.desc&limit=500'
    );
    const list = Array.isArray(rows) ? rows : [];
    if (list.length) {
      let hits = 0;
      let misses = 0;
      const byFocus = {};
      for (const r of list) {
        const f = r.focus || 'web';
        if (!byFocus[f]) byFocus[f] = { hits: 0, misses: 0 };
        if (r.hit) {
          hits++;
          byFocus[f].hits++;
        } else {
          misses++;
          byFocus[f].misses++;
        }
      }
      return { source: 'rq_cache_stats', hits, misses, byFocus, samples: list.length };
    }
  } catch (_) {}

  // Fallback: count rows in rq_ask_cache (schema-tolerant)
  try {
    // Prefer minimal columns that exist on older schemas
    let rows;
    try {
      rows = await sbFetch(
        'rq_ask_cache?select=focus,created_at&order=created_at.desc&limit=200'
      );
    } catch (e1) {
      // absolute minimal
      rows = await sbFetch(
        'rq_ask_cache?select=*&order=created_at.desc&limit=50'
      );
    }
    const list = Array.isArray(rows) ? rows : [];
    const byFocus = {};
    for (const r of list) {
      const f = r.focus || r.mode || 'web';
      if (!byFocus[f]) byFocus[f] = { rows: 0 };
      byFocus[f].rows++;
    }
    return {
      source: 'rq_ask_cache',
      cacheRows: list.length,
      liveEntries: list.length,
      byFocus,
      note:
        'Hit/miss event log empty or missing. Run sql/V4000_C5_CACHE_STATS.sql then use /askweb a few times. Rows above = cached answers currently stored.',
    };
  } catch (e) {
    return {
      source: 'none',
      error:
        (e.message || String(e)) +
        ' — If rq_cache_stats missing, run C5 SQL. If rq_ask_cache missing, cache was never created.',
    };
  }
}


export function formatCacheStats(stats) {
  if (!stats || stats.error) {
    return '📊 CACHE ANALYTICS\n❌ ' + (stats?.error || 'no data');
  }
  if (stats.source === 'rq_cache_stats') {
    const total = stats.hits + stats.misses;
    const rate = total ? Math.round((stats.hits / total) * 100) : 0;
    // Rough: 1 miss ≈ 1 Tavily credit; hits = credits saved
    let lines =
      '📊 CACHE ANALYTICS · C5\n' +
      'Source: event log\n' +
      'Hits: ' +
      stats.hits +
      ' · Misses: ' +
      stats.misses +
      ' · Rate: ' +
      rate +
      '%\n' +
      '≈ Tavily credits saved: ' +
      stats.hits +
      '\n';
    for (const [f, v] of Object.entries(stats.byFocus || {})) {
      lines += '· ' + f + ': hit ' + v.hits + ' / miss ' + v.misses + '\n';
    }
    lines += 'Samples: ' + stats.samples;
    return lines.trim();
  }
  // fallback
  let lines =
    '📊 CACHE ANALYTICS · C5\n' +
    'Source: rq_ask_cache snapshot\n' +
    'Rows: ' +
    (stats.cacheRows || 0) +
    ' · Live: ' +
    (stats.liveEntries || 0) +
    '\n';
  for (const [f, v] of Object.entries(stats.byFocus || {})) {
    lines +=
      '· ' + f + ': rows ' + (v.rows || 0) + ' live ' + (v.live || 0) + '\n';
  }
  if (stats.note) lines += '\n' + stats.note;
  return lines.trim();
}

export async function handleCacheAnalyticsCommand(text) {
  const t = String(text || '').trim();
  if (
    !/^\/(cachestats|cache|askcache)(?:@\w+)?(?:\s+help)?$/i.test(t) &&
    !/^\/(cachestats|cache)(?:@\w+)?\s+/i.test(t)
  ) {
    if (/^\/(cachestats|cache)(?:@\w+)?$/i.test(t)) {
      const s = await getCacheStats();
      return formatCacheStats(s);
    }
    return null;
  }
  if (/help/i.test(t)) {
    return (
      '📊 CACHE · C5\n' +
      '/cachestats — hit rate + estimated Tavily savings\n' +
      'Requires: sql/V4000_C5_CACHE_STATS.sql (optional but recommended)\n' +
      'vaneAnswer records hit/miss when table exists.'
    );
  }
  const s = await getCacheStats();
  return formatCacheStats(s);
}

export default {
  recordCacheEvent,
  getCacheStats,
  formatCacheStats,
  handleCacheAnalyticsCommand,
};
