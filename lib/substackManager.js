/**
 * Wave 34A — Substack Web Master (FREE, safe)
 * - Drafts in Supabase
 * - Live list via public RSS
 * - Pack = copy-ready Markdown for Founder paste into Substack app
 * NO session cookies, NO unofficial publish API
 */
import { createClient } from '@supabase/supabase-js';

export const VERSION = '34A';

function sb() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export function substackPublicUrl() {
  return String(process.env.SUBSTACK_PUBLIC_URL || 'https://pasindudananjaya.substack.com').replace(
    /\/$/,
    ''
  );
}

function isFullUuid(id) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id || ''));
}

export function substackHelp() {
  return [
    '📰 *Substack Web Master · ' + VERSION + '*',
    'Draft + RSS + copy-pack · no cookies · free',
    '',
    '• `substack draft <title> | <body>` — save draft',
    '• `substack queue` — local drafts',
    '• `substack get <id>` — full or 8-char id',
    '• `substack list` — live posts (public RSS)',
    '• `substack pack <id>` — copy-ready Markdown for Substack app',
    '• `substack help`',
    '',
    'Publish = you paste pack in Substack (mobile).',
    'Env optional: `SUBSTACK_PUBLIC_URL`',
    'Site: ' + substackPublicUrl(),
  ].join('\n');
}

export async function substackDraft({ title, body, tags = '' }) {
  const client = sb();
  if (!client) return { ok: false, error: 'Supabase not configured' };
  const row = {
    title: String(title || '').trim().slice(0, 200) || 'Untitled',
    body: String(body || '').trim().slice(0, 50000),
    tags: String(tags || '').slice(0, 200),
    status: 'draft',
  };
  if (!row.body) return { ok: false, error: 'body empty — use: substack draft Title | body' };
  const { data, error } = await client
    .from('rq_substack_drafts')
    .insert(row)
    .select('id,title,status,created_at')
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, draft: data };
}

export async function substackQueue(limit = 15) {
  const client = sb();
  if (!client) return { ok: false, error: 'Supabase not configured' };
  const { data, error } = await client
    .from('rq_substack_drafts')
    .select('id,title,status,created_at,error')
    .order('created_at', { ascending: false })
    .limit(Math.min(40, limit));
  if (error) return { ok: false, error: error.message };
  return { ok: true, rows: data || [] };
}

export async function substackGet(id) {
  const client = sb();
  if (!client) return { ok: false, error: 'Supabase not configured' };
  const raw = String(id || '').trim();
  if (!raw) return { ok: false, error: 'missing id' };

  if (isFullUuid(raw)) {
    const { data, error } = await client.from('rq_substack_drafts').select('*').eq('id', raw).maybeSingle();
    if (error) return { ok: false, error: error.message };
    if (!data) return { ok: false, error: 'not found' };
    return { ok: true, draft: data };
  }

  const q = await substackQueue(40);
  if (!q.ok) return q;
  const hit = (q.rows || []).find((x) => String(x.id).toLowerCase().startsWith(raw.toLowerCase()));
  if (!hit) return { ok: false, error: 'not found — use id from substack queue' };
  const { data, error } = await client.from('rq_substack_drafts').select('*').eq('id', hit.id).maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: 'not found' };
  return { ok: true, draft: data };
}

export async function substackListLive(limit = 8) {
  const base = substackPublicUrl();
  const feed = base + '/feed';
  try {
    const r = await fetch(feed, {
      headers: { 'User-Agent': 'QueenOS-Substack/34A', Accept: 'application/rss+xml, application/xml, text/xml' },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return { ok: false, error: 'RSS HTTP ' + r.status };
    const xml = await r.text();
    const rows = parseRssItems(xml, limit);
    return { ok: true, rows, blog: base };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

function parseRssItems(xml, limit) {
  const rows = [];
  const chunks = String(xml || '').split(/<item[\s>]/i).slice(1);
  for (const chunk of chunks) {
    if (rows.length >= limit) break;
    const title = (chunk.match(/<title[^>]*><!\[CDATA\[([\s\S]*?)\]\]><\/title>/i) ||
      chunk.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1];
    const link = (chunk.match(/<link[^>]*><!\[CDATA\[([\s\S]*?)\]\]><\/link>/i) ||
      chunk.match(/<link[^>]*>([\s\S]*?)<\/link>/i) || [])[1];
    const pub = (chunk.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i) || [])[1];
    if (!title) continue;
    rows.push({
      title: decodeXml(String(title).trim()),
      link: decodeXml(String(link || '').trim()),
      published: String(pub || '').trim(),
    });
  }
  return rows;
}

function decodeXml(s) {
  return String(s)
    .replace(/<!\[CDATA\[/g, '')
    .replace(/\]\]>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

/** Copy-ready Markdown for Substack mobile editor */
export async function substackPack(id) {
  const got = await substackGet(id);
  if (!got.ok) return got;
  const d = got.draft;
  const tags = String(d.tags || '')
    .split(/[,#]+/)
    .map((t) => t.trim())
    .filter(Boolean);
  const md = [
    '# ' + (d.title || 'Untitled'),
    '',
    String(d.body || '').trim(),
    '',
    '---',
    'Tags: ' + (tags.length ? tags.map((t) => '#' + t.replace(/^#/, '')).join(' ') : '#QueenOS #mobile'),
    'CTA: Reply on Telegram @PasiyaMaxQueen_bot · Site https://pasiya-max-site.gt.tc',
    '—',
    '_Pack by Queen OS ' + VERSION + ' · paste into Substack · Founder publish_',
  ].join('\n');

  const client = sb();
  if (client) {
    await client
      .from('rq_substack_drafts')
      .update({ pack_md: md, updated_at: new Date().toISOString(), status: 'packed' })
      .eq('id', d.id);
  }
  return { ok: true, id: d.id, title: d.title, markdown: md };
}

export function formatQueue(rows) {
  if (!rows?.length) return '📰 No drafts. `substack draft Title | body`';
  const lines = ['📰 *Substack queue* (' + rows.length + ')', ''];
  for (const r of rows) {
    lines.push(
      '· `' + String(r.id).slice(0, 8) + '` *' + (r.title || '').slice(0, 56) + '* · ' + (r.status || 'draft')
    );
  }
  lines.push('', '_`substack pack <id>` · `substack get <id>`_');
  return lines.join('\n');
}

export function formatLiveList(rows, blog) {
  if (!rows?.length) return '📰 No live posts on ' + (blog || 'Substack');
  const lines = ['📰 *Live on Substack*', blog || '', ''];
  for (const r of rows.slice(0, 8)) {
    lines.push('· ' + (r.title || 'Untitled'));
    if (r.link) lines.push('  ' + r.link);
  }
  return lines.join('\n');
}

export default {
  VERSION,
  substackHelp,
  substackDraft,
  substackQueue,
  substackGet,
  substackListLive,
  substackPack,
  formatQueue,
  formatLiveList,
  substackPublicUrl,
};
