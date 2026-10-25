/**
 * v4000 C1 — Cite-aware answer from search results
 */
import { vaneSearch, formatSources } from './vaneSearch.js';

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

/**
 * Full pipeline: search → LLM answer with citations
 */
export async function askWithCitations(question, opts = {}) {
  const focus = opts.focus || 'web';
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
    'Every factual claim must have a citation like [1] or [2]. ' +
    'If sources are insufficient, say what is missing. ' +
    'Be concise. Prefer Sinhala if the user question is Sinhala, else English. ' +
    'End with a short Sources list: [n] title — url';

  const user =
    'QUESTION:\n' +
    question +
    '\n\nSOURCES:\n' +
    sourcesBlock +
    '\n\nWrite the answer with inline [n] citations.';

  const r = await powerChatSafe(user, {
    system: sys,
    maxTokens: 1200,
    temperature: 0.2,
  });

  if (!r.ok) {
    // Fallback: return raw sources if LLM fails
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

  const footer =
    '\n\n——\n📡 ' +
    (search.engine || '') +
    ' · focus=' +
    focus +
    ' · llm=' +
    (r.engine || '');

  return {
    ok: true,
    engine: search.engine,
    llm: r.engine,
    text: String(r.text || '').trim() + footer,
    results: search.results,
    tried: search.tried,
  };
}

export async function handleAskCommand(text) {
  const raw = String(text || '').trim();
  // /ask [mode] query  OR  /askreddit query
  let focus = 'web';
  let q = raw;

  const m1 = raw.match(
    /^\/ask(reddit|scholar|academic|yt|youtube|web)?(?:@\w+)?\s+([\s\S]+)/i
  );
  if (m1) {
    const mode = (m1[1] || 'web').toLowerCase();
    q = m1[2].trim();
    if (mode === 'reddit') focus = 'reddit';
    else if (mode === 'scholar' || mode === 'academic') focus = 'academic';
    else if (mode === 'yt' || mode === 'youtube') focus = 'youtube';
    else focus = 'web';
  } else {
    // bare after strip
    q = raw.replace(/^\/ask(?:@\w+)?\s*/i, '').trim();
  }

  if (!q || q === 'help') {
    return (
      '🔎 ASK · v4000 C1\n\n' +
      '/ask <question>\n' +
      '/askreddit <topic>\n' +
      '/askscholar <topic>\n' +
      '/askyt <topic>\n\n' +
      'Uses Tavily → Serper → DDG. Cites sources [1][2].\n' +
      'Env: TAVILY_API_KEY (recommended), SERPER_API_KEY (optional)'
    );
  }

  const out = await askWithCitations(q, { focus });
  if (!out.ok) {
    return (
      '❌ Search failed: ' +
      (out.error || '') +
      '\nTried: ' +
      (out.tried || []).join(' | ') +
      '\nSet TAVILY_API_KEY in Vercel env.'
    );
  }
  return out.text.slice(0, 4000);
}

export default { askWithCitations, handleAskCommand };
