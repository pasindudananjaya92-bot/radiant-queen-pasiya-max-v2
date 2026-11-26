const VERSION = '37-S5.1';

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
      lines.push(down.length === 0 ? '🩺 Health: GREEN' : '🩺 Health: 🟡 ' + down.join(', '));
      if (down.length) actions.push('Run `health` + `omni heal` if needed');
    } else lines.push('🩺 Health: module present');
  } else lines.push('🩺 Health: module n/a');

  const sigM = await safeImport('./signalManager.js');
  if (sigM) {
    if (typeof sigM.status === 'function') {
      const st = await safeCall(() => sigM.status(), null);
      if (st && st.ok !== false) {
        const total = st.total != null ? st.total : st.count;
        const unseen = st.unseen != null ? st.unseen : st.unseen_count;
        lines.push('📡 Signals: total ' + (total ?? '?') + ' · unseen ' + (unseen ?? '?'));
        if (unseen > 0) actions.push('Review: `signal unseen` (' + unseen + ' unread)');
      } else {
        const ls = await safeCall(() => sigM.listSignals({ limit: 20 }), null);
        if (ls && ls.ok) {
          const rows = ls.rows || [];
          const un = rows.filter((r) => !r.seen).length;
          lines.push('📡 Signals: listed ' + rows.length + ' · unseen ~' + un);
          if (un > 0) actions.push('`signal list` · `signal read`');
        } else lines.push('📡 Signals: desk offline');
      }
    } else if (typeof sigM.listSignals === 'function') {
      const ls = await safeCall(() => sigM.listSignals({ limit: 20 }), null);
      if (ls && ls.ok) {
        const rows = ls.rows || [];
        const un = rows.filter((r) => !r.seen).length;
        lines.push('📡 Signals: listed ' + rows.length + ' · unseen ~' + un);
      } else lines.push('📡 Signals: n/a');
    } else lines.push('📡 Signals: n/a');
  } else lines.push('📡 Signals: n/a');

  const recM = (await safeImport('./receptionistManager.js')) || (await safeImport('./inboxManager.js'));
  if (recM) {
    const listFn = recM.listInbox || recM.list || recM.getInbox;
    if (typeof listFn === 'function') {
      const list = await safeCall(() => listFn({ limit: 20 }), []);
      const arr = Array.isArray(list) ? list : list?.items || list?.rows || [];
      lines.push('🛎️ Inbox: ' + arr.length + ' listed');
      if (arr.length) actions.push('`inbox list` → `desk reply <id>`');
    } else lines.push('🛎️ Inbox: manager loaded');
  } else lines.push('🛎️ Inbox: empty / n/a');

  const leadM = (await safeImport('./leadsManager.js')) || (await safeImport('./leadManager.js'));
  if (leadM) {
    const listFn = leadM.listLeads || leadM.list || leadM.getLeads;
    if (typeof listFn === 'function') {
      const list = await safeCall(() => listFn({ limit: 30 }), []);
      const arr = Array.isArray(list) ? list : list?.items || [];
      const warm = arr.filter((x) => String(x.status || '').toLowerCase() === 'warm').length;
      lines.push('🧲 Leads: ' + arr.length + ' · warm ' + warm);
      if (warm) actions.push('`lead list` · follow warm');
    } else lines.push('🧲 Leads: manager loaded');
  } else lines.push('🧲 Leads: n/a');

  const bankM = (await safeImport('./bankManager.js')) || (await safeImport('./empireEngine.js'));
  if (bankM) {
    const sumFn = bankM.summary || bankM.getSummary || bankM.bankSummary;
    if (typeof sumFn === 'function') {
      const s = await safeCall(() => sumFn(), null);
      if (s && (s.formatted || s.total != null)) {
        lines.push('💰 Bank: ' + (s.formatted || s.total));
      } else lines.push('💰 Bank: see `empire bank`');
    } else lines.push('💰 Budget: `empire status`');
  } else lines.push('💰 Bank: n/a');

  lines.push('🛡 Deploy: `deploy gate` · Hobby batch ZIP');

  const labM = await safeImport('./labEngine.js');
  if (labM && typeof labM.listProposals === 'function') {
    const props = await safeCall(() => labM.listProposals({ limit: 5 }), []);
    const arr = Array.isArray(props) ? props : props?.items || [];
    lines.push('🧪 Lab proposals: ' + arr.length);
    if (arr.length) actions.push('`lab proposals` · `lab implement <id>`');
  }

  if (!actions.length) {
    actions.push('System quiet — `publish pack` or `site audit`');
    actions.push('GODMODEAUTO=OFF · drafts only');
  }

  const top = actions.slice(0, 3);
  return {
    ok: true,
    text: [
      '👑 *COO Board · ' + VERSION + '*',
      '📅 ' + new Date().toISOString().slice(0, 10),
      '────────────────',
      ...lines,
      '────────────────',
      '*Top 3 today*',
      ...top.map((a, i) => i + 1 + '. ' + a),
      '',
      '_Read-only · no auto money/code/publish._',
      '_' + (Date.now() - started) + 'ms_',
    ].join('\n'),
    ms: Date.now() - started,
  };
}

export function helpText() {
  return [
    '👑 *COO Mode · ' + VERSION + '*',
    '• `coo` / `coo board` — today board',
    '• `coo help`',
    '_No auto-actions._',
  ].join('\n');
}

export default { VERSION, buildBoard, helpText };
