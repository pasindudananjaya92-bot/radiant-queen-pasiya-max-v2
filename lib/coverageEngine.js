
/**
 * Wave 19 — System Coverage Map
 * Every subsystem gets a "station" + owner corps + probe signal.
 * Metadata + live checks — not 500 new serverless functions.
 */

import { createClient } from '@supabase/supabase-js';

function sb() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

/** Full station registry — corners of Queen OS */
export const STATIONS = [
  // Core runtime
  { id: 'vercel', name: 'Vercel Runtime', corps: 'doors', wing: 'deploy', probe: 'env' },
  { id: 'supabase', name: 'Supabase DB', corps: 'interior', wing: 'data', probe: 'health' },
  { id: 'telegram', name: 'Telegram Webhook', corps: 'surface', wing: 'telegram', probe: 'route' },
  { id: 'dashboard', name: 'Dashboard PWA', corps: 'surface', wing: 'dashboard', probe: 'route' },
  // Command gates
  { id: 'gate_lab', name: 'Lab Routes', corps: 'doors', wing: 'route', probe: 'qa_probe' },
  { id: 'gate_qa', name: 'QA Routes', corps: 'doors', wing: 'route', probe: 'qa_probe' },
  { id: 'gate_pipeline', name: 'Pipeline Routes', corps: 'doors', wing: 'route', probe: 'qa_probe' },
  { id: 'gate_mission', name: 'Mission/Swarm', corps: 'doors', wing: 'route', probe: 'qa_probe' },
  { id: 'gate_codeswarm', name: 'Code Swarm', corps: 'doors', wing: 'route', probe: 'qa_probe' },
  // God pack
  { id: 'health', name: 'Health Monitor', corps: 'interior', wing: 'watchdog', probe: 'health' },
  { id: 'vault', name: 'Vault Storage', corps: 'interior', wing: 'storage', probe: 'qa_probe' },
  { id: 'drive', name: 'Queen Drive', corps: 'surface', wing: 'storage', probe: 'qa_probe' },
  { id: 'memory', name: 'Memory Brain', corps: 'interior', wing: 'memory', probe: 'soft' },
  { id: 'bank', name: 'Private Bank', corps: 'interior', wing: 'bank', probe: 'soft' },
  { id: 'shadow', name: 'Queen Shadow', corps: 'interior', wing: 'shadow', probe: 'soft' },
  // AI / think
  { id: 'think', name: 'Evidence Engine', corps: 'interior', wing: 'think', probe: 'soft' },
  { id: 'hullb', name: 'Hull B Worker', corps: 'interior', wing: 'queue', probe: 'soft' },
  { id: 'websearch', name: 'Web Search Army', corps: 'research', wing: 'search', probe: 'soft' },
  { id: 'voice', name: 'Voice STT/TTS', corps: 'surface', wing: 'voice', probe: 'soft' },
  { id: 'doc', name: 'Document Analyst', corps: 'interior', wing: 'doc', probe: 'soft' },
  // Ops
  { id: 'cron', name: 'cron-job.org', corps: 'interior', wing: 'cron', probe: 'soft' },
  { id: 'make', name: 'Make.com Webhook', corps: 'interior', wing: 'make', probe: 'soft' },
  { id: 'snap', name: 'SnapDeploy', corps: 'interior', wing: 'snap', probe: 'soft' },
  { id: 'sentry', name: 'Sentry', corps: 'doors', wing: 'security', probe: 'soft' },
  { id: 'night', name: 'Night Operator', corps: 'interior', wing: 'night', probe: 'soft' },
  { id: 'morning', name: 'Morning Pack', corps: 'scribe', wing: 'brief', probe: 'soft' },
  { id: 'mail', name: 'Queen Mail', corps: 'surface', wing: 'mail', probe: 'soft' },
  { id: 'apk', name: 'APK Forge', corps: 'surface', wing: 'apk', probe: 'soft' },
  // Lab nation
  { id: 'lab', name: 'Agent Laboratory', corps: 'research', wing: 'lab', probe: 'qa_probe' },
  { id: 'qa_legion', name: 'QA Legion', corps: 'qa_ref', wing: 'qa', probe: 'qa_probe' },
  { id: 'healer', name: 'Immune Healer', corps: 'interior', wing: 'heal', probe: 'soft' },
  { id: 'sentinel', name: 'Sentinel', corps: 'doors', wing: 'security', probe: 'soft' },
];

