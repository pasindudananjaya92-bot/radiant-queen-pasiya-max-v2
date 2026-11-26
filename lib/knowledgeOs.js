/** Knowledge OS · 37-S5 · search vault/mem/doc soft */
const VERSION = '37-S5';

async function safeImport(p) {
  try {
    return await import(p);
  } catch (_) {
    return null;
  }
}

async function safeCall(fn, fb) {
  try {
    if (typeof fn !== 'function') return fb;
    return await fn();
  } catch (_) {
    return fb;
  }
}

export async function knowledgeSearch(q) {
  const started = Date.now();
  const query = String(q || '').trim();
  if (!query) return 'Usage: `know <question>` or `knowledge search | <q>`';

  const hits = [];

  const mem = await safeImport('./memoryManager.js');
  if (mem) {
    const fn = mem.searchMemories || mem.search || mem.memSearch || mem.listMemories;
    if (typeof fn === 'function') {
      const r = await safeCall(() => fn(query), null);
      const arr = Array.isArray(r) ? r : r?.items || r?.rows || [];
      for (const x of arr.slice(0, 3)) {
        hits.push({
          src: 'mem',
          text: String(x.content || x.text || x.value || x.memory || JSON.stringify(x)).slice(0, 180),
        });
      }
    }
  }

  const doc = await safeImport('./docManager.js');
  if (doc) {
    const fn = doc.ask || doc.docAsk || doc.search;
    if (typeof fn === 'function') {
      const r = await safeCall(() => fn(query), null);
      if (r && (r.answer || r.text)) {
        hits.push({ src: 'doc', text: String(r.answer || r.text).slice(0, 180) });
      }
    }
  }

  const vault = await safeImport('./vaultManager.js');
  if (vault) {
    const fn = vault.list || vault.listFiles || vault.search;
    if (typeof fn === 'function') {
      const r = await safeCall(() => fn(query), null);
      const arr = Array.isArray(r) ? r : r?.files || r?.items || [];
      for (const f of arr.slice(0, 2)) {
        hits.push({
          src: 'vault',
          text: String(f.name || f.path || f).slice(0, 80),
        });
      }
    }
  }

  if (!hits.length) {
    return [
      '🧠 *Knowledge OS · ' + VERSION + '*',
      'Query: ' + query,
      '',
      'No citations found in mem/doc/vault.',
      'Try: `mem list` · `doc ask ...` · `vault list`',
      '_' + (Date.now() - started) + 'ms_',
    ].join('\n');
  }

  return [
    '🧠 *Knowledge OS · ' + VERSION + '*',
    'Query: ' + query,
    '',
    '*Citations*',
    ...hits.map((h, i) => i + 1 + '. (' + h.src + ') ' + h.text),
    '',
    '_Grounded in your data only · no web invent._',
    '_' + (Date.now() - started) + 'ms_',
  ].join('\n');
}

export function helpText() {
  return [
    '🧠 *Knowledge OS · ' + VERSION + '*',
    '',
    '• `know help` / `knowledge help`',
    '• `know <question>`',
    '• `knowledge search | <question>`',
    '',
    'Searches Memory · Doc · Vault (soft).',
  ].join('\n');
}

export default { VERSION, knowledgeSearch, helpText };
