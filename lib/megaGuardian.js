/**
 * Wave 24 MEGA — Fallthrough Guardian
 * Known OS command prefixes must never silent-drop to the LLM.
 */

export const VERSION = '24-MEGA';

/** Prefixes that belong to Queen OS routers (not free-chat) */
export const OS_PREFIXES = [
  'mega',
  'morning',
  'night',
  'voice',
  'god',
  'twin',
  'empire',
  'deal',
  'preset',
  'web',
  'site',
  'webmaster',
  'deploy',
  'guardian',
  'lab',
  'qa',
  'legion',
  'pipeline',
  'codeswarm',
  'swarm',
  'gswarm',
  'unit',
  'nation',
  'corps',
  'mission',
  'heal',
  'immune',
  'sentinel',
  'audit',
  'scout',
  'omni',
  'coverage',
  'think',
  'health',
  'vault',
  'drive',
  'bank',
  'shadow',
  'mem',
  'memory',
  'doc',
  'make',
  'snap',
  'cron',
  'gh',
  'mail',
  'email',
  'tts',
  'alerts',
  'commands',
  'cmdlist',
];

export function looksLikeOsCommand(text) {
  const t = String(text || '')
    .trim()
    .replace(/^\//, '');
  if (!t) return false;
  const first = t.split(/\s+/)[0].toLowerCase();
  if (OS_PREFIXES.includes(first)) return true;
  // multi-word starts
  if (/^(swarm\s+spawn|swarm\s+units|morning\s+pack|web\s+check|web\s+guide)/i.test(t)) return true;
  return false;
}

export function fallthroughMessage(text) {
  const t = String(text || '').trim().slice(0, 60);
  const first = t.replace(/^\//, '').split(/\s+/)[0] || '';
  return [
    '🛡 *Mega Guardian*',
    'Command-like text was **not** routed to a handler (would have hit the LLM).',
    '',
    'Input: `' + t + '`',
    first ? 'Family hint: try `' + first + ' help`' : 'Try `commands` or `mega help`',
    '',
    '_No silent AI fallthrough for OS commands._',
  ].join('\n');
}

export async function megaStatus() {
  const lines = ['👑 *Mega Status · 24*', ''];
  // Health
  try {
    const h = await import('./healthManager.js');
    const fn = h.runFullCheck || h.runHealthCheck || h.checkAll;
    if (typeof fn === 'function') {
      const r = await fn();
      if (r && Array.isArray(r.checks)) {
        const ok = r.checks.filter((c) => c.ok !== false).length;
        lines.push(`🩺 Health: ${ok}/${r.checks.length} ok`);
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
    const d = await import('./deployGuardian.js');
    if (typeof d.runDeployCheck === 'function') {
      const r = await d.runDeployCheck();
      const fn = r?.functions?.count ?? r?.fnCount ?? '?';
      lines.push(`🛡 Deploy: fn ${fn}/12 · ${r?.vercel?.state || r?.ready || 'check'}`);
    }
  } catch (_) {
    lines.push('🛡 Deploy: —');
  }
  // QA probe light
  try {
    const qa = await import('./qaEngine.js');
    if (typeof qa.runRouteProbe === 'function') {
      const p = await qa.runRouteProbe({ openTickets: false });
      lines.push(`⚔ Probe: ${p.ok ? '✅' : '❌'} ${p.passed}/${p.total} · ${p.ms}ms`);
    }
  } catch (_) {
    lines.push('⚔ Probe: —');
  }
  // Site
  try {
    const wm = await import('./webMaster.js');
    if (typeof wm.listSections === 'function') {
      const rows = await wm.listSections();
      lines.push(`🌐 Site sections: ${rows?.length || 0}`);
    }
  } catch (_) {
    lines.push('🌐 Site: —');
  }
  lines.push('');
  lines.push('Guardian prefixes: ' + OS_PREFIXES.length);
  lines.push('Try: `mega help` · `morning pack` · `web check` · `qa probe`');
  return lines.join('\n');
}

export default {
  VERSION,
  OS_PREFIXES,
  looksLikeOsCommand,
  fallthroughMessage,
  megaStatus,
};
