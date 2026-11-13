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
  return /^(pipeline|lab)\b/i.test(t);
}

export async function tryHandle(text = '', ctx = null) {
  const raw = String(text || '')
    .trim()
    .replace(/^\//, '');
  if (!raw || !isPipelineText(raw)) return null;
  if (ctx && !isFounder(ctx)) return '🔒 Founder only.';

  const eng = await import('./pipelineEngine.js');
  const lower = raw.toLowerCase();

  if (/^(pipeline|lab)\s+help$/i.test(lower) || /^(pipeline|lab)$/i.test(lower)) {
    return eng.pipelineHelp();
  }
  if (/^(pipeline|lab)\s+status$/i.test(lower)) {
    return (
      '🧪 *Pipeline online · 12D*\n' +
      'Mode: light (classify + verify + log)\n' +
      'Dashboard Lab panel: War tab\n' +
      'Heavy: `mission council` / `think`\n' +
      'Code heal: `codeswarm` + gh gate'
    );
  }
  if (/^(pipeline|lab)\s+last$/i.test(lower)) {
    const rows = await eng.recentPipeline(10);
    if (!rows.length) {
      return 'No pipeline log yet. Run any command then `pipeline last`.';
    }
    return (
      '🧪 *Last pipeline events*\n\n' +
      rows
        .map((r, i) => {
          const icon = r.ok ? '✅' : '❌';
          return `${i + 1}. ${icon} *${r.family}* · ${r.corps} · ${r.ms || 0}ms\n\`${String(r.raw_text || '').slice(0, 48)}\``;
        })
        .join('\n\n')
    );
  }
  if (/^(pipeline|lab)\s+stats$/i.test(lower)) {
    const s = await eng.pipelineStats(40);
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
