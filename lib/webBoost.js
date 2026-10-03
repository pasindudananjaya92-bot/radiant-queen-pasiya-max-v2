/**
 * lib/webBoost.js — Pack H (search finally fixed)
 * Root cause: Wikipedia opensearch returns [] for long phrases
 * like "Sri Lanka capital". Fix: multi-query fallback + REST summaries.
 * News: Google News RSS (real headlines).
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
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function queryVariants(q) {
  const base = String(q || '').trim();
  const out = [];
  const add = (s) => {
    const t = String(s || '').trim();
    if (t && !out.includes(t)) out.push(t);
  };
  add(base);
  // drop question words
  add(
    base
      .replace(/^(what|who|where|when|why|how|is|are|the|a|an)\s+/gi, '')
      .replace(/\?+$/g, '')
      .trim()
  );
  const words = base.split(/\s+/).filter(Boolean);
  if (words.length > 3) add(words.slice(0, 3).join(' '));
  if (words.length > 2) add(words.slice(0, 2).join(' '));
  if (words.length > 1) add(words[0] + ' ' + words[1]);
  // capitalize first two words as title-ish
  if (words.length >= 2) add(words[0] + ' ' + words[1]);
  add(words[0]);
  return out.filter(Boolean).slice(0, 6);
}

async function wikiOpenSearch(term) {
  const url =
    'https://en.wikipedia.org/w/api.php?action=opensearch&search=' +
    encodeURIComponent(term) +
    '&limit=6&namespace=0&format=json';
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) return [];
  const j = await res.json();
  const titles = j[1] || [];
  const urls = j[3] || [];
  return titles.map((t, i) => ({
    title: t,
    url: urls[i] || 'https://en.wikipedia.org/wiki/' + encodeURIComponent(t.replace(/ /g, '_')),
    source: 'wikipedia',
  }));
}

async function wikiSummary(titleOrQuery) {
  const key = String(titleOrQuery || '').trim().replace(/\s+/g, '_');
  const url = 'https://en.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(key);
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) return null;
  const j = await res.json();
  if (!j.extract && !j.title) return null;
  return {
    title: j.title || titleOrQuery,
    snippet: j.extract || j.description || '',
    url: j.content_urls?.desktop?.page || j.content_urls?.mobile?.page || '',
    source: 'wikipedia-summary',
  };
}

export async function searchWikipedia(query) {
  const results = [];
  const seen = new Set();
  for (const term of queryVariants(query)) {
    try {
      const hits = await wikiOpenSearch(term);
      for (const h of hits) {
        const k = (h.title || '').toLowerCase();
        if (!k || seen.has(k)) continue;
        seen.add(k);
        // enrich snippet
        let sn = h;
        try {
          const sum = await wikiSummary(h.title);
          if (sum?.snippet) sn = { ...h, snippet: sum.snippet, url: sum.url || h.url };
        } catch (_) {
          sn = { ...h, snippet: h.title };
        }
        results.push(sn);
        if (results.length >= 6) break;
      }
    } catch (_) {}
    if (results.length >= 6) break;
  }
  // last resort: summary of first 1-2 words
  if (!results.length) {
    for (const term of queryVariants(query)) {
      try {
        const sum = await wikiSummary(term);
        if (sum) {
          results.push(sum);
          break;
        }
      } catch (_) {}
    }
  }
  return results.length
    ? { ok: true, provider: 'wikipedia', results, query: String(query) }
    : { ok: false, error: 'wikipedia empty', results: [] };
}

export async function searchDuckDuckGo(query) {
  const q = String(query || '').trim();
  const results = [];
  try {
    const url =
      'https://api.duckduckgo.com/?q=' +
      encodeURIComponent(q) +
      '&format=json&no_html=1&skip_disambig=1';
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'application/json' },
      signal: AbortSignal.timeout(12000),
    });
    if (res.ok) {
      const j = await res.json();
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
        }
        if (results.length >= 8) break;
      }
    }
  } catch (_) {}
  return results.length
    ? { ok: true, provider: 'duckduckgo', results: results.slice(0, 8), query: q }
    : { ok: false, error: 'ddg empty', results: [] };
}

export async function searchBrave(query) {
  const key = String(process.env.BRAVE_SEARCH_API_KEY || '').trim();
  if (!key) return { ok: false, error: 'no brave key', results: [] };
  try {
    const res = await fetch(
      'https://api.search.brave.com/res/v1/web/search?q=' + encodeURIComponent(query) + '&count=6',
      {
        headers: { 'X-Subscription-Token': key, Accept: 'application/json' },
        signal: AbortSignal.timeout(15000),
      }
    );
    if (!res.ok) return { ok: false, error: 'Brave HTTP ' + res.status, results: [] };
    const j = await res.json();
    const results = (j.web?.results || []).map((r) => ({
      title: r.title,
      snippet: r.description || '',
      url: r.url,
      source: 'brave',
    }));
    return results.length
      ? { ok: true, provider: 'brave', results, query }
      : { ok: false, error: 'brave empty', results: [] };
  } catch (e) {
    return { ok: false, error: String(e.message || e), results: [] };
  }
}

export async function searchFirecrawl(query) {
  const key = String(process.env.FIRECRAWL_API_KEY || '').trim();
  if (!key) return { ok: false, error: 'no firecrawl key', results: [] };
  try {
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
      return { ok: false, error: j?.error || 'Firecrawl HTTP ' + res.status, results: [] };
    }
    const data = j.data || j.results || [];
    const results = (Array.isArray(data) ? data : []).map((r) => ({
      title: r.title || r.metadata?.title || 'Result',
      snippet: r.description || r.markdown?.slice(0, 240) || '',
      url: r.url || r.metadata?.sourceURL || '',
      source: 'firecrawl',
    }));
    return results.length
      ? { ok: true, provider: 'firecrawl', results, query }
      : { ok: false, error: 'firecrawl empty', results: [] };
  } catch (e) {
    return { ok: false, error: String(e.message || e), results: [] };
  }
}

/** Real news via Google News RSS */
export async function searchNews(query) {
  const q = String(query || 'world').trim();
  try {
    const url =
      'https://news.google.com/rss/search?q=' +
      encodeURIComponent(q) +
      '&hl=en-US&gl=US&ceid=US:en';
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'application/rss+xml, application/xml, text/xml' },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return { ok: false, error: 'News HTTP ' + res.status, results: [] };
    const xml = await res.text();
    const results = [];
    const itemRe = /<item>([\s\S]*?)<\/item>/gi;
    let m;
    while ((m = itemRe.exec(xml)) && results.length < 8) {
      const block = m[1];
      const title = stripHtml((block.match(/<title>([\s\S]*?)<\/title>/i) || [])[1] || '');
      const link = stripHtml((block.match(/<link>([\s\S]*?)<\/link>/i) || [])[1] || '');
      const source = stripHtml((block.match(/<source[^>]*>([\s\S]*?)<\/source>/i) || [])[1] || '');
      if (!title) continue;
      results.push({
        title,
        snippet: source ? 'Source: ' + source : title,
        url: link,
        source: 'google-news',
      });
    }
    return results.length
      ? { ok: true, provider: 'google-news', results, query: q }
      : { ok: false, error: 'news empty', results: [] };
  } catch (e) {
    return { ok: false, error: String(e.message || e), results: [] };
  }
}

