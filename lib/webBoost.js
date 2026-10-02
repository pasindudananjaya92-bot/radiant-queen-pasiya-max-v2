/**
 * lib/webBoost.js — Pack E
 * Free-first web search + page fetch, optional Firecrawl boost.
 *
 * Env (optional):
 *   FIRECRAWL_API_KEY  — https://firecrawl.dev free tier
 *   BRAVE_SEARCH_API_KEY — optional backup search
 */
const UA =
  'Mozilla/5.0 (compatible; RadiantQueenBot/4.0; +https://t.me/PasiyaMaxQueen_bot)';

function stripHtml(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

/** DuckDuckGo Instant Answer API (no key) */
export async function searchDuckDuckGo(query) {
  const q = String(query || '').trim();
  if (!q) return { ok: false, error: 'Empty query' };
  const url =
    'https://api.duckduckgo.com/?q=' +
    encodeURIComponent(q) +
    '&format=json&no_html=1&skip_disambig=1';
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) return { ok: false, error: 'DDG HTTP ' + res.status };
  const j = await res.json();
  const results = [];
  if (j.AbstractText) {
    results.push({
      title: j.Heading || q,
      snippet: j.AbstractText,
      url: j.AbstractURL || '',
      source: 'ddg-abstract',
    });
  }
  for (const t of j.RelatedTopics || []) {
    if (t.Text && t.FirstURL) {
      results.push({
        title: String(t.Text).split(' - ')[0].slice(0, 80),
        snippet: t.Text,
        url: t.FirstURL,
        source: 'ddg-related',
      });
    } else if (t.Topics) {
      for (const x of t.Topics.slice(0, 3)) {
        if (x.Text && x.FirstURL) {
          results.push({
            title: String(x.Text).split(' - ')[0].slice(0, 80),
            snippet: x.Text,
            url: x.FirstURL,
            source: 'ddg-related',
          });
        }
      }
    }
    if (results.length >= 8) break;
  }
  // Fallback: HTML lite search page
  if (!results.length) {
    try {
      const htmlRes = await fetch(
        'https://html.duckduckgo.com/html/?q=' + encodeURIComponent(q),
        { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15000) }
      );
      const html = await htmlRes.text();
      const re =
        /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?class="result__snippet"[^>]*>([\s\S]*?)<\/(?:a|td|div)/gi;
      let m;
      while ((m = re.exec(html)) && results.length < 6) {
        results.push({
          title: stripHtml(m[2]).slice(0, 100),
          snippet: stripHtml(m[3]).slice(0, 240),
          url: m[1],
          source: 'ddg-html',
        });
      }
    } catch (_) {}
  }
  return { ok: true, provider: 'duckduckgo', results: results.slice(0, 8), query: q };
}

/** Optional Brave Search */
export async function searchBrave(query) {
  const key = String(process.env.BRAVE_SEARCH_API_KEY || '').trim();
  if (!key) return { ok: false, error: 'no brave key' };
  const res = await fetch(
    'https://api.search.brave.com/res/v1/web/search?q=' + encodeURIComponent(query) + '&count=6',
    {
      headers: { 'X-Subscription-Token': key, Accept: 'application/json' },
      signal: AbortSignal.timeout(15000),
    }
  );
  if (!res.ok) return { ok: false, error: 'Brave HTTP ' + res.status };
  const j = await res.json();
  const results = (j.web?.results || []).map((r) => ({
    title: r.title,
    snippet: r.description || '',
    url: r.url,
    source: 'brave',
  }));
  return { ok: true, provider: 'brave', results, query };
}

/** Optional Firecrawl search */
export async function searchFirecrawl(query) {
  const key = String(process.env.FIRECRAWL_API_KEY || '').trim();
  if (!key) return { ok: false, error: 'no firecrawl key' };
  const res = await fetch('https://api.firecrawl.dev/v1/search', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + key,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, limit: 6 }),
    signal: AbortSignal.timeout(30000),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false, error: j?.error || j?.message || 'Firecrawl HTTP ' + res.status };
  }
  const data = j.data || j.results || [];
  const results = (Array.isArray(data) ? data : []).map((r) => ({
    title: r.title || r.metadata?.title || 'Result',
    snippet: r.description || r.markdown?.slice(0, 240) || r.content?.slice(0, 240) || '',
    url: r.url || r.metadata?.sourceURL || '',
    source: 'firecrawl',
  }));
  return { ok: true, provider: 'firecrawl', results, query };
}

/** Unified search: Firecrawl → Brave → DuckDuckGo */
export async function webSearch(query) {
  const q = String(query || '').trim();
  if (!q) return { ok: false, error: 'Empty query' };

  const fc = await searchFirecrawl(q);
  if (fc.ok && fc.results?.length) return fc;

  const br = await searchBrave(q);
  if (br.ok && br.results?.length) return br;

  const ddg = await searchDuckDuckGo(q);
  if (ddg.ok && ddg.results?.length) return ddg;

  return {
    ok: false,
    error:
      (fc.error && fc.error !== 'no firecrawl key' ? fc.error + ' | ' : '') +
      (ddg.error || 'No search results'),
  };
}

/** Fetch page text: Firecrawl scrape → Jina → plain fetch */
export async function fetchPageBoosted(url) {
  let u = String(url || '').trim();
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u;

  const fcKey = String(process.env.FIRECRAWL_API_KEY || '').trim();
  if (fcKey) {
    try {
      const res = await fetch('https://api.firecrawl.dev/v1/scrape', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + fcKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url: u, formats: ['markdown', 'html'] }),
        signal: AbortSignal.timeout(45000),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok) {
        const text =
          j.data?.markdown ||
          j.data?.content ||
          stripHtml(j.data?.html || '') ||
          '';
        if (text && text.length > 80) {
          return {
            ok: true,
            finalUrl: u,
            text: text.slice(0, 12000),
            provider: 'firecrawl',
          };
        }
      }
    } catch (_) {}
  }

  // Jina AI reader (no key)
  try {
    const jinaUrl = 'https://r.jina.ai/' + u;
    const res = await fetch(jinaUrl, {
      headers: { Accept: 'text/plain', 'User-Agent': UA },
      signal: AbortSignal.timeout(30000),
    });
    if (res.ok) {
      const text = (await res.text()).trim();
      if (text.length > 80) {
        return { ok: true, finalUrl: u, text: text.slice(0, 12000), provider: 'jina' };
      }
    }
  } catch (_) {}

  // Plain fetch
  try {
    const res = await fetch(u, {
      headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' },
      signal: AbortSignal.timeout(20000),
      redirect: 'follow',
    });
    if (!res.ok) return { ok: false, error: 'HTTP ' + res.status };
    const html = await res.text();
    const text = stripHtml(html);
    if (text.length < 40) return { ok: false, error: 'Page had little text' };
    return {
      ok: true,
      finalUrl: res.url || u,
      text: text.slice(0, 12000),
      provider: 'fetch',
    };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
}

export function formatSearchResults(search) {
  const lines = [
    '🔎 SEARCH · ' + (search.provider || 'web'),
    'Query: ' + search.query,
    '',
  ];
  (search.results || []).forEach((r, i) => {
    lines.push(i + 1 + '. ' + (r.title || 'Result'));
    if (r.snippet) lines.push(String(r.snippet).slice(0, 200));
    if (r.url) lines.push(r.url);
    lines.push('');
  });
  return lines.join('\n').trim();
}

export default {
  webSearch,
  fetchPageBoosted,
  formatSearchResults,
  searchDuckDuckGo,
  searchFirecrawl,
};
