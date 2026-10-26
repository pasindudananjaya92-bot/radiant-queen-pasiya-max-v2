/**
 * v4000 C5 — Query-cache analytics (HOTFIX2)
 * Always try SERVICE_ROLE first so RLS cannot block inserts.
 */
function sb() {
  const url = process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SUPABASE_KEY;
  if (!url || !key) return null;
  return {
    url: url.replace(/\/$/, ''),
    key,
    usingService: !!(
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
    ),
  };
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

export async function recordCacheEvent({ focus, hit }) {
  const c = sb();
  if (!c) return { ok: false, error: 'no supabase' };
  try {
    await sbFetch('rq_cache_stats', {
      method: 'POST',
      body: JSON.stringify({
        focus: String(focus || 'web').slice(0, 32),
        hit: !!hit,
      }),
      prefer: 'return=minimal',
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

export async function getCacheStats() {
  const c = sb();
  const meta = {
    serviceRole: !!(
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
    ),
  };

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
      return {
        source: 'rq_cache_stats',
        hits,
        misses,
        byFocus,
        samples: list.length,
        meta,
      };
    }
  } catch (e) {
    meta.statsError = e.message || String(e);
  }

  // Probe insert (self-test) when empty — helps diagnose RLS
  let probe = null;
  try {
    probe = await recordCacheEvent({ focus: 'probe', hit: false });
  } catch (e) {
    probe = { ok: false, error: e.message || String(e) };
  }

  try {
    let rows;
    try {
      rows = await sbFetch(
        'rq_ask_cache?select=focus,created_at&order=created_at.desc&limit=200'
      );
    } catch (_) {
      rows = await sbFetch('rq_ask_cache?select=*&limit=50');
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
      meta,
      probe,
      note:
        list.length && (!probe || !probe.ok)
          ? 'Cache answers exist but rq_cache_stats insert failed: ' +
            (probe && probe.error
              ? probe.error
              : meta.statsError || 'unknown') +
            (meta.serviceRole
              ? ''
              : ' — Set SUPABASE_SERVICE_ROLE_KEY on Vercel (anon key is blocked by RLS).')
          : 'No events yet. After fix, /askweb twice then /cachestats again.',
    };
  } catch (e) {
    return {
      source: 'none',
      error: e.message || String(e),
      meta,
      probe,
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
    let lines =
      '📊 CACHE ANALYTICS · C5\n' +
      'Source: rq_cache_stats event log\n' +
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
    if (stats.meta && stats.meta.serviceRole === false) {
      lines += '\n⚠ Using non-service key — set SUPABASE_SERVICE_ROLE_KEY';
    }
    return lines.trim();
  }
  let lines =
    '📊 CACHE ANALYTICS · C5\n' +
    'Source: rq_ask_cache snapshot\n' +
    'Rows: ' +
    (stats.cacheRows || 0) +
    '\n';
  for (const [f, v] of Object.entries(stats.byFocus || {})) {
    lines += '· ' + f + ': rows ' + (v.rows || 0) + '\n';
  }
  if (stats.probe) {
    lines +=
      '\nInsert probe: ' +
      (stats.probe.ok ? 'OK' : 'FAIL — ' + (stats.probe.error || ''));
  }
  if (stats.meta) {
    lines +=
      '\nService role key: ' + (stats.meta.serviceRole ? 'YES' : 'NO');
  }
  if (stats.note) lines += '\n' + stats.note;
  return lines.trim();
}

export async function handleCacheAnalyticsCommand(text) {
  const t = String(text || '').trim();
  if (/^\/(cachestats|cache|askcache)(?:@\w+)?(?:\s+help)?$/i.test(t) && /help/i.test(t)) {
    return (
      '📊 CACHE · C5\n' +
      '/cachestats — hit rate + Tavily savings\n' +
      '/cachestats probe — force one miss event + report\n' +
      'Needs SUPABASE_SERVICE_ROLE_KEY on Vercel for inserts.'
    );
  }
  if (/^\/(cachestats|cache)(?:@\w+)?\s+probe$/i.test(t)) {
    const r = await recordCacheEvent({ focus: 'probe', hit: false });
    const s = await getCacheStats();
    return (
      'Probe insert: ' +
      (r.ok ? '✅ OK' : '❌ ' + (r.error || 'fail')) +
      '\n\n' +
      formatCacheStats(s)
    );
  }
  if (/^\/(cachestats|cache|askcache)(?:@\w+)?$/i.test(t)) {
    return formatCacheStats(await getCacheStats());
  }
  return null;
}

export default {
  recordCacheEvent,
  getCacheStats,
  formatCacheStats,
  handleCacheAnalyticsCommand,
};
