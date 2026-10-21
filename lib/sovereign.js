/**
 * Sovereign brief — one-shot system state
 */
export async function runSovereign(supabase) {
  const { runOmni } = await import('../lib/omniscience.js');
  const brain = await runOmni(supabase, 'full');
  let revenue = null;
  try {
    const rev = await import('../lib/revenueAgent.js');
    revenue = await rev.pipelineStats(supabase);
  } catch (_) {}
  return { at: new Date().toISOString(), brain, revenue };
}

export function formatSovereign(s) {
  const lines = ['👑 SOVEREIGN BRIEF', s.at || '', ''];
  const o = s.brain || {};
  lines.push('mode: ' + (o.mode || ''));
  for (const sec of o.sections || []) {
    lines.push((sec.ok ? '✅ ' : '❌ ') + sec.name + ': ' + (sec.detail || ''));
  }
  if (s.revenue?.ok) {
    const st = s.revenue.stats || {};
    lines.push(
      '',
      '💰 open=' +
        (st.open || 0) +
        ' $' +
        (st.openUsd || 0) +
        ' · won $' +
        (st.wonUsd || 0)
    );
  }
  lines.push('', 'Commands: /omni full · /revenue stats · /secreport · /nightly');
  return lines.join('\n').slice(0, 3900);
}

export default { runSovereign, formatSovereign };
