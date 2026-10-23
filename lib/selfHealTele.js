/**
 * /selfheal — telemetry + safe auto-hints (founder)
 * Reads rq_audit_log + optional error patterns; never mutates repo alone
 */
export async function runSelfHeal(supabase, mode = 'status') {
  const out = {
    ok: true,
    mode,
    chronos: null,
    recentFails: [],
    hints: [],
  };

  try {
    const ch = await import('../lib/chronos.js');
    if (typeof ch.probeHealth === 'function') {
      out.chronos = await ch.probeHealth();
    } else if (typeof ch.health === 'function') {
      out.chronos = await ch.health();
    }
  } catch (e) {
    out.chronos = { ok: false, error: String(e.message || e).slice(0, 120) };
  }

  if (supabase) {
    try {
      const { data } = await supabase
        .from('rq_audit_log')
        .select('command,result,detail,created_at')
        .order('created_at', { ascending: false })
        .limit(30);
      const rows = data || [];
      out.recentFails = rows
        .filter((r) => /fail|error|block/i.test(String(r.result || '') + String(r.detail || '')))
        .slice(0, 8)
        .map((r) => ({
          cmd: r.command,
          result: r.result,
          at: r.created_at,
          detail: String(r.detail || '').slice(0, 80),
        }));
    } catch (_) {}
  }

  // Heuristic hints
  if (out.chronos && out.chronos.ok === false) {
    out.hints.push('Chronos unhealthy — run /chronos health and check Vercel logs');
  }
  if (out.recentFails.some((f) => /sql/i.test(f.cmd || ''))) {
    out.hints.push('SQL failures detected — prefer /sql SELECT … ; avoid DROP; check rq_exec_sql');
  }
  if (out.recentFails.some((f) => /prfix|gh|git/i.test(f.cmd || ''))) {
    out.hints.push('Git/PR issues — confirm GITHUB_TOKEN Contents R/W; use surgical ghHeal');
  }
  if (!out.hints.length) {
    out.hints.push('System calm — no automated action required');
  }

  if (mode === 'hints' || mode === 'status') {
    return out;
  }
  return out;
}

export function formatSelfHeal(r) {
  if (!r.ok) return 'Selfheal failed';
  const h = r.chronos;
  let healthLine = 'Chronos: n/a';
  if (h) {
    if (h.ok) healthLine = 'Chronos: OK';
    else healthLine = 'Chronos: WARN ' + String(h.error || h.status || '').slice(0, 80);
  }
  const fails =
    r.recentFails && r.recentFails.length
      ? r.recentFails
          .map(
            (f, i) =>
              i +
              1 +
              '. /' +
              (f.cmd || '?') +
              ' → ' +
              (f.result || '') +
              (f.detail ? ' · ' + f.detail : '')
          )
          .join('\n')
      : '(no recent fail rows)';
  return (
    'SELF-HEAL TELEMETRY\n' +
    healthLine +
    '\n\nRecent fails:\n' +
    fails +
    '\n\nHints:\n' +
    r.hints.map((x) => '• ' + x).join('\n') +
    '\n\n/selfheal · /chronos health · /prfix path :: note'
  ).slice(0, 3900);
}

export default { runSelfHeal, formatSelfHeal };
