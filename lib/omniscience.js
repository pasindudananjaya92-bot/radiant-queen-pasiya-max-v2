/**
 * Omniscience Brain — unified system awareness (founder)
 * /omni [query]
 * /omni full  → deep scan (panopticon + chronos + legion + audit + mem + git)
 */
export async function runOmni(supabase, query = '') {
  const q = String(query || '').trim();
  const deep = !q || /^full|deep|all|sovereign$/i.test(q);
  const out = {
    at: new Date().toISOString(),
    mode: deep ? 'full' : 'query',
    query: q,
    sections: [],
  };

  // 1) Production health (Chronos)
  try {
    const chronos = await import('../lib/chronos.js');
    const h = await chronos.checkProductionHealth();
    out.sections.push({
      name: 'health',
      ok: !!h.ok,
      detail:
        'HTTP ' +
        (h.status || '?') +
        ' · ' +
        (h.ms || h.responseMs || '?') +
        'ms · token=' +
        !!h.token +
        ' gemini=' +
        !!h.gemini +
        ' groq=' +
        !!h.groq +
        ' db=' +
        !!h.supabase,
    });
  } catch (e) {
    out.sections.push({ name: 'health', ok: false, detail: String(e.message || e).slice(0, 120) });
  }

  // 2) Intent ledger (last commands)
  try {
    const { data, error } = await supabase
      .from('rq_audit_log')
      .select('command,result,created_at')
      .order('created_at', { ascending: false })
      .limit(deep ? 8 : 5);
    if (error) throw error;
    out.sections.push({
      name: 'audit',
      ok: true,
      detail:
        (data || [])
          .map(
            (r) =>
              (r.command || '?').slice(0, 24) +
              '→' +
              String(r.result || '').slice(0, 16)
          )
          .join(' · ') || 'empty',
    });
  } catch (e) {
    out.sections.push({ name: 'audit', ok: false, detail: String(e.message || e).slice(0, 100) });
  }

  // 3) Legion economy
  try {
    const leg = await import('../lib/legionSwarm.js');
    const st = await leg.legionStatus(supabase);
    const agents = st.agents || [];
    const active = agents.filter((a) => a.status !== 'fired');
    const credits = active.reduce((s, a) => s + (Number(a.credits) || 0), 0);
    out.sections.push({
      name: 'legion',
      ok: !!st.ok,
      detail: st.ok
        ? 'agents=' + active.length + ' credits=' + credits
        : String(st.error || 'fail').slice(0, 80),
    });
  } catch (e) {
    out.sections.push({ name: 'legion', ok: false, detail: String(e.message || e).slice(0, 100) });
  }

  // 4) Memory recall (if query) or last notes
  try {
    const mem = await import('../lib/memoryGraph.js');
    const key = q && !deep ? q : 'pasiya';
    const r = await mem.recall(supabase, key, 3);
    out.sections.push({
      name: 'memory',
      ok: !!r.ok,
      detail: r.ok
        ? (r.hits || [])
            .map((h) => String(h.text || h.body || h.content || '').slice(0, 80))
            .filter(Boolean)
            .join(' | ')
            .slice(0, 280) || 'no hits'
        : String(r.error || '').slice(0, 80),
    });
  } catch (e) {
    out.sections.push({ name: 'memory', ok: false, detail: String(e.message || e).slice(0, 100) });
  }

  // 5) Deep only: Panopticon OSV
  if (deep) {
    try {
      const pan = await import('../lib/panopticon.js');
      const report = await pan.runPanopticonScan();
      const vulns = report?.summary?.osvVulns ?? report?.findings?.length ?? 0;
      out.sections.push({
        name: 'shield',
        ok: !!report.ok,
        detail: report.ok
          ? 'OSV vulns=' + vulns + ' · ' + String(report.summary?.note || 'scanned').slice(0, 60)
          : String(report.error || 'scan fail').slice(0, 80),
      });
    } catch (e) {
      out.sections.push({ name: 'shield', ok: false, detail: String(e.message || e).slice(0, 100) });
    }

    // 6) GitHub repo pulse
    try {
      const token = process.env.GITHUB_TOKEN || '';
      const repo = process.env.GITHUB_REPO || 'pasindudananjaya92-bot/radiant-queen-pasiya-max-v2';
      if (token) {
        const res = await fetch('https://api.github.com/repos/' + repo, {
          headers: {
            Authorization: 'Bearer ' + token,
            Accept: 'application/vnd.github+json',
            'User-Agent': 'PasiyaOS-Omni',
          },
        });
        const j = await res.json();
        out.sections.push({
          name: 'github',
          ok: res.ok,
          detail: res.ok
            ? repo + ' · ★' + (j.stargazers_count || 0) + ' · push ' + String(j.pushed_at || '').slice(0, 10)
            : 'HTTP ' + res.status,
        });
      } else {
        out.sections.push({ name: 'github', ok: false, detail: 'GITHUB_TOKEN missing' });
      }
    } catch (e) {
      out.sections.push({ name: 'github', ok: false, detail: String(e.message || e).slice(0, 100) });
    }

    // 7) Revenue pulse
    try {
      const { data, error } = await supabase
        .from('rq_revenue_leads')
        .select('id,value_usd,status')
        .limit(50);
      if (error) throw error;
      const open = (data || []).filter((x) => x.status === 'open');
      const sum = open.reduce((s, x) => s + (Number(x.value_usd) || 0), 0);
      out.sections.push({
        name: 'revenue',
        ok: true,
        detail: 'open=' + open.length + ' · pipeline $' + sum,
      });
    } catch (e) {
      out.sections.push({
        name: 'revenue',
        ok: false,
        detail: 'table? ' + String(e.message || e).slice(0, 60),
      });
    }
  }

  out.ok = out.sections.every((s) => s.ok !== false) || out.sections.some((s) => s.ok);
  return out;
}

export function formatOmni(o) {
  const lines = [
    '🕳 OMNISCIENCE BRAIN',
    'mode: ' + (o.mode || '') + ' · ' + (o.at || ''),
    o.query && o.mode === 'query' ? 'q: ' + o.query : '',
    '',
  ].filter(Boolean);
  for (const s of o.sections || []) {
    lines.push((s.ok ? '✅ ' : '❌ ') + s.name + ': ' + (s.detail || ''));
  }
  lines.push('', 'Tip: /omni full · /nightly · /secreport · /legion status');
  return lines.join('\n').slice(0, 3900);
}

export default { runOmni, formatOmni };
