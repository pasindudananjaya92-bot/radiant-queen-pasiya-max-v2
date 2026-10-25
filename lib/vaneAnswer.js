/**
 * v4000 C2 — Cited answers + 24h cache
 */
import { vaneSearch, formatSources } from './vaneSearch.js';
import { getCachedAnswer, setCachedAnswer } from './searchCache.js';

async function powerChatSafe(prompt, opts) {
  try {
    const mod = await import('./powerhouse.js');
    const fn = mod.powerChat || mod.default?.powerChat;
    if (!fn) return { ok: false, error: 'powerChat missing' };
    return await fn(prompt, opts || {});
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

export async function askWithCitations(question, opts = {}) {
  const focus = opts.focus || 'web';
  const skipCache = opts.nocache === true;

  if (!skipCache) {
    try {
      const hit = await getCachedAnswer(focus, question);
      if (hit && hit.answer) {
        return {
          ok: true,
          engine: hit.engine || 'cache',
          llm: 'cache',
          text:
            hit.answer.trim() +
            '\n\n——\n📦 cache · focus=' +
            focus +
            ' · saved ' +
            (hit.created_at || '').slice(0, 19),
          cached: true,
          results: [],
        };
      }
    } catch (_) {}
  }

  const search = await vaneSearch(question, { focus, max: opts.max || 5 });
  if (!search.ok || !search.results.length) {
    return {
      ok: false,
      error: search.error || 'No results',
      tried: search.tried || [],
      text: '',
    };
  }

  const sourcesBlock = formatSources(search.results);
  const sys =
    'You are PasiyaOS Research. Answer ONLY using the numbered sources. ' +
    'Every factual claim needs a citation [n]. ' +
    'If sources are weak, say so. Concise. ' +
    'Sinhala if the question is Sinhala, else English. ' +
    'End with Sources: [n] title — url';

  const r = await powerChatSafe(
    'QUESTION:\n' +
      question +
      '\n\nSOURCES:\n' +
      sourcesBlock +
      '\n\nWrite the answer with inline [n] citations.',
    { system: sys, maxTokens: 1200, temperature: 0.2 }
  );

  if (!r.ok) {
    return {
      ok: true,
      engine: search.engine,
      llm: 'none',
      text:
        '🔍 Search OK (' +
        search.engine +
        ') but LLM failed: ' +
        (r.error || '') +
        '\n\n' +
        sourcesBlock.slice(0, 3500),
      results: search.results,
      tried: search.tried,
    };
  }

  const body = String(r.text || '').trim();
  const footer =
    '\n\n——\n📡 ' +
    (search.engine || '') +
    ' · focus=' +
    focus +
    ' · llm=' +
    (r.engine || '');

  try {
    await setCachedAnswer(focus, question, body, search.engine + '+' + (r.engine || ''));
  } catch (_) {}

  return {
    ok: true,
    engine: search.engine,
    llm: r.engine,
    text: body + footer,
    results: search.results,
    tried: search.tried,
    cached: false,
  };
}

export async function handleAskCommand(text) {
  const raw = String(text || '').trim();
  let focus = 'web';
  let q = '';
  let nocache = false;

  const m1 = raw.match(
    /^\/(askweb|vane|webask|askreddit|askscholar|askacademic|askyt|askyoutube|asknews)(?:@\w+)?(?:\s+([\s\S]+))?$/i
  );
  if (m1) {
    const mode = String(m1[1] || 'askweb').toLowerCase();
    q = (m1[2] || '').trim();
    if (mode === 'askreddit') focus = 'reddit';
    else if (mode === 'askscholar' || mode === 'askacademic') focus = 'academic';
    else if (mode === 'askyt' || mode === 'askyoutube') focus = 'youtube';
    else if (mode === 'asknews') focus = 'news';
    else focus = 'web';
  }

  if (/^--fresh\b/i.test(q)) {
    nocache = true;
    q = q.replace(/^--fresh\s*/i, '').trim();
  }

  if (!q || q === 'help') {
    return (
      '🔎 VANE SEARCH · v4000 C2\n\n' +
      '/askweb <q> · /vane <q>\n' +
      '/askreddit · /askscholar · /askyt · /asknews\n' +
      '/askweb --fresh <q>  (skip cache)\n\n' +
      'Cache: 24h in Supabase (rq_ask_cache)\n' +
      'Docs: send PDF with caption /docadd\n' +
      'Then: /docask <question>'
    );
  }

  const out = await askWithCitations(q, { focus, nocache });
  if (!out.ok) {
    return (
      '❌ Search failed: ' +
      (out.error || '') +
      '\nTried: ' +
      (out.tried || []).join(' | ')
    );
  }
  return out.text.slice(0, 4000);
}

export default { askWithCitations, handleAskCommand };
