/**
 * /omni — Omniscience Brain: unify audit + health + swarm + mem recall
 */
export async function runOmni(supabase, query) {
  const out = { at: new Date().toISOString(), sections: [] };
  // Chronos health
  try {
    const chronos = await import('../lib/chronos.js');
    const h = await chronos.checkProductionHealth();
    out.sections.push({
      name: 'health',
      ok: !!h.ok,
      detail: 'status=' + (h.status || '?') + ' ms=' + (h.ms || h.responseMs || '?'),
    });
  } catch (e) {
    out.sections.push({ name: 'health', ok: false, detail: String(e.message || e) });
  }
  // Audit last
  try {
    const { data } = await supabase
      .from('rq_audit_log')
      .select('command,result,created_at')
      .order('created_at', { ascending: false })
      .limit(5);
    out.sections.push({
      name: 'audit',
      ok: true,
      detail: (data || [])
        .map((r) => (r.command || '') + '→' + (r.result || '').slice(0, 20))
        .join(' · ') || 'empty',
    });
  } catch (e) {
    out.sections.push({ name: 'audit', ok: false, detail: String(e.message || e) });
  }
  // Legion
  try {
    const leg = await import('../lib/legionSwarm.js');
    const st = await leg.legionStatus(supabase);
    const n = (st.agents || []).filter((a) => a.status !== 'fired').length;
    out.sections.push({
      name: 'legion',
      ok: !!st.ok,
      detail: st.ok ? 'active agents=' + n : st.error,
    });
  } catch (e) {
    out.sections.push({ name: 'legion', ok: false, detail: String(e.message || e) });
  }
  // Memory keyword
  if (query) {
    try {
      const mem = await import('../lib/memoryGraph.js');
      const r = await mem.recall(supabase, query, 3);
      out.sections.push({
        name: 'memory',
        ok: !!r.ok,
        detail: r.ok
          ? (r.hits || []).map((h) => h.text || h.body || '').join(' | ').slice(0, 300)
          : r.error,
      });
    } catch (e) {
      out.sections.push({ name: 'memory', ok: false, detail: String(e.message || e) });
    }
  }
  return out;
}

export function formatOmni(o) {
  const lines = ['🕳 OMNISCIENCE BRAIN', o.at || '', ''];
  for (const s of o.sections || []) {
    lines.push((s.ok ? '✅ ' : '❌ ') + s.name + ': ' + (s.detail || ''));
  }
  return lines.join('\n').slice(0, 3500);
}

export default { runOmni, formatOmni };
