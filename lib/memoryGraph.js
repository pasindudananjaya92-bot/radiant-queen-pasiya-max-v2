/**
 * Founder Memory Graph · 37-S5.1
 * Uses second_brain (no new SQL). Keys: graph:person|project|link:...
 */
const VERSION = '37-S5.1';

async function safeImport(p) {
  try {
    return await import(p);
  } catch (_) {
    return null;
  }
}

function norm(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

export async function graphAdd(kind, name, note) {
  const brain = await safeImport('./brainManager.js');
  if (!brain || typeof brain.remember !== 'function') {
    return { ok: false, error: 'brainManager.remember n/a' };
  }
  const k = ['person', 'project', 'link', 'note'].includes(String(kind).toLowerCase())
    ? String(kind).toLowerCase()
    : 'note';
  const n = String(name || '').trim();
  if (!n) return { ok: false, error: 'name required' };
  const key_display = 'graph:' + k + ':' + n;
  const value = String(note || n).slice(0, 2000);
  try {
    const data = await brain.remember({
      key_display,
      value,
      source: 'memory_graph',
    });
    return { ok: true, key_display, data };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

export async function graphList(kind) {
  const brain = await safeImport('./brainManager.js');
  if (!brain || typeof brain.listBrain !== 'function') {
    return { ok: false, error: 'listBrain n/a', rows: [] };
  }
  try {
    const all = await brain.listBrain(50);
    const prefix = kind ? 'graph:' + String(kind).toLowerCase() + ':' : 'graph:';
    const rows = (all || []).filter((r) => String(r.key_display || r.key || '').startsWith(prefix));
    return { ok: true, rows };
  } catch (e) {
    return { ok: false, error: e.message || String(e), rows: [] };
  }
}

export async function graphAsk(query) {
  const brain = await safeImport('./brainManager.js');
  if (!brain) return { ok: false, error: 'brain n/a' };
  const q = String(query || '').trim();
  if (!q) return { ok: false, error: 'empty query' };

  const hits = [];
  if (typeof brain.recall === 'function') {
    try {
      const row = await brain.recall(q);
      if (row) hits.push({ src: 'brain', row });
    } catch (_) {}
  }
  if (typeof brain.listBrain === 'function') {
    try {
      const all = await brain.listBrain(40);
      const nq = norm(q);
      for (const r of all || []) {
        const blob = norm((r.key_display || '') + ' ' + (r.value || '') + ' ' + (r.key || ''));
        if (nq && blob.includes(nq)) hits.push({ src: 'scan', row: r });
      }
    } catch (_) {}
  }

  // dedupe by id/key
  const seen = new Set();
  const uniq = [];
  for (const h of hits) {
    const id = h.row.id || h.row.key || h.row.key_display;
    if (seen.has(id)) continue;
    seen.add(id);
    uniq.push(h);
  }
  return { ok: true, hits: uniq.slice(0, 8) };
}

export function formatList(rows) {
  if (!rows.length) return '🗂 Graph empty. Try: `graph add person | Acme | warm lead`';
  return rows
    .slice(0, 15)
    .map((r, i) => {
      const kd = r.key_display || r.key || '';
      const secret = r.sensitivity === 'secret' || /password|secret/i.test(kd);
      const val = secret ? '***' : String(r.value || '').slice(0, 80);
      return i + 1 + '. ' + kd + ' → ' + val;
    })
    .join('\n');
}

export function formatAsk(result, query) {
  if (!result.ok) return '❌ Graph: ' + (result.error || 'fail');
  if (!result.hits.length) {
    return [
      '🗂 *Memory Graph · ' + VERSION + '*',
      'Query: ' + query,
      '',
      'No nodes matched.',
      'Add: `graph add person | Name | note`',
    ].join('\n');
  }
  const lines = result.hits.map((h, i) => {
    const r = h.row;
    const secret = r.sensitivity === 'secret';
    return (
      i +
      1 +
      '. (' +
      h.src +
      ') ' +
      (r.key_display || r.key) +
      ' → ' +
      (secret ? '***' : String(r.value || '').slice(0, 120))
    );
  });
  return [
    '🗂 *Memory Graph · ' + VERSION + '*',
    'Query: ' + query,
    '',
    ...lines,
    '',
    '_Second Brain backed · secrets masked._',
  ].join('\n');
}

export function helpText() {
  return [
    '🗂 *Memory Graph · ' + VERSION + '*',
    'People · projects · links (second_brain)',
    '',
    '• `graph help`',
    '• `graph add person | Name | note`',
    '• `graph add project | Queen OS | status`',
    '• `graph add link | Acme | related to proposal`',
    '• `graph list` · `graph list person`',
    '• `graph ask | wifi` / `graph <query>`',
    '',
    'Also: `remember key = value` · `what is my …`',
  ].join('\n');
}

export default { VERSION, graphAdd, graphList, graphAsk, formatList, formatAsk, helpText };
