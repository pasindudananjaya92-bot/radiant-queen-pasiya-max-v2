/**
 * /logs — system log radar + auto-fix hints (founder)
 * Sources: rq_audit_log, error patterns, optional bridge to power-plant
 */
export async function fetchRecentLogs(supabase, limit = 20) {
  try {
    const { data, error } = await supabase
      .from('rq_audit_log')
      .select('command,result,detail,created_at,entry_hash')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return { ok: true, rows: data || [] };
  } catch (e) {
    try {
      const { data, error } = await supabase
        .from('rq_audit_log')
        .select('command,result,detail,created_at')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return { ok: true, rows: data || [] };
    } catch (e2) {
      return { ok: false, error: String(e2.message || e2) };
    }
  }
}

export function analyzeLogs(rows) {
  const fails = [];
  const cmds = {};
  for (const r of rows || []) {
    const c = (r.command || '?').toLowerCase();
    cmds[c] = (cmds[c] || 0) + 1;
    const res = String(r.result || r.detail || '').toLowerCase();
    if (
      /fail|error|❌|timeout|500|syntax|blocked|not found|crash/i.test(res) ||
      /fail|error/i.test(String(r.result || ''))
    ) {
      fails.push(r);
    }
  }
  const top = Object.entries(cmds)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([k, v]) => k + '×' + v);
  const hints = [];
  for (const f of fails.slice(0, 5)) {
    const d = String(f.detail || f.result || '');
    if (/syntax/i.test(d)) hints.push('Syntax: re-upload last changed lib via gh + node --check');
    if (/timeout|90000/i.test(d)) hints.push('Timeout: reduce AI max_tokens or split work');
    if (/12 Serverless|FUNCTION_INVOCATION/i.test(d))
      hints.push('Vercel 12-limit: use power-plant bridge, do not add api/*.js');
    if (/entry_hash|prev_hash/i.test(d)) hints.push('Run sql/CHAIN_AUDIT.sql');
    if (/neural|embedding/i.test(d)) hints.push('Run sql/NEURAL_MEMORY.sql + set GEMINI_API_KEY');
  }
  if (!hints.length && fails.length) {
    hints.push('Review fails with /logs fails · try /prfix <file> :: confirm <desc>');
  }
  if (!fails.length) hints.push('No fail patterns in recent window — system calm');
  return {
    total: (rows || []).length,
    failCount: fails.length,
    topCommands: top,
    recentFails: fails.slice(0, 8),
    hints: [...new Set(hints)].slice(0, 6),
  };
}

export function formatLogs(report, mode = 'all') {
  if (!report || report.error) return '❌ Logs: ' + (report?.error || 'fail');
  const lines = [
    '📡 LOG RADAR',
    'window: ' + report.total + ' · fails: ' + report.failCount,
    'top: ' + (report.topCommands || []).join(', '),
    '',
  ];
  if (mode === 'fails' || report.failCount) {
    lines.push('Recent fails:');
    for (const f of report.recentFails || []) {
      lines.push(
        '• ' +
          (f.command || '?') +
          ' → ' +
          String(f.result || '').slice(0, 40) +
          ' · ' +
          String(f.detail || '').slice(0, 60)
      );
    }
    if (!report.failCount) lines.push('(none)');
    lines.push('');
  }
  lines.push('Auto-hints:');
  for (const h of report.hints || []) lines.push('→ ' + h);
  lines.push('', '/logs fails · /logs hints · /selfheal · /prfix');
  return lines.join('\n').slice(0, 3500);
}

export async function runLogs(supabase, mode = 'all') {
  const got = await fetchRecentLogs(supabase, 25);
  if (!got.ok) return got;
  const analysis = analyzeLogs(got.rows);
  return { ok: true, ...analysis };
}

export default { fetchRecentLogs, analyzeLogs, formatLogs, runLogs };
