/**
 * Queen Station · Wave 39A
 * Control room aggregate — REAL data only from existing modules.
 */
export const VERSION = '39A';

async function safeImport(p) {
  try {
    return await import(p);
  } catch (_) {
    return null;
  }
}

async function safe(fn, fb) {
  try {
    if (typeof fn !== 'function') return fb;
    return await fn();
  } catch (_) {
    return fb;
  }
}

export async function collectSnapshot() {
  const started = Date.now();
  const snap = {
    version: VERSION,
    health: null,
    healthLine: 'n/a',
    signals: null,
    leads: null,
    deploy: null,
    labProposals: null,
    bank: null,
    siteSections: null,
    modules: {},
    ms: 0,
  };

  const healthM = await safeImport('./healthManager.js');
  snap.modules.health = !!healthM;
  if (healthM && typeof healthM.runFullCheck === 'function') {
    const h = await safe(() => healthM.runFullCheck(), null);
    snap.health = h;
    if (h && typeof h === 'object') {
      const parts = [];
      for (const k of ['vercel', 'supabase', 'make', 'snap', 'cron', 'upstash']) {
        if (h[k] && h[k].ok === false) parts.push(k + ':DOWN');
        else if (h[k] && h[k].ok) parts.push(k + ':ok');
      }
      snap.healthLine = parts.length ? parts.join(' · ') : 'checked';
    }
  }

  const sig = await safeImport('./signalManager.js');
  snap.modules.signal = !!sig;
  if (sig && typeof sig.status === 'function') {
    snap.signals = await safe(() => sig.status(), null);
  }

  const leads = await safeImport('./leadsManager.js');
  snap.modules.leads = !!leads;
  if (leads && typeof leads.leadList === 'function') {
    const list = await safe(() => leads.leadList(8), null);
    if (list && list.ok) {
      snap.leads = {
        count: (list.rows || []).length,
        rows: (list.rows || []).slice(0, 5).map((r) => ({
          id: String(r.id || '').slice(0, 8),
          name: r.name,
          status: r.status,
          source: r.source || (String(r.note || '').includes('website') ? 'web' : 'tg'),
        })),
      };
    }
  }

  const dep = await safeImport('./deployGuardian.js');
  if (!dep) {
    const d2 = await safeImport('./deployGate.js');
    snap.modules.deploy = !!d2;
  } else snap.modules.deploy = true;

  const lab = await safeImport('./labEngine.js');
  snap.modules.lab = !!lab;
  if (lab && typeof lab.listProposals === 'function') {
    const props = await safe(() => lab.listProposals({ limit: 5 }), []);
    const arr = Array.isArray(props) ? props : props?.items || [];
    snap.labProposals = arr.length;
  }

  const bank = await safeImport('./bankManager.js');
  snap.modules.bank = !!bank;
  if (bank && (bank.summary || bank.getSummary)) {
    const fn = bank.summary || bank.getSummary;
    snap.bank = await safe(() => fn(), null);
  }

  const wm = await safeImport('./webMaster.js');
  snap.modules.webMaster = !!wm;
  if (wm && typeof wm.listSections === 'function') {
    const rows = await safe(() => wm.listSections(), []);
    snap.siteSections = Array.isArray(rows) ? rows.length : null;
  }

  snap.modules.station = true;
  snap.modules.funnel = !!(await safeImport('./webLeadEngine.js'));
  snap.ms = Date.now() - started;
  return snap;
}

