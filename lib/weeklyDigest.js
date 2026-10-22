/**
 * /weekly — founder system digest (audit + health + secrets summary)
 */
export async function buildWeekly(supabase) {
  const parts = [];
  parts.push('WEEKLY DIGEST · ' + new Date().toISOString().slice(0, 10));

  // health via chronos if present
  try {
    const ch = await import('../lib/chronos.js');
    if (ch.probeHealth) {
      const h = await ch.probeHealth();
      parts.push(
        'Health: ' +
          (h.ok ? 'OK' : 'WARN') +
          ' · ' +
          JSON.stringify(h.body?.checks || h.checks || {}).slice(0, 200)
      );
    }
  } catch (_) {
    parts.push('Health: chronos unavailable');
  }

  // last audit
  if (supabase) {
    try {
      const { data } = await supabase
        .from('rq_audit_log')
        .select('command,result,created_at')
        .order('created_at', { ascending: false })
        .limit(8);
      if (data && data.length) {
        parts.push(
          'Recent cmds:\n' +
            data
              .map(
                (r) =>
                  '· ' +
                  String(r.created_at || '').slice(0, 19) +
                  ' /' +
                  (r.command || '') +
                  ' → ' +
                  (r.result || '')
              )
              .join('\n')
        );
      }
    } catch (_) {}
  }

  // secrets quick
  try {
    const sc = await import('../lib/secretsScan.js');
    const r = await sc.runSecretsScan();
    parts.push(
      r.ok
        ? 'Secrets: ' + (r.findings?.length || 0) + ' hits / ' + r.scanned + ' files'
        : 'Secrets: skip'
    );
  } catch (_) {}

  return { ok: true, text: parts.join('\n\n').slice(0, 3800) };
}

export function formatWeekly(r) {
  if (!r.ok) return 'Weekly failed';
  return r.text;
}

export default { buildWeekly: buildWeekly, formatWeekly: formatWeekly };
