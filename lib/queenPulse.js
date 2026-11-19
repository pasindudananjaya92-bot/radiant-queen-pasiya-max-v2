/**
 * Wave 30B — Queen Pulse (real deploy + bank numbers)
 */
export const VERSION = '30B';

export async function buildQueenPulse() {
  const t0 = Date.now();
  const lines = ['👑 *Queen Pulse · ' + VERSION + '*', ''];

  try {
    const h = await import('./healthManager.js');
    const r = await h.runFullCheck();
    const okN = (r.checks || []).filter((c) => c.ok).length;
    const tot = (r.checks || []).length || 5;
    lines.push('🩺 Health: ' + okN + '/' + tot + ' ' + (r.ok || r.allOk ? 'ok' : 'issues'));
  } catch (e) {
    lines.push('🩺 Health: —');
  }

  try {
    const d = await import('./deployGuardian.js');
    const r = await d.runDeployCheck();
    const brief =
      (typeof d.deployGuardianBrief === 'function' && (await d.deployGuardianBrief())) ||
      (typeof d.formatDeployCheck === 'function' && d.formatDeployCheck(r)) ||
      '';
    const first = String(brief || '')
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)[0];
    if (r && (r.fnCount != null || r.functions != null)) {
      const n = r.fnCount != null ? r.fnCount : r.functions;
      const max = r.fnMax != null ? r.fnMax : 12;
      lines.push('🛡 Deploy: fn ' + n + '/' + max + (r.ok === false ? ' · risk' : ' · ok'));
    } else if (first) {
      lines.push('🛡 Deploy: ' + first.slice(0, 120));
    } else {
      lines.push('🛡 Deploy: checked');
    }
  } catch (e) {
    lines.push('🛡 Deploy: —');
  }

  try {
    const emp = await import('./empireEngine.js');
    let line = '';
    try {
      const sum = await emp.bankSummary();
      line = emp.formatBankPretty(sum);
    } catch (_) {}
    if (!line) {
      try {
        const st = await emp.empireStatus();
        line = emp.formatEmpireStatus(st);
      } catch (_) {}
    }
    const first = String(line || '')
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)[0];
    lines.push(first ? '💰 ' + first.replace(/^💰\s*/, '') : '💰 `empire status`');
  } catch (e) {
    lines.push('💰 `empire status`');
  }

  try {
    const wm = await import('./webMaster.js');
    const rows = await wm.listSections();
    const pub = (rows || []).filter((r) => r.published !== false).length;
    lines.push('🌐 Site: ' + (rows || []).length + ' sections · ~' + pub + ' published');
  } catch (e) {
    lines.push('🌐 Site: —');
  }

  try {
    const qa = await import('./qaEngine.js');
    const probe = await qa.runRouteProbe({ openTickets: false });
    lines.push('⚔ Probe: ' + probe.passed + '/' + probe.total);
  } catch (e) {
    lines.push('⚔ Probe: —');
  }

  try {
    const dec = await import('./decisionsEngine.js');
    const s = dec.decisionsStatus();
    lines.push(
      '⚖ Decisions: ' + (s.circuit_open ? '🔒 OFF' : s.has_key ? '✅ ready' : '❌ no key')
    );
  } catch (e) {
    lines.push('⚖ Decisions: —');
  }

  lines.push('');
  lines.push(Date.now() - t0 + 'ms · free-tier · no auto-actions');
  return lines.join('\n');
}

export async function runFortify() {
  const t0 = Date.now();
  const parts = ['🛡 *Queen Fortify · ' + VERSION + '*', ''];
  try {
    const qa = await import('./qaEngine.js');
    const probe = await qa.runRouteProbe({ openTickets: true });
    parts.push(
      '⚔ Probe: ' +
        (probe.ok ? '✅' : '❌') +
        ' ' +
        probe.passed +
        '/' +
        probe.total +
        ' · ' +
        (probe.ms || 0) +
        'ms'
    );
  } catch (e) {
    parts.push('⚔ Probe: ⚠️ ' + (e.message || e));
  }
  try {
    const deep = await import('./deepProbes.js');
    parts.push(deep.formatDeepProbes(await deep.runDeepProbes()));
  } catch (e) {
    parts.push('🔌 Deep: —');
  }
  try {
    const d = await import('./deployGuardian.js');
    const r = await d.runDeployCheck();
    const t = d.formatDeployCheck(r);
    parts.push(String(t).split('\n').slice(0, 5).join('\n'));
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
  parts.push('_' + (Date.now() - t0) + 'ms · read-only_');
  return parts.join('\n');
}

export function queenHelp() {
  return [
    '👑 *Queen OS · ' + VERSION + '*',
    '• `queen pulse` · `queen fortify` · `queen help`',
    '• Photo + `scan` — Vision (Hobby-safe)',
    '• `forge help` — Code Forge draft (no auto-push)',
  ].join('\n');
}

export default { VERSION, buildQueenPulse, runFortify, queenHelp };