export function formatStatus(snap) {
  const lines = [
    '🏛 *Queen Station · ' + VERSION + '*',
    'Control room · real modules only',
    '────────────────',
    '🩺 Health: ' + (snap.healthLine || 'n/a'),
  ];
  if (snap.signals && snap.signals.ok !== false) {
    const t = snap.signals.total ?? snap.signals.count ?? '?';
    const u = snap.signals.unseen ?? snap.signals.unseen_count ?? '?';
    lines.push('📡 Signals: total ' + t + ' · unseen ' + u);
  } else lines.push('📡 Signals: n/a');

  if (snap.leads) {
    lines.push('🧲 Leads (recent list): ' + snap.leads.count);
    for (const r of snap.leads.rows || []) {
      lines.push('  · ' + r.id + ' ' + (r.name || '?') + ' · ' + (r.status || '') + ' · ' + (r.source || ''));
    }
  } else lines.push('🧲 Leads: n/a');

  if (snap.bank && (snap.bank.formatted || snap.bank.total != null)) {
    lines.push('💰 Bank: ' + (snap.bank.formatted || snap.bank.total));
  }
  if (snap.siteSections != null) lines.push('🌐 Site sections: ' + snap.siteSections);
  if (snap.labProposals != null) lines.push('🧪 Lab proposals: ' + snap.labProposals);

  const mod = Object.entries(snap.modules || {})
    .filter(([, v]) => v)
    .map(([k]) => k);
  lines.push('────────────────');
  lines.push('🔌 Modules loaded: ' + (mod.join(', ') || '—'));
  lines.push('_' + snap.ms + 'ms · no auto money/code/publish_');
  return lines.join('\n');
}

export function formatPulse(snap) {
  return [
    '🏛 *Station Pulse · ' + VERSION + '*',
    '🩺 ' + (snap.healthLine || 'n/a'),
    snap.leads ? '🧲 Leads listed: ' + snap.leads.count : '🧲 Leads: n/a',
    snap.signals && snap.signals.ok !== false
      ? '📡 Unseen: ' + (snap.signals.unseen ?? '?')
      : '📡 Signals: n/a',
    snap.siteSections != null ? '🌐 Sections: ' + snap.siteSections : '',
    '_' + snap.ms + 'ms_',
  ]
    .filter(Boolean)
    .join('\n');
}

export async function buildBriefForAI() {
  const snap = await collectSnapshot();
  const lines = [
    '=== LIVE STATION BRIEF (fact snapshot — ' + new Date().toISOString() + ') ===',
    'Health: ' + (snap.healthLine || 'n/a'),
    'Leads listed: ' + (snap.leads ? snap.leads.count : 'n/a'),
    'Signals: ' +
      (snap.signals && snap.signals.ok !== false
        ? 'total ' + (snap.signals.total ?? '?') + ' unseen ' + (snap.signals.unseen ?? '?')
        : 'n/a'),
    'Site sections: ' + (snap.siteSections != null ? snap.siteSections : 'n/a'),
    'Lab proposals: ' + (snap.labProposals != null ? snap.labProposals : 'n/a'),
    'Modules: ' +
      Object.entries(snap.modules)
        .filter(([, v]) => v)
        .map(([k]) => k)
        .join(', '),
    'Wave: Station ' + VERSION + ' + Funnel 38A sealed + Business OS 1–9',
  ];
  return lines.join('\n');
}

export function helpText() {
  return [
    '🏛 *Queen Station · ' + VERSION + '*',
    'Control room for the agent world (read-only aggregate)',
    '',
    '• `station help` — this menu',
    '• `station status` — full board',
    '• `station pulse` — short pulse',
    '• `station brief` — AI-oriented fact brief',
    '• `station home` — what Station is',
    '',
    'Also: `coo` · `queen pulse` · `funnel status` · `health`',
    'PWA: /station.html (when deployed on Vercel)',
    '_Truthful data only. No auto money/code/publish._',
  ].join('\n');
}

export function homeText() {
  return [
    '🏛 *Queen Station*',
    'This is the control room for Radiant Queen OS.',
    '',
    'Public funnel (InfinityFree) brings leads.',
    'Station (Vercel + Telegram) runs health, agents, drafts, and reports.',
    '',
    'Agents do not invent metrics. They read modules + Supabase.',
    'You approve money, git push, and public publish.',
    '',
    'Try: `station status`',
  ].join('\n');
}

export default {
  VERSION,
  collectSnapshot,
  formatStatus,
  formatPulse,
  buildBriefForAI,
  helpText,
  homeText,
};
