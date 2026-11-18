/**
 * Wave 26 — Queen Pulse (one-shot OS command center)
 * Free tier only. No new serverless functions. Read-only aggregate.
 */
export const VERSION = '26B';

export async function buildQueenPulse() {
  const lines = [`👑 *Queen Pulse · ${VERSION}*`, ''];
  const t0 = Date.now();

  // Health
  try {
    const h = await import('./healthManager.js');
    const fn = h.runFullCheck || h.fullCheck || h.healthCheck;
    if (typeof fn === 'function') {
      const r = await fn();
      if (r && Array.isArray(r.checks)) {
        const ok = r.checks.filter((c) => c.ok !== false).length;
        lines.push(`🩺 Health: ${ok}/${r.checks.length}${r.allOk ? ' ok' : ''}`);
      } else if (typeof r === 'string') {
        lines.push('🩺 Health: ' + r.slice(0, 120));
      } else {
        lines.push('🩺 Health: module ok');
      }
    } else {
      lines.push('🩺 Health: module present');
    }
  } catch (e) {
    lines.push('🩺 Health: ⚠️ ' + (e.message || e));
  }

  // Deploy
  try {
    const dg = await import('./deployGuardian.js');
    if (typeof dg.deployGuardianBrief === 'function') {
      lines.push('🛡 Deploy: ' + String(await dg.deployGuardianBrief()).slice(0, 160));
    } else if (typeof dg.runDeployCheck === 'function') {
      const d = await dg.runDeployCheck();
      lines.push('🛡 Deploy: ' + String(d.summary || d.text || 'checked').slice(0, 160));
    } else {
      lines.push('🛡 Deploy: guardian loaded');
    }
  } catch (e) {
    lines.push('🛡 Deploy: ⚠️ ' + (e.message || e));
  }

  // Empire budget
  try {
    const emp = await import('./empireEngine.js');
    const st = await emp.empireStatus();
    lines.push(
      `💰 Budget: $${Number(st.spend).toFixed(2)} / $${Number(st.cap).toFixed(0)} (${Number(st.usage).toFixed(0)}%)`
    );
    if (st.warn80) lines.push('⚠️ Budget ≥80% — watch API spend');
  } catch (e) {
    lines.push('💰 Budget: ⚠️ ' + (e.message || e));
  }

  // Site
  try {
    const wm = await import('./webMaster.js');
    const rows = await wm.listSections();
    const pub = (rows || []).filter((r) => r.published !== false).length;
    lines.push(`🌐 Site: ${rows?.length || 0} sections · ~${pub} published`);
  } catch (e) {
    lines.push('🌐 Site: ⚠️ ' + (e.message || e));
  }

  // QA probe light
  try {
    const qa = await import('./qaEngine.js');
    if (typeof qa.runRouteProbe === 'function') {
      const p = await qa.runRouteProbe({ openTickets: false });
      const pass = p?.pass ?? p?.passed ?? p?.okCount;
      const total = p?.total ?? p?.count;
      if (pass != null && total != null) lines.push(`⚔ Probe: ${pass}/${total}`);
      else if (p?.summary) lines.push('⚔ Probe: ' + String(p.summary).slice(0, 80));
      else lines.push('⚔ Probe: ran');
    }
  } catch (e) {
    lines.push('⚔ Probe: ⚠️ ' + (e.message || e));
  }

  // Lab proposals count
  try {
    const lab = await import('./labEngine.js');
    if (typeof lab.listProposals === 'function') {
      const props = await lab.listProposals({ limit: 20 });
      lines.push(`🧪 Lab proposals: ${(props || []).length}`);
    }
  } catch (_) {
    lines.push('🧪 Lab: —');
  }

  lines.push('');
  lines.push(`_${Date.now() - t0}ms · free-tier aggregate · no auto-actions_`);
  return lines.join('\n');
}

export function queenHelp() {
  return [
    `👑 *Queen OS · Wave ${VERSION}*`,
    'Command center + Site↔Deal bridge (draft-safe)',
    '',
    '• `queen help` — this menu',
    '• `queen pulse` / `queen status` — one-shot OS pulse',
    '',
    '*Site ↔ Deal (Web Master)*',
    '• `site sync pricing` — build pricing HTML from packages',
    '• `site sync pricing | Start:$X · Pro:$Y · Empire:Talk` — custom packs',
    '• Then `site publish pricing` when you approve',
    '',
    '_Never auto-publishes. Never moves money. Founder approve only._',
    '_Deploy: batch ZIP uploads · Hobby ~100 deploys/day_',
  ].join('\n');
}
