/**
 * lib/webBoost.js — Pack G (search hardened)
 * Order: Firecrawl → Brave → Wikipedia → DuckDuckGo JSON → DDG HTML
 * Never return empty if Wikipedia has hits.
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

/** Wikipedia OpenSearch + summary (very reliable on serverless) */
export async function searchWikipedia(query) {
  const q = String(query || '').trim();
  if (!q) return { ok: false, error: 'Empty query' };
  const results = [];
  try {
    const osUrl =
      'https://en.wikipedia.org/w/api.php?action=opensearch&search=' +
      encodeURIComponent(q) +
      '&limit=6&namespace=0&format=json&origin=*';
    const res = await fetch(osUrl, {
      headers: { 'User-Agent': UA, Accept: 'application/json' },
      signal: AbortSignal.timeout(12000),
    });
    if (res.ok) {
      const j = await res.json();
      const titles = j[1] || [];
      const descs = j[2] || [];
      const urls = j[3] || [];
      for (let i = 0; i < titles.length; i++) {
        results.push({
          title: titles[i],
          snippet: descs[i] || titles[i],
          url: urls[i] || 'https://en.wikipedia.org/wiki/' + encodeURIComponent(titles[i]),
          source: 'wikipedia',
        });
      }
    }
  } catch (_) {}

  // REST summary for top title if no opensearch
  if (!results.length) {
    try {
      const sumUrl =
        'https://en.wikipedia.org/api/rest_v1/page/summary/' +
        encodeURIComponent(q.replace(/\s+/g, '_'));
      const res = await fetch(sumUrl, {
        headers: { 'User-Agent': UA, Accept: 'application/json' },
        signal: AbortSignal.timeout(12000),
      });
      if (res.ok) {
        const j = await res.json();
        if (j.extract) {
          results.push({
            title: j.title || q,
            snippet: j.extract,
            url: j.content_urls?.desktop?.page || j.content_urls?.mobile?.page || '',
            source: 'wikipedia-summary',
          });
        }
      }
    } catch (_) {}
  }
  return results.length
    ? { ok: true, provider: 'wikipedia', results, query: q }
    : { ok: false, error: 'wikipedia empty', results: [] };
}

export async function searchDuckDuckGo(query) {
  const q = String(query || '').trim();
  if (!q) return { ok: false, error: 'Empty query' };
  const results = [];

  // 1) Instant Answer API
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
      const topics = [];
      for (const t of j.RelatedTopics || []) {
        if (t.Text && t.FirstURL) topics.push(t);
        if (t.Topics) topics.push(...t.Topics.filter((x) => x.Text && x.FirstURL));
      }
      for (const t of topics.slice(0, 8)) {
        results.push({
          title: String(t.Text).split(' - ')[0].slice(0, 80),
          snippet: t.Text,
          url: t.FirstURL,
          source: 'ddg-related',
        });
      }
    }
  } catch (_) {}

  // 2) lite.duckduckgo.com
  if (results.length < 3) {
    try {
      const htmlRes = await fetch(
        'https://lite.duckduckgo.com/lite/?q=' + encodeURIComponent(q),
        { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(12000) }
      );
      if (htmlRes.ok) {
        const html = await htmlRes.text();
        const linkRe = /<a[^>]+href="(https?:\/\/[^"]+)"[^>]*>([^<]{3,120})<\/a>/gi;
        let m;
        const seen = new Set(results.map((r) => r.url));
        while ((m = linkRe.exec(html)) && results.length < 8) {
          const href = m[1];
          if (/duckduckgo\.com|javascript:/i.test(href)) continue;
          if (seen.has(href)) continue;
          seen.add(href);
          results.push({
            title: stripHtml(m[2]).slice(0, 100),
            snippet: stripHtml(m[2]),
            url: href,
            source: 'ddg-lite',
          });
        }
      }
    } catch (_) {}
  }

  return results.length
    ? { ok: true, provider: 'duckduckgo', results: results.slice(0, 8), query: q }
    : { ok: false, error: 'ddg empty', results: [] };
}

export async function searchBrave(query) {
  const key = String(process.env.BRAVE_SEARCH_API_KEY || '').trim();
  if (!key) return { ok: false, error: 'no brave key', results: [] };
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
}

export async function searchFirecrawl(query) {
  const key = String(process.env.FIRECRAWL_API_KEY || '').trim();
  if (!key) return { ok: false, error: 'no firecrawl key', results: [] };
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
    return {
      ok: false,
      error: j?.error || j?.message || 'Firecrawl HTTP ' + res.status,
      results: [],
    };
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
}

/** Merge unique by URL */
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

/** Unified search — always tries Wikipedia */
export async function webSearch(query) {
  const q = String(query || '').trim();
  if (!q) return { ok: false, error: 'Empty query', results: [] };

  const parts = [];
  const errors = [];

  for (const fn of [searchFirecrawl, searchBrave, searchWikipedia, searchDuckDuckGo]) {
    try {
      const r = await fn(q);
      if (r.ok && r.results?.length) parts.push(r);
      else if (r.error) errors.push(r.error);
    } catch (e) {
      errors.push(String(e.message || e));
    }
  }

  const results = mergeResults(...parts.map((p) => p.results));
  if (!results.length) {
    return {
      ok: false,
      error: errors.filter((e) => !/no (brave|firecrawl) key/i.test(e)).slice(0, 3).join(' | ') || 'No results',
      results: [],
    };
  }

  const provider = parts.map((p) => p.provider).filter(Boolean).join('+');
  return { ok: true, provider, results, query: q };
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
        body: JSON.stringify({ url: u, formats: ['markdown', 'html'] }),
        signal: AbortSignal.timeout(45000),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok) {
        const text =
          j.data?.markdown || j.data?.content || stripHtml(j.data?.html || '') || '';
        if (text.length > 80) {
          return { ok: true, finalUrl: u, text: text.slice(0, 14000), provider: 'firecrawl' };
        }
      }
    } catch (_) {}
  }

  try {
    const jinaUrl = 'https://r.jina.ai/' + u;
    const res = await fetch(jinaUrl, {
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
      text: text.slice(0, 14000),
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
    if (r.snippet) lines.push(String(r.snippet).slice(0, 220));
    if (r.url) lines.push(r.url);
    lines.push('');
  });
  return lines.join('\n').trim();
}

export default {
  webSearch,
  fetchPageBoosted,
  formatSearchResults,
  searchWikipedia,
  searchDuckDuckGo,
  searchFirecrawl,
};
