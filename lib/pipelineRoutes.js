function isFounder(ctx) {
  const admin = String(process.env.ADMIN_ID || process.env.FOUNDER_ID || '')
    .split(/[\s,]+/)
    .filter(Boolean);
  const uid = String(ctx?.from?.id || ctx?.message?.from?.id || '');
  if (!admin.length) return true;
  return admin.includes(uid);
}

export function isPipelineText(text = '') {
  const t = String(text || '')
    .trim()
    .replace(/^\//, '');
  return /^(pipeline)\b/i.test(t);
}

export async function tryHandle(text = '', ctx = null) {
  const raw = String(text || '')
    .trim()
    .replace(/^\//, '');
  if (!raw || !isPipelineText(raw)) return null;
  if (ctx && !isFounder(ctx)) return '🔒 Founder only.';

  const eng = await import('./pipelineEngine.js');
  const lower = raw.toLowerCase();

  if (/^(pipeline)\s+help$/i.test(lower) || /^(pipeline)$/i.test(lower)) {
    return eng.pipelineHelp();
  }
  if (/^(pipeline)\s+status$/i.test(lower)) {
    const a = await eng.failAlerts(5);
    return (
      '🧪 *Pipeline online · 12E*\n' +
      'Mode: light + fail filter\n' +
      `Open fails (last window): *${a.count}*\n` +
      'Dashboard Lab: All / Fails chips'
    );
  }
  if (/^(pipeline)\s+fails$/i.test(lower)) {
    const a = await eng.failAlerts(10);
    if (!a.count) return '✅ *No pipeline fails* in recent log. System quiet.';
    return (
      `🚨 *Pipeline fails* (${a.count})\n\n` +
      a.items
        .map((r, i) => {
          return `${i + 1}. ❌ *${r.family}* · ${r.corps}\n\`${String(r.raw_text || '').slice(0, 48)}\`\n_${String(r.detail || r.stage || '').slice(0, 80)}_`;
        })
        .join('\n\n')
    );
  }
  if (/^(pipeline)\s+last$/i.test(lower)) {
    const rows = await eng.recentPipeline({ limit: 10 });
    if (!rows.length) return 'No pipeline log yet.';
    return (
      '🧪 *Last pipeline events*\n\n' +
      rows
        .map((r, i) => {
          const icon = r.ok === false ? '❌' : '✅';
          return `${i + 1}. ${icon} *${r.family}* · ${r.corps} · ${r.ms || 0}ms\n\`${String(r.raw_text || '').slice(0, 48)}\``;
        })
        .join('\n\n')
    );
  }
  if (/^(pipeline)\s+stats$/i.test(lower)) {
    const s = await eng.pipelineStats(40, false);
    const fam = Object.entries(s.byFamily || {})
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([k, v]) => `· ${k}: ${v}`)
      .join('\n');
    const corps = Object.entries(s.byCorps || {})
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([k, v]) => `· ${k}: ${v}`)
      .join('\n');
    return (
      `🧪 *Pipeline stats* (last ${s.total})\n` +
      `OK ${s.ok_count} · Fail ${s.fail_count}\n\n` +
      `*By family*\n${fam || '—'}\n\n` +
      `*By corps*\n${corps || '—'}`
    );
  }
  return '❓ Try `pipeline help`';
}

export default { tryHandle, isPipelineText };
