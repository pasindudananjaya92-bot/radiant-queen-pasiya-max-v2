/**
 * Wave 42A — Ultimate Business Pack helpers
 * Knowledge hard search · Founder alert draft · Blueprint→Proposal
 * GODMODEAUTO OFF · draft-only
 */
export const VERSION = '42A';

async function safeImport(p) {
  try {
    return await import(p);
  } catch (_) {
    return null;
  }
}

async function sb() {
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
    if (!url || !key) return null;
    return createClient(url, key);
  } catch (_) {
    return null;
  }
}

/** Hard knowledge search — Second Brain / mem / vault / knowledgeOs. No LLM. */
export async function hardKnowledgeSearch(query) {
  const q = String(query || '').trim();
  if (!q) {
    return 'Usage: know <question> · search knowledge <q>\n_Hard search only — no invented answers._';
  }

  const hits = [];
  const sources = [];

  // knowledgeOs
  const kos = await safeImport('./knowledgeOs.js');
  if (kos && typeof kos.knowledgeSearch === 'function') {
    try {
      const r = await kos.knowledgeSearch(q);
      if (r && String(r).trim()) {
        sources.push('knowledgeOs');
        hits.push({ src: 'knowledgeOs', text: String(r).slice(0, 900) });
      }
    } catch (_) {}
  }

  // memory / neural
  for (const modName of ['./memoryManager.js', './neuralMemory.js', './memManager.js']) {
    const mem = await safeImport(modName);
    if (!mem) continue;
    const fn =
      mem.searchMemories || mem.search || mem.memSearch || mem.searchMemory || mem.listMemories;
    if (typeof fn !== 'function') continue;
    try {
      const r = await fn(q);
      const arr = Array.isArray(r) ? r : r?.items || r?.rows || [];
      for (const x of arr.slice(0, 4)) {
        hits.push({
          src: 'mem',
          text: String(x.content || x.text || x.value || x.memory || JSON.stringify(x)).slice(
            0,
            220
          ),
        });
      }
      if (arr.length) sources.push('mem');
    } catch (_) {}
  }

  // vault soft
  const vault = await safeImport('./vaultManager.js');
  if (vault) {
    const fn = vault.search || vault.list || vault.listFiles;
    if (typeof fn === 'function') {
      try {
        const r = await fn(q);
        const arr = Array.isArray(r) ? r : r?.files || r?.items || [];
        for (const f of arr.slice(0, 2)) {
          hits.push({
            src: 'vault',
            text: String(f.name || f.path || f.title || JSON.stringify(f)).slice(0, 180),
          });
        }
        if (arr.length) sources.push('vault');
      } catch (_) {}
    }
  }

  // blueprints titles as knowledge
  try {
    const bp = await safeImport('./blueprintVault.js');
    if (bp && typeof bp.listBlueprints === 'function') {
      const list = await bp.listBlueprints({ limit: 20 });
      const ql = q.toLowerCase();
      for (const row of list.items || []) {
        const blob = (row.title + ' ' + (row.goal || '')).toLowerCase();
        if (blob.includes(ql) || ql.split(/\s+/).some((w) => w.length > 2 && blob.includes(w))) {
          hits.push({
            src: 'blueprint',
            text: (row.id || '') + ' · ' + (row.title || '') + ' · ' + String(row.goal || '').slice(0, 120),
          });
        }
      }
      if ((list.items || []).length) sources.push('blueprint');
    }
  } catch (_) {}

  if (!hits.length) {
    return [
      'Knowledge hard search · ' + VERSION,
      'Query: ' + q,
      '',
      'No indexed hits in Second Brain / mem / vault / blueprints.',
      'Sources tried: knowledgeOs, mem, vault, blueprint',
      '',
      '_No LLM fill-in. Add notes via mem/vault, or create blueprints._',
    ].join('\n');
  }

  const lines = [
    'Knowledge hard search · ' + VERSION,
    'Query: ' + q,
    'Hits: ' + hits.length + (sources.length ? ' · ' + sources.join('+') : ''),
    '',
  ];
  hits.slice(0, 8).forEach((h, i) => {
    lines.push((i + 1) + '. [' + h.src + '] ' + h.text);
  });
  lines.push('', '_Hard data only · no hallucinated answer · GODMODEAUTO OFF_');
  return lines.join('\n');
}