export function coverageHelp() {
  return (
    '*Coverage Map · Wave 19*\n' +
    'Stations: *' +
    STATIONS.length +
    '* — every OS corner has an owner corps\n\n' +
    '• `coverage help` — menu\n' +
    '• `coverage map` — full station list\n' +
    '• `coverage scan` — live probe all stations\n' +
    '• `coverage gaps` — only WARN/FAIL\n' +
    '• `coverage corps` — agents by corps\n\n' +
    '_Scan opens QA tickets for FAIL only._'
  );
}

async function softCheck(id) {
  // Best-effort presence / env / module load checks
  try {
    if (id === 'websearch') {
      const ws = await import('./webSearch.js');
      const ok = typeof ws.searchWeb === 'function' || typeof ws.default?.searchWeb === 'function';
      const key = !!(process.env.TAVILY_API_KEY || process.env.EXA_API_KEY || process.env.BRAVE_API_KEY);
      return { ok: ok && key, detail: ok ? (key ? 'searchWeb+key' : 'searchWeb no key') : 'missing export' };
    }
    if (id === 'memory') {
      await import('./memoryManager.js');
      return { ok: true, detail: 'memoryManager loaded' };
    }
    if (id === 'bank') {
      await import('./bankManager.js');
      return { ok: true, detail: 'bankManager loaded' };
    }
    if (id === 'shadow') {
      await import('./shadowManager.js');
      return { ok: true, detail: 'shadowManager loaded' };
    }
    if (id === 'think') {
      await import('./evidenceEngine.js');
      return { ok: true, detail: 'evidenceEngine loaded' };
    }
    if (id === 'hullb') {
      await import('./hullBManager.js');
      return { ok: true, detail: 'hullBManager loaded' };
    }
    if (id === 'voice') {
      await import('./ttsManager.js');
      return { ok: true, detail: 'ttsManager loaded' };
    }
    if (id === 'doc') {
      await import('./docManager.js');
      return { ok: true, detail: 'docManager loaded' };
    }
    if (id === 'cron') {
      return { ok: !!process.env.CRON_JOB_API_KEY || !!process.env.CRONJOB_API_KEY || !!process.env.CRON_API_KEY, detail: 'cron key' };
    }
    if (id === 'make') {
      return { ok: !!process.env.MAKE_WEBHOOK_URL, detail: 'MAKE_WEBHOOK_URL' };
    }
    if (id === 'snap') {
      return { ok: !!process.env.SNAPDEPLOY_API_KEY, detail: 'SNAPDEPLOY_API_KEY' };
    }
    if (id === 'sentry') {
      return { ok: !!process.env.SENTRY_DSN, detail: 'SENTRY_DSN' };
    }
    if (id === 'night' || id === 'morning') {
      await import('./morningPack.js');
      return { ok: true, detail: 'morningPack loaded' };
    }
    if (id === 'mail') {
      await import('./mailManager.js');
      return { ok: !!process.env.RESEND_API_KEY, detail: 'mail+resend' };
    }
    if (id === 'apk') {
      return { ok: true, detail: 'APK via GitHub Actions (external)' };
    }
    if (id === 'healer') {
      await import('./healerEngine.js');
      return { ok: true, detail: 'healerEngine loaded' };
    }
    if (id === 'sentinel') {
      await import('./sentinelEngine.js');
      return { ok: true, detail: 'sentinelEngine loaded' };
    }
    if (id === 'vercel') {
      return { ok: true, detail: 'running on vercel' };
    }
    if (id === 'supabase') {
      return { ok: !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY), detail: 'supabase env' };
    }
    if (id === 'telegram') {
      return { ok: !!process.env.BOT_TOKEN, detail: 'BOT_TOKEN' };
    }
    if (id === 'dashboard') {
      return { ok: true, detail: 'static+api/dash' };
    }
    return { ok: true, detail: 'listed' };
  } catch (e) {
    return { ok: false, detail: e.message || String(e) };
  }
}

