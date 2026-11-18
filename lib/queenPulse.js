/**
 * Wave 28A — Queen Pulse + Fortify (closed-loop aggregate)
 */
export const VERSION = '28A';

export async function buildQueenPulse() {
  const t0 = Date.now();
  const lines = ['👑 *Queen Pulse · ' + VERSION + '*', ''];

  // Health
  try {
    const h = await import('./healthManager.js');
    const r = await h.runFullCheck();
    const okN = (r.checks || []).filter((c) => c.ok).length;
    const tot = (r.checks || []).length;
    lines.push('🩺 Health: ' + okN + '/' + tot + ' ' + (r.ok ? 'ok' : 'issues'));
  } catch (e) {
    lines.push('🩺 Health: —');
  }

  // Deploy
  try {
    const d = await import('./deployGuardian.js');
    const rep = (await d.runDeployCheck?.()) || (await d.checkDeploy?.());
    if (typeof rep === 'string') lines.push('🛡 Deploy: ' + rep.split('\n')[0]);
    else if (rep && rep.summary) lines.push('🛡 Deploy: ' + rep.summary);
    else lines.push('🛡 Deploy: module present');
  } catch (e) {
    lines.push('🛡 Deploy: —');
  }

  // Budget
  try {
    const emp = await import('./empireEngine.js');
    const st = (await emp.getStatus?.()) || emp.status?.();
    if (st && st.text) lines.push('💰 Budget: ' + String(st.text).slice(0, 80));
    else {
      const bank = (await emp.formatBankPretty?.()) || '';
      if (bank) lines.push('💰 ' + String(bank).split('\n')[0]);
      else lines.push('💰 Budget: see `empire status`');
    }
  } catch (e) {
    lines.push('💰 Budget: —');
  }

  // Site
  try {
    const wm = await import('./webMaster.js');
    const rows = await wm.listSections();
    const pub = (rows || []).filter((r) => r.published !== false).length;
    lines.push('🌐 Site: ' + (rows || []).length + ' sections · ~' + pub + ' published');
  } catch (e) {
    lines.push('🌐 Site: —');
  }

  // Probe
  try {
    const qa = await import('./qaEngine.js');
    const probe = await qa.runRouteProbe({ openTickets: false });
    lines.push('⚔ Probe: ' + probe.passed + '/' + probe.total);
  } catch (e) {
    lines.push('⚔ Probe: —');
  }

  // Decisions
  try {
    const dec = await import('./decisionsEngine.js');
    const s = dec.decisionsStatus();
    lines.push(
      '⚖ Decisions: ' + (s.circuit_open ? '🔒 OFF' : s.has_key ? '✅ ready' : '❌ no key')
    );
  } catch (e) {
    lines.push('⚖ Decisions: —');
  }

  // Lab
  try {
    const lab = await import('./labEngine.js');
    const n = await lab.countProposals?.();
    if (n != null) lines.push('🧪 Lab proposals: ' + n);
  } catch (e) {
    /* optional */
  }

  lines.push('');
  lines.push(Date.now() - t0 + 'ms · free-tier aggregate · no auto-actions');
  return lines.join('\n');
}

/** One-shot fortify: probe + coverage + deep probes + deploy + decisions */
export async function runFortify() {
  const t0 = Date.now();
  const parts = ['🛡 *Queen Fortify · ' + VERSION + '*', ''];

  try {
    const qa = await import('./qaEngine.js');
    const probe = await qa.runRouteProbe({ openTickets: true });
    parts.push(
      '⚔ Probe: ' + (probe.ok ? '✅' : '❌') + ' ' + probe.passed + '/' + probe.total + ' · ' + (probe.ms || 0) + 'ms'
    );
    if (!probe.ok) {
      for (const x of (probe.results || []).filter((r) => !r.pass).slice(0, 3)) {
        parts.push('  · ' + (x.name || x.id || 'fail'));
      }
    }
  } catch (e) {
    parts.push('⚔ Probe: ⚠️ ' + (e.message || e));
  }

  try {
    const cov = await import('./coverageEngine.js');
    const scan = (await cov.runCoverageScan?.()) || (await cov.scan?.());
    if (scan && scan.summary) parts.push('🗺 Coverage: ' + scan.summary);
    else if (typeof scan === 'string') parts.push('🗺 Coverage: ' + scan.split('\n')[0]);
    else parts.push('🗺 Coverage: module present');
  } catch (e) {
    parts.push('🗺 Coverage: —');
  }

  try {
    const deep = await import('./deepProbes.js');
    parts.push(deep.formatDeepProbes(await deep.runDeepProbes()));
  } catch (e) {
    parts.push('🔌 Deep probes: ⚠️ ' + (e.message || e));
  }

  try {
    const d = await import('./deployGuardian.js');
    const rep = await d.runDeployCheck?.();
    if (typeof rep === 'string') parts.push(rep.split('\n').slice(0, 4).join('\n'));
    else parts.push('🛡 Deploy: checked');
  } catch (e) {
    parts.push('🛡 Deploy: —');
  }

  try {
    const dec = await import('./decisionsEngine.js');
    const s = dec.decisionsStatus();
    parts.push(
      '⚖ Decisions: key=' + (s.has_key ? 'yes' : 'no') + ' · circuit=' + (s.circuit_open ? 'OPEN' : 'ok')
    );
  } catch (e) {
    parts.push('⚖ Decisions: —');
  }

  parts.push('');
  parts.push('_' + (Date.now() - t0) + 'ms · read-only fortify · no code push_');
  return parts.join('\n');
}

export function queenHelp() {
  return [
    '👑 *Queen OS · Wave ' + VERSION + '*',
    'Command center + closed-loop bridge',
    '',
    '• `queen help` — this menu',
    '• `queen pulse` / `queen status` — one-shot OS pulse',
    '• `queen fortify` — probe + coverage + deep probes + deploy + decisions',
    '',
    'Site ↔ Deal',
    '• `site sync pricing` — packs → HTML (draft)',
    '• `site golive` — publish core sections',
    '',
    '_Never auto-publishes money. Founder approve only._',
  ].join('\n');
}

export default { VERSION, buildQueenPulse, runFortify, queenHelp };