/** Founder-only draft alert → signals table / signalManager if present */
export async function queueFounderAlert({ message, priority, userId }) {
  const text = String(message || '').trim().slice(0, 1500);
  const pri = ['low', 'normal', 'high'].includes(priority) ? priority : 'normal';
  if (!text) return 'Usage: send alert <message>\n_Draft only for Founder._';

  const id = 'al_' + Date.now().toString(36);
  let persisted = false;
  let channel = 'local';

  // signalManager
  const sig = await safeImport('./signalManager.js');
  if (sig) {
    const fn = sig.create || sig.add || sig.push || sig.enqueue || sig.raise;
    if (typeof fn === 'function') {
      try {
        await fn({
          id,
          type: 'founder_alert',
          message: text,
          priority: pri,
          status: 'draft',
          source: 'wave42_alert',
          userId,
        });
        persisted = true;
        channel = 'signalManager';
      } catch (_) {}
    }
  }

  // Supabase soft table
  if (!persisted) {
    const client = await sb();
    if (client) {
      try {
        const { error } = await client.from('queen_alerts').insert({
          id,
          message: text,
          priority: pri,
          status: 'draft',
          user_id: userId ? String(userId) : null,
          created_at: new Date().toISOString(),
        });
        if (!error) {
          persisted = true;
          channel = 'queen_alerts';
        }
      } catch (_) {}
      // fallback: signals-like table
      if (!persisted) {
        try {
          const { error } = await client.from('signals').insert({
            id,
            title: 'Founder alert',
            body: text,
            priority: pri,
            status: 'draft',
            seen: false,
            source: 'wave42',
            created_at: new Date().toISOString(),
          });
          if (!error) {
            persisted = true;
            channel = 'signals';
          }
        } catch (_) {}
      }
    }
  }

  return [
    'Founder alert draft · ' + id,
    'Priority: ' + pri,
    'Message: ' + text.slice(0, 500),
    '',
    persisted
      ? 'Queued via ' + channel + ' (draft — review in signals/inbox)'
      : 'Not persisted (no signal table/manager) — copy kept as draft reply only',
    '',
    '_Not sent to customers · GODMODEAUTO OFF_',
  ].join('\n');
}

/** Blueprint → proposal outline (text pack, draft only) */
export async function proposalFromBlueprint(bpId) {
  const id = String(bpId || '').trim();
  if (!id) {
    return 'Usage: proposal from blueprint bp_xxx\n_Draft proposal outline only._';
  }

  const vault = await safeImport('./blueprintVault.js');
  if (!vault || typeof vault.getBlueprint !== 'function') {
    return 'Blueprint vault unavailable.';
  }
  const row = await vault.getBlueprint(id);
  if (!row) {
    return 'Blueprint not found: ' + id + '\nTry: blueprints';
  }

  const title = row.title || 'Untitled';
  const goal = row.goal || '';
  const notes = row.notes || '';

  // Optional proposalFactory enrichment
  let extra = '';
  const pf = await safeImport('./proposalFactory.js');
  if (pf && typeof pf.buildProposal === 'function') {
    try {
      extra = await pf.buildProposal({
        client: title,
        amount: 'Talk after scope',
        scope: goal.slice(0, 200) || title,
      });
    } catch (_) {}
  }

  const lines = [
    'Proposal Pack from Blueprint · ' + VERSION,
    'Source: `' + id + '`',
    '',
    'Client / Title: ' + title,
    'Investment: Talk after scope (no fake numbers)',
    'Scope / Goal:',
    String(goal).slice(0, 800) || '—',
    notes ? '\nNotes:\n' + String(notes).slice(0, 400) : '',
    '',
    'Outline',
    '1. Discovery — confirm mobile ops + constraints',
    '2. Build — Telegram + Vercel + Supabase path',
    '3. Harden — health, deploy gate, drafts-only money',
    '4. Handoff — Founder training + station use',
    '',
    'Next drafts (not sent):',
    '· deal create ' + title.slice(0, 40) + ' | Talk | ' + String(goal).slice(0, 60),
    '· send alert Review proposal for ' + title.slice(0, 40),
    '',
    '_Draft only · no Stripe · no auto client send · GODMODEAUTO OFF_',
  ];

  if (extra && String(extra).length > 40) {
    lines.push('', '--- Factory outline ---', String(extra).slice(0, 1200));
  }

  return lines.filter((x) => x !== null && x !== undefined).join('\n');
}

export function businessHelp() {
  return [
    'Business Pack · ' + VERSION,
    '',
    'Knowledge (hard search, no LLM invent):',
    '· know <q> · search knowledge <q>',
    '',
    'Founder alerts (draft only):',
    '· send alert <message>',
    '· alert high <message>',
    '',
    'Blueprint → Proposal:',
    '· proposal from blueprint bp_xxx',
    '',
    'Blueprints:',
    '· create blueprint <title> · blueprints · show blueprint bp_xxx',
    '',
    '_GODMODEAUTO OFF · no auto money/customer send_',
  ].join('\n');
}