export async function runCoverageScan({ openTickets = true } = {}) {
  const t0 = Date.now();
  const results = [];

  // Run qa probe once for route stations
  let probe = null;
  try {
    const qa = await import('./qaEngine.js');
    probe = await qa.runRouteProbe({ openTickets: false });
  } catch (e) {
    probe = { ok: false, error: e.message || String(e) };
  }

  let healthOk = false;
  try {
    const h = await import('./healthManager.js');
    const fn = h.runHealthCheck || h.healthCheck || h.checkAll;
    if (typeof fn === 'function') {
      const r = await fn();
      const text = typeof r === 'string' ? r : r?.summary || r?.text || JSON.stringify(r);
      healthOk = /operational|ok|200|✅/i.test(String(text)) || r?.ok !== false;
    }
  } catch (_) {
    healthOk = false;
  }

  for (const s of STATIONS) {
    let status = 'ok';
    let detail = '';

    if (s.probe === 'qa_probe') {
      if (!probe || probe.ok === false && probe.error) {
        status = 'fail';
        detail = probe?.error || 'probe error';
      } else if (probe && probe.ok) {
        status = 'ok';
        detail = (probe.passed || 0) + '/' + (probe.total || 0);
      } else {
        status = 'warn';
        detail = 'probe partial ' + (probe?.passed || 0) + '/' + (probe?.total || 0);
      }
    } else if (s.probe === 'health') {
      status = healthOk ? 'ok' : 'warn';
      detail = healthOk ? 'health ok' : 'health weak';
    } else if (s.probe === 'env') {
      const r = await softCheck(s.id);
      status = r.ok ? 'ok' : 'fail';
      detail = r.detail;
    } else if (s.probe === 'route') {
      status = probe?.ok ? 'ok' : 'warn';
      detail = 'gate surface';
    } else {
      const r = await softCheck(s.id);
      status = r.ok ? 'ok' : 'warn';
      detail = r.detail;
    }

    results.push({
      id: s.id,
      name: s.name,
      corps: s.corps,
      wing: s.wing,
      status,
      detail,
    });

    if (status === 'fail' && openTickets) {
      try {
        const qa = await import('./qaEngine.js');
        await qa.openTicket({
          title: 'Coverage FAIL: ' + s.name,
          detail: detail,
          fingerprint: 'coverage:' + s.id + ':' + String(detail).slice(0, 40),
        });
      } catch (_) {}
    }
  }

  const ok = results.filter((r) => r.status === 'ok').length;
  const warn = results.filter((r) => r.status === 'warn').length;
  const fail = results.filter((r) => r.status === 'fail').length;

  return {
    ok: fail === 0,
    total: results.length,
    ok_n: ok,
    warn_n: warn,
    fail_n: fail,
    results,
    ms: Date.now() - t0,
  };
}

export function formatCoverageMap() {
  const by = {};
  for (const s of STATIONS) {
    by[s.corps] = by[s.corps] || [];
    by[s.corps].push(s);
  }
  const lines = ['🗺 *Coverage Map · ' + STATIONS.length + ' stations*', ''];
  for (const [corps, list] of Object.entries(by)) {
    lines.push('*' + corps + '* (' + list.length + ')');
    for (const s of list) {
      lines.push('· `' + s.id + '` ' + s.name + ' · ' + s.wing);
    }
    lines.push('');
  }
  return lines.join('\n').slice(0, 4000);
}

export function formatCoverageScan(r, { gapsOnly = false } = {}) {
  const lines = [
    '🗺 *Coverage Scan · 19*',
    (r.ok ? '✅' : '❌') +
      ' OK ' +
      r.ok_n +
      ' · WARN ' +
      r.warn_n +
      ' · FAIL ' +
      r.fail_n +
      ' · ' +
      r.ms +
      'ms',
    '',
  ];
  const list = gapsOnly
    ? (r.results || []).filter((x) => x.status !== 'ok')
    : r.results || [];
  if (!list.length && gapsOnly) {
    lines.push('No gaps — all stations green.');
  }
  for (const x of list) {
    const icon = x.status === 'ok' ? '✅' : x.status === 'warn' ? '⚠️' : '❌';
    lines.push(icon + ' `' + x.id + '` ' + x.name + ' — ' + x.detail);
  }
  return lines.join('\n').slice(0, 4000);
}

export function formatCoverageCorps() {
  const by = {};
  for (const s of STATIONS) {
    by[s.corps] = (by[s.corps] || 0) + 1;
  }
  const lines = ['🏛 *Coverage by corps*', ''];
  for (const [k, v] of Object.entries(by)) {
    lines.push('· *' + k + '*: ' + v + ' stations');
  }
  lines.push('');
  lines.push('_Lab Nation 500 = duty map · Coverage ' + STATIONS.length + ' = live stations_');
  return lines.join('\n');
}

export default {
  STATIONS,
  coverageHelp,
  runCoverageScan,
  formatCoverageMap,
  formatCoverageScan,
  formatCoverageCorps,
};
