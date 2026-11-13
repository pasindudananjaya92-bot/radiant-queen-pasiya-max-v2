/**
 * Wave 11F — Scout Intel
 * Internal OS intel + optional web (Tavily/webSearch) for external topics.
 */

let LAST_BRIEF = null;

export function latestBrief() {
  return LAST_BRIEF;
}

async function internalOsIntel() {
  const parts = [];
  try {
    const mc = await import('./missionControl.js');
    const st = await mc.nationStatus();
    parts.push(
      `Nation: roster ${st.roster_count || 0}, open missions ${st.open_missions || 0}`
    );
    if (st.corps) {
      parts.push(
        'Corps: ' +
          Object.keys(st.corps)
            .map((k) => `${k} ${st.corps[k].active}/${st.corps[k].total}`)
            .join(', ')
      );
    }
  } catch (e) {
    parts.push('Nation: ' + (e.message || e));
  }
  try {
    const hm = await import('./healthManager.js');
    const fn = hm.runFullCheck || hm.runHealthCheck || hm.healthCheck || hm.checkAll;
    if (typeof fn === 'function') {
      const h = await fn();
      const checks = h.checks || h.results || [];
      const down = (checks || []).filter((c) => c && c.ok === false);
      parts.push(
        down.length
          ? `Health DOWN: ${down.map((c) => c.name || c.id).join(', ')}`
          : `Health: all green (${(checks || []).length} checks)`
      );
    }
  } catch (_) {}
  try {
    const se = await import('./sentinelEngine.js');
    if (typeof se.getLastScan === 'function' && se.getLastScan()) {
      const s = se.getLastScan();
      parts.push(`Sentinel last score: ${s.score}/100`);
    }
  } catch (_) {}
  return parts.join('\n');
}

async function webIntel(topic) {
  try {
    const ws = await import('./webSearch.js');
    const fn = ws.search || ws.webSearch || ws.tavilySearch || ws.default?.search;
    if (typeof fn !== 'function') return null;
    const r = await fn(topic, { maxResults: 5 });
    const items = r?.results || r?.items || (Array.isArray(r) ? r : []);
    if (!items.length) return String(r?.answer || r?.text || '').slice(0, 1500) || null;
    return items
      .slice(0, 5)
      .map((it, i) => {
        const title = it.title || it.name || 'result';
        const snippet = it.content || it.snippet || it.description || '';
        const url = it.url || it.link || '';
        return `${i + 1}. ${title}\n${String(snippet).slice(0, 180)}${url ? '\n' + url : ''}`;
      })
      .join('\n\n');
  } catch (e) {
    return `web: ${e.message || e}`;
  }
}

export async function runScoutIntel(topic = '') {
  const t0 = Date.now();
  const q = String(topic || '').trim();
  const internal = await internalOsIntel();
  let external = null;
  if (q && !/^(os|system|internal)$/i.test(q)) {
    external = await webIntel(q);
  }
  const report = [
    `🔭 *Scout Intel · Wave 11F*`,
    q ? `Topic: ${q}` : 'Topic: OS internal',
    '',
    '*Internal*',
    internal,
    external ? '\n*External*\n' + external : q ? '\n_External: no web module / empty_' : '',
    '',
    `_${Date.now() - t0}ms_`,
  ]
    .filter(Boolean)
    .join('\n');

  LAST_BRIEF = {
    topic: q || 'os',
    ms: Date.now() - t0,
    preview: report.slice(0, 240),
    at: new Date().toISOString(),
  };
  return { ok: true, report, ms: Date.now() - t0, brief: LAST_BRIEF };
}

export default { runScoutIntel, latestBrief };
