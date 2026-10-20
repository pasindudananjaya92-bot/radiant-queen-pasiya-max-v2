/**
 * lib/nightlyIntegration.js — P8 glue: Panopticon + Swarm patterns + audit digest
 */
export async function runWeeklyShield(supabase) {
  const out = { at: new Date().toISOString(), steps: [] };
  try {
    const { runPanopticonScan, formatPanopticonReport } = await import('../lib/panopticon.js');
    const report = await runPanopticonScan();
    out.steps.push({ step: 'panopticon', ok: !!report.ok, summary: report.summary });
    out.secreport = formatPanopticonReport(report).slice(0, 2500);

    // Share top finding into swarm hive
    try {
      const swarm = await import('../lib/swarm.js');
      const vulnCount = report.summary?.osvVulns || 0;
      await swarm.sharePattern(supabase, {
        agentName: 'security-agent',
        kind: 'scan',
        title: 'Weekly OSV vulns=' + vulnCount,
        body: out.secreport.slice(0, 1500),
        tags: ['panopticon', 'weekly'],
      });
      out.steps.push({ step: 'swarm_share', ok: true });
    } catch (e) {
      out.steps.push({ step: 'swarm_share', ok: false, error: String(e.message || e) });
    }

    // Chronos health
    try {
      const chronos = await import('../lib/chronos.js');
      const h = await chronos.checkProductionHealth();
      out.health = h;
      out.steps.push({ step: 'chronos_health', ok: !!h.ok });
    } catch (e) {
      out.steps.push({ step: 'chronos_health', ok: false, error: String(e.message || e) });
    }
  } catch (e) {
    out.error = String(e.message || e);
  }
  return out;
}

export function formatNightly(out) {
  const lines = [
    '🌙 P8 NIGHTLY INTEGRATION',
    'at: ' + (out.at || ''),
    '',
  ];
  for (const s of out.steps || []) {
    lines.push((s.ok ? '✅ ' : '❌ ') + s.step + (s.error ? ' · ' + s.error : ''));
  }
  if (out.health) {
    lines.push('', 'Health: ' + (out.health.ok ? 'OK' : 'FAIL') + ' ' + (out.health.status || ''));
  }
  if (out.secreport) {
    lines.push('', out.secreport.slice(0, 2000));
  }
  if (out.error) lines.push('ERR: ' + out.error);
  return lines.join('\n').slice(0, 3900);
}

export default { runWeeklyShield, formatNightly };
