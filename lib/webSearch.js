// lib/webSearch.js — Search Fallback Army (Tavily → Exa → Brave → Jina)
// Used by toolRegistry web_search. Missing keys = skip that engine.

async function tavilySearch(query, max = 5) {
  const key = process.env.TAVILY_API_KEY || '';
  if (!key) return null;
  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: key,
      query: String(query).slice(0, 400),
      search_depth: 'basic',
      max_results: max,
      include_answer: true,
    }),
    signal: AbortSignal.timeout(10000),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j?.detail || j?.error || 'Tavily ' + res.status);
  const hits = (j.results || []).map((r) => ({
    title: r.title,
    url: r.url,
    snippet: r.content || r.snippet || '',
  }));
  return {
    provider: 'tavily',
    answer: j.answer || '',
    hits,
  };
}

async function exaSearch(query, max = 5) {
  const key = process.env.EXA_API_KEY || '';
  if (!key) return null;
  const res = await fetch('https://api.exa.ai/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
    },
    body: JSON.stringify({
      query: String(query).slice(0, 400),
      num_results: max,
      contents: { text: { max_characters: 400 } },
    }),
    signal: AbortSignal.timeout(10000),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j?.error || 'Exa ' + res.status);
  const hits = (j.results || []).map((r) => ({
    title: r.title,
    url: r.url,
    snippet: r.text || r.snippet || '',
  }));
  return { provider: 'exa', answer: '', hits };
}

async function braveSearch(query, max = 5) {
  const key = process.env.BRAVE_API_KEY || process.env.BRAVE_SEARCH_API_KEY || '';
  if (!key) return null;
  const url =
    'https://api.search.brave.com/res/v1/web/search?q=' +
    encodeURIComponent(String(query).slice(0, 400)) +
    '&count=' +
    max;
  const res = await fetch(url, {
    headers: { Accept: 'application/json', 'X-Subscription-Token': key },
    signal: AbortSignal.timeout(10000),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j?.message || 'Brave ' + res.status);
  const hits = (j.web?.results || []).map((r) => ({
    title: r.title,
    url: r.url,
    snippet: r.description || '',
  }));
  return { provider: 'brave', answer: '', hits };
}

async function jinaSearch(query) {
  // Free-ish reader endpoint for a single constructed search page is limited;
  // use r.jina.ai on a duckduckgo html URL as last resort text extract.
  const q = encodeURIComponent(String(query).slice(0, 200));
  const target = 'https://r.jina.ai/https://duckduckgo.com/html/?q=' + q;
  const res = await fetch(target, {
    headers: { Accept: 'text/plain' },
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) throw new Error('Jina ' + res.status);
  const text = (await res.text()).slice(0, 3000);
  if (!text || text.length < 40) return null;
  return {
    provider: 'jina',
    answer: '',
    hits: [{ title: 'Web extract', url: target, snippet: text.slice(0, 800) }],
  };
}

/**
 * Run search fallback chain. Returns { ok, provider, hits, answer, tried }
 */
export async function searchWeb(query, { max = 5 } = {}) {
  const q = String(query || '').trim();
  if (!q) return { ok: false, error: 'empty query', tried: [] };

  const chain = [
    ['tavily', () => tavilySearch(q, max)],
    ['exa', () => exaSearch(q, max)],
    ['brave', () => braveSearch(q, max)],
    ['jina', () => jinaSearch(q)],
  ];

  const tried = [];
  for (const [name, fn] of chain) {
    try {
      const r = await fn();
      if (r == null) {
        tried.push({ engine: name, status: 'skip_no_key' });
        continue;
      }
      if (r.hits?.length || r.answer) {
        tried.push({ engine: name, status: 'ok', hits: r.hits?.length || 0 });
        return {
          ok: true,
          provider: r.provider || name,
          hits: r.hits || [],
          answer: r.answer || '',
          tried,
        };
      }
      tried.push({ engine: name, status: 'empty' });
    } catch (e) {
      tried.push({ engine: name, status: 'error', error: e.message || String(e) });
    }
  }

  return { ok: false, error: 'All search engines failed or empty', tried, hits: [], answer: '' };
}

export function searchConfigured() {
  return Boolean(
    process.env.TAVILY_API_KEY ||
      process.env.EXA_API_KEY ||
      process.env.BRAVE_API_KEY ||
      process.env.BRAVE_SEARCH_API_KEY
  );
}

export default { searchWeb, searchConfigured };