function mergeResults(...lists) {
  const out = [];
  const seen = new Set();
  for (const list of lists) {
    for (const r of list || []) {
      const key = (r.url || r.title || '').toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(r);
      if (out.length >= 10) return out;
    }
  }
  return out;
}

export async function webSearch(query) {
  const q = String(query || '').trim();
  if (!q) return { ok: false, error: 'Empty query', results: [] };

  const parts = [];
  // Wikipedia FIRST (fixed multi-query) — most reliable free
  try {
    const w = await searchWikipedia(q);
    if (w.ok && w.results?.length) parts.push(w);
  } catch (_) {}

  for (const fn of [searchFirecrawl, searchBrave, searchDuckDuckGo]) {
    try {
      const r = await fn(q);
      if (r.ok && r.results?.length) parts.push(r);
    } catch (_) {}
  }

  const results = mergeResults(...parts.map((p) => p.results));
  if (!results.length) {
    return { ok: false, error: 'No results', results: [] };
  }
  return {
    ok: true,
    provider: parts.map((p) => p.provider).join('+') || 'web',
    results,
    query: q,
  };
}

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
        body: JSON.stringify({ url: u, formats: ['markdown'] }),
        signal: AbortSignal.timeout(45000),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok) {
        const text = j.data?.markdown || j.data?.content || '';
        if (text.length > 80) {
          return { ok: true, finalUrl: u, text: text.slice(0, 14000), provider: 'firecrawl' };
        }
      }
    } catch (_) {}
  }
  try {
    const res = await fetch('https://r.jina.ai/' + u, {
      headers: { Accept: 'text/plain', 'User-Agent': UA },
      signal: AbortSignal.timeout(30000),
    });
    if (res.ok) {
      const text = (await res.text()).trim();
      if (text.length > 80) {
        return { ok: true, finalUrl: u, text: text.slice(0, 14000), provider: 'jina' };
      }
    }
  } catch (_) {}
  try {
    const res = await fetch(u, {
      headers: { 'User-Agent': UA, Accept: 'text/html' },
      signal: AbortSignal.timeout(20000),
      redirect: 'follow',
    });
    if (!res.ok) return { ok: false, error: 'HTTP ' + res.status };
    const text = stripHtml(await res.text());
    if (text.length < 40) return { ok: false, error: 'little text' };
    return { ok: true, finalUrl: res.url || u, text: text.slice(0, 14000), provider: 'fetch' };
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
    if (r.snippet) lines.push(String(r.snippet).slice(0, 240));
    if (r.url) lines.push(r.url);
    lines.push('');
  });
  return lines.join('\n').trim();
}

export default {
  webSearch,
  searchNews,
  searchWikipedia,
  fetchPageBoosted,
  formatSearchResults,
};
