const VERSION = '37-S5.1';

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
  if (!query) return 'Usage: `know <question>`';

  const hits = [];

  const brain = await safeImport('./brainManager.js');
  if (brain && typeof brain.recall === 'function') {
    const row = await safeCall(() => brain.recall(query), null);
    if (row) {
      const secret = row.sensitivity === 'secret';
      hits.push({
        src: 'brain',
        text:
          (row.key_display || row.key || '') +
          ' → ' +
          (secret ? '***' : String(row.value || '').slice(0, 160)),
      });
    }
  }

  const mem = await safeImport('./memoryManager.js');
  if (mem) {
    const fn = mem.searchMemories || mem.search || mem.memSearch;
    if (typeof fn === 'function') {
      const r = await safeCall(() => fn(query), null);
      const arr = Array.isArray(r) ? r : r?.items || [];
      for (const x of arr.slice(0, 3)) {
        hits.push({
          src: 'mem',
          text: String(x.content || x.text || x.value || '').slice(0, 160),
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
        hits.push({ src: 'doc', text: String(r.answer || r.text).slice(0, 160) });
      }
    }
  }

  if (!hits.length) {
    return [
      '🧠 *Knowledge OS · ' + VERSION + '*',
      'Query: ' + query,
      '',
      'No citations. Try `remember …` or `graph add person | …`',
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
    '_' + (Date.now() - started) + 'ms_',
  ].join('\n');
}

export function helpText() {
  return [
    '🧠 *Knowledge OS · ' + VERSION + '*',
    '• `know <question>`',
    '• `knowledge help`',
    'Uses Second Brain · mem · doc',
  ].join('\n');
}

export default { VERSION, knowledgeSearch, helpText };
