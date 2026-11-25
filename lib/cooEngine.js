/**
 * Queen OS · COO Mode · Wave 37-S3.1 (ESM)
 */
const VERSION = '37-S3.1';

async function safeImport(path) {
  try {
    return await import(path);
  } catch (_) {
    return null;
  }
}

async function safeCall(fn, fallback) {
  try {
    if (typeof fn !== 'function') return fallback;
    const r = await fn();
    return r == null ? fallback : r;
  } catch (_) {
    return fallback;
  }
}

export async function buildBoard() {
  const started = Date.now();
  const lines = [];
  const actions = [];

  const healthM = await safeImport('./healthManager.js');
  if (healthM && typeof healthM.runFullCheck === 'function') {
    const h = await safeCall(() => healthM.runFullCheck(), null);
    if (h && typeof h === 'object') {
      const down = [];
      if (h.vercel && h.vercel.ok === false) down.push('Vercel');
      if (h.supabase && h.supabase.ok === false) down.push('Supabase');
      if (h.make && h.make.ok === false) down.push('Make');
      if (h.cron && h.cron.ok === false) down.push('cron');
      if (h.upstash && h.upstash.ok === false) down.push('Upstash');
      const healthOk = down.length === 0;
      lines.push(healthOk ? '🩺 Health: GREEN' : `🩺 Health: 🟡 ${down.join(', ')}`);
      if (!healthOk) actions.push('Run `health` + `omni heal` if needed');
    } else {
      lines.push('🩺 Health: module present');
    }
  } else {
    lines.push('🩺 Health: module n/a');
  }

  const sigM = await safeImport('./signalManager.js');
  if (sigM && typeof sigM.getStatus === 'function') {
    const st = await safeCall(() => sigM.getStatus(), null);
    if (st && st.ok) {
      const u = st.unseen || 0;
      lines.push(`📡 Signals: total ${st.total || 0} · unseen ${u}`);
      if (u > 0) actions.push(`Review: \`signal unseen\` (${u} unread)`);
    } else {
      lines.push('📡 Signals: desk offline / SQL?');
    }
  } else {
    lines.push('📡 Signals: n/a');
  }

  let recM = await safeImport('./receptionistManager.js');
  if (!recM) recM = await safeImport('./inboxManager.js');
  if (recM) {
    const listFn = recM.listInbox || recM.list || recM.getInbox;
    if (typeof listFn === 'function') {
      const list = await safeCall(() => listFn({ limit: 20 }), []);
      const arr = Array.isArray(list) ? list : list?.items || list?.rows || [];
      const unread = arr.filter((x) => !x.read && x.status !== 'read' && x.status !== 'archived').length;
      lines.push(`🛎️ Inbox: ${arr.length} listed` + (unread ? ` · ~${unread} open` : ''));
      if (arr.length > 0) actions.push('`inbox list` → `desk reply <id>` (draft only)');
    } else {
      lines.push('🛎️ Inbox: manager loaded');
    }
  } else {
    lines.push('🛎️ Inbox: empty / n/a');
  }

  let leadM = await safeImport('./leadsManager.js');
  if (!leadM) leadM = await safeImport('./leadManager.js');
  if (leadM) {
    const listFn = leadM.listLeads || leadM.list || leadM.getLeads;
    if (typeof listFn === 'function') {
      const list = await safeCall(() => listFn({ limit: 30 }), []);
      const arr = Array.isArray(list) ? list : list?.items || [];
      const warm = arr.filter((x) => String(x.status || '').toLowerCase() === 'warm').length;
      const newc = arr.filter((x) => String(x.status || '').toLowerCase() === 'new').length;
      lines.push(`🧲 Leads: ${arr.length} · new ${newc} · warm ${warm}`);
      if (warm || newc) actions.push('`lead list` · follow warm leads');
    } else {
      lines.push('🧲 Leads: manager loaded');
    }
  } else {
    lines.push('🧲 Leads: n/a');
  }

  let bankM = await safeImport('./bankManager.js');
  if (!bankM) bankM = await safeImport('./empireEngine.js');
  if (bankM) {
    const sumFn = bankM.summary || bankM.getSummary || bankM.bankSummary;
    if (typeof sumFn === 'function') {
      const s = await safeCall(() => sumFn(), null);
      if (s && (s.formatted || s.total != null)) {
        lines.push(`💰 Bank: ${s.formatted || s.total}` + (s.totalBaseFormatted ? ` · ${s.totalBaseFormatted}` : ''));
      } else {
        lines.push('💰 Bank: see `empire bank`');
      }
    } else {
      lines.push('💰 Budget: `empire status`');
    }
  } else {
    lines.push('💰 Bank: n/a');
  }

  lines.push('🛡 Deploy: `deploy check` · Hobby ~100/day');

  const labM = await safeImport('./labEngine.js');
  if (labM && typeof labM.listProposals === 'function') {
    const props = await safeCall(() => labM.listProposals({ limit: 5 }), []);
    const arr = Array.isArray(props) ? props : props?.items || [];
    lines.push(`🧪 Lab proposals: ${arr.length}`);
    if (arr.length) actions.push('`lab proposals` · `lab implement <id>`');
  }

  if (actions.length === 0) {
    actions.push('System quiet — optional: `content today` or `site audit`');
    actions.push('Keep FOUNDER gates on · GODMODEAUTO=OFF');
  }

  const top = actions.slice(0, 3);
  const text = [
    `👑 *COO Board · ${VERSION}*`,
    `📅 ${new Date().toISOString().slice(0, 10)}`,
    '────────────────',
    ...lines,
    '────────────────',
    '*Top 3 today*',
    ...top.map((a, i) => `${i + 1}. ${a}`),
    '',
    '_Read-only board · no auto money/code/publish._',
    `_${Date.now() - started}ms_`,
  ].join('\n');

  return { ok: true, text, actions: top, ms: Date.now() - started };
}

export function helpText() {
  return [
    `👑 *COO Mode · ${VERSION}*`,
    'Daily Command Board · aggregate only',
    '',
    '• `coo` / `coo board` / `coo today` — today\'s board',
    '• `coo help` — this menu',
    '',
    'Pulls: health · signals · inbox · leads · bank · deploy · lab',
    '_No auto-actions. Founder decides._',
  ].join('\n');
}

export default { VERSION, buildBoard, helpText };
