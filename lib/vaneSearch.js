/**
 * v4000 C2 — Search chain + sharper focus modes
 * Tavily → Serper → DDG
 */
const TAVILY = 'https://api.tavily.com/search';
const SERPER = 'https://google.serper.dev/search';

function focusConfig(focus) {
  const f = String(focus || 'web').toLowerCase();
  if (f === 'reddit') {
    return {
      focus: 'reddit',
      querySuffix: ' site:reddit.com',
      include_domains: ['reddit.com', 'www.reddit.com'],
      tavilyTopic: 'general',
    };
  }
  if (f === 'academic' || f === 'scholar') {
    return {
      focus: 'academic',
      querySuffix:
        ' (site:arxiv.org OR site:scholar.google.com OR site:pubmed.ncbi.nlm.nih.gov OR filetype:pdf)',
      include_domains: ['arxiv.org', 'scholar.google.com', 'pubmed.ncbi.nlm.nih.gov', 'ieee.org', 'acm.org'],
      tavilyTopic: 'general',
    };
  }
  if (f === 'youtube' || f === 'yt') {
    return {
      focus: 'youtube',
      querySuffix: ' site:youtube.com',
      include_domains: ['youtube.com', 'www.youtube.com', 'youtu.be'],
      tavilyTopic: 'general',
    };
  }
  if (f === 'news') {
    return {
      focus: 'news',
      querySuffix: '',
      include_domains: null,
      tavilyTopic: 'news',
    };
  }
  return {
    focus: 'web',
    querySuffix: '',
    include_domains: null,
    tavilyTopic: 'general',
  };
}

function buildQuery(q, cfg) {
  return String(q || '').trim() + (cfg.querySuffix || '');
}

async function searchTavily(query, opts = {}) {
  const key = process.env.TAVILY_API_KEY;
  if (!key) return { ok: false, error: 'TAVILY_API_KEY missing' };
  const body = {
    api_key: key,
    query,
    search_depth: opts.depth || 'basic',
    max_results: opts.max || 5,
    include_answer: false,
    include_raw_content: false,
    topic: opts.topic || 'general',
  };
  if (opts.include_domains && opts.include_domains.length) {
    body.include_domains = opts.include_domains;
  }
  const res = await fetch(TAVILY, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(12000),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false, error: j.detail || j.error || 'Tavily ' + res.status };
  }
  const results = (j.results || []).map((r, i) => ({
    i: i + 1,
    title: r.title || 'Untitled',
    url: r.url || '',
    snippet: (r.content || r.snippet || '').slice(0, 600),
  }));
  return { ok: true, engine: 'tavily', results };
}

async function searchSerper(query, opts = {}) {
  const key = process.env.SERPER_API_KEY;
  if (!key) return { ok: false, error: 'SERPER_API_KEY missing' };
  const res = await fetch(SERPER, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-KEY': key,
    },
    body: JSON.stringify({ q: query, num: opts.max || 5 }),
    signal: AbortSignal.timeout(12000),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false, error: j.message || 'Serper ' + res.status };
  }
  const organic = j.organic || [];
  const results = organic.slice(0, opts.max || 5).map((r, i) => ({
    i: i + 1,
    title: r.title || 'Untitled',
    url: r.link || '',
    snippet: (r.snippet || '').slice(0, 600),
  }));
  return { ok: true, engine: 'serper', results };
}

async function searchDdg(query) {
  try {
    const url =
      'https://html.duckduckgo.com/html/?q=' + encodeURIComponent(query);
    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; PasiyaOS/4.0; +https://t.me)',
      },
      signal: AbortSignal.timeout(10000),
    });
    const html = await res.text();
    const results = [];
    const re =
      /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?class="result__snippet"[^>]*>([\s\S]*?)<\/(?:a|td)/gi;
    let m;
    while ((m = re.exec(html)) && results.length < 5) {
      const title = m[2].replace(/<[^>]+>/g, '').trim();
      const snippet = m[3].replace(/<[^>]+>/g, '').trim();
      let link = m[1];
      const um = link.match(/uddg=([^&]+)/);
      if (um) {
        try {
          link = decodeURIComponent(um[1]);
        } catch (_) {}
      }
      if (title && link) {
        results.push({
          i: results.length + 1,
          title,
          url: link,
          snippet: snippet.slice(0, 600),
        });
      }
    }
    if (!results.length) return { ok: false, error: 'DDG parse empty' };
    return { ok: true, engine: 'ddg', results };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

export async function vaneSearch(query, opts = {}) {
  const cfg = focusConfig(opts.focus || 'web');
  const q = buildQuery(query, cfg);
  const max = opts.max || 5;
  const tried = [];

  let r = await searchTavily(q, {
    max,
    topic: cfg.tavilyTopic,
    include_domains: cfg.include_domains,
  });
  tried.push('tavily:' + (r.ok ? 'ok' : r.error));
  if (r.ok && r.results.length) {
    return { ...r, query: q, focus: cfg.focus, tried };
  }

  r = await searchSerper(q, { max });
  tried.push('serper:' + (r.ok ? 'ok' : r.error));
  if (r.ok && r.results.length) {
    return { ...r, query: q, focus: cfg.focus, tried };
  }

  r = await searchDdg(q);
  tried.push('ddg:' + (r.ok ? 'ok' : r.error));
  if (r.ok && r.results.length) {
    return { ...r, query: q, focus: cfg.focus, tried };
  }

  return {
    ok: false,
    error: 'All search engines failed',
    tried,
    query: q,
    focus: cfg.focus,
    results: [],
  };
}

export function formatSources(results) {
  if (!results || !results.length) return '(no sources)';
  return results
    .map(function (r) {
      return '[' + r.i + '] ' + r.title + '\n' + r.url + '\n' + r.snippet;
    })
    .join('\n\n');
}

export default { vaneSearch, formatSources, focusConfig };
