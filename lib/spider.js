/**
 * lib/spider.js — The Spider (Phase 1: Jina reader + optional kb_cache)
 */
const JINA = 'https://r.jina.ai/http://';

export async function browseUrl(url, { supabase, ttlHours = 24 } = {}) {
  let u = String(url || '').trim();
  if (!u) return { ok: false, error: 'url required' };
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
  try {
    new URL(u);
  } catch {
    return { ok: false, error: 'invalid url' };
  }

  // cache
  if (supabase) {
    try {
      const { data } = await supabase
        .from('kb_cache')
        .select('body, created_at')
        .eq('key', u)
        .maybeSingle();
      if (data?.body && data.created_at) {
        const age = Date.now() - new Date(data.created_at).getTime();
        if (age < ttlHours * 3600 * 1000) {
          return { ok: true, url: u, markdown: data.body, cached: true };
        }
      }
    } catch (_) {}
  }

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20000);
  let res;
  try {
    res = await fetch(JINA + u.replace(/^https?:\/\//i, ''), {
      headers: { Accept: 'text/markdown' },
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(t);
  }
  if (!res.ok) {
    // try full URL form
    const res2 = await fetch('https://r.jina.ai/' + u, {
      headers: { Accept: 'text/markdown' },
    });
    if (!res2.ok) return { ok: false, error: 'jina HTTP ' + res.status };
    const md2 = (await res2.text()).slice(0, 12000);
    await saveCache(supabase, u, md2);
    return { ok: true, url: u, markdown: md2, cached: false };
  }
  const md = (await res.text()).slice(0, 12000);
  await saveCache(supabase, u, md);
  return { ok: true, url: u, markdown: md, cached: false };
}

async function saveCache(supabase, key, body) {
  if (!supabase) return;
  try {
    await supabase.from('kb_cache').upsert(
      { key, body: String(body).slice(0, 50000), created_at: new Date().toISOString() },
      { onConflict: 'key' }
    );
  } catch (_) {}
}

export default { browseUrl };
