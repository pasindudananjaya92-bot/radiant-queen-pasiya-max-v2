/**
 * Wave 33A — Blogger Web Master (Mail2Blogger + public RSS)
 * Mobile-safe: no OAuth. Publish = email to BLOGGER_POST_EMAIL via Resend.
 */
import { createClient } from '@supabase/supabase-js';

export const VERSION = '33A';

function sb() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

function bloggerPostEmail() {
  return String(process.env.BLOGGER_POST_EMAIL || '').trim();
}

function blogPublicUrl() {
  return String(process.env.BLOG_PUBLIC_URL || 'https://mamageblog.blogspot.com').replace(/\/$/, '');
}

export function blogHelp() {
  return [
    '📝 *Blogger Web Master · ' + VERSION + '*',
    'Mail2Blogger · no OAuth · mobile-safe',
    '',
    '• `blog draft <title> | <body>` — save draft (Supabase)',
    '• `blog list` — recent *live* posts (public RSS)',
    '• `blog queue` — local drafts',
    '• `blog get <id>`',
    '• `blog publish <id>` — email → Blogger (Founder only)',
    '• `blog publish now | <title> | <body>` — save + publish',
    '• `blog help`',
    '',
    'Env: `BLOGGER_POST_EMAIL` (Blogger → Settings → Mobile and email)',
    'Also needs `RESEND_API_KEY` + verified `RESEND_FROM`',
    'Optional: `BLOG_PUBLIC_URL` (default mamageblog.blogspot.com)',
    '',
    '_Never auto-posts without `blog publish`. SEO tips via draft polish._',
  ].join('\n');
}

export async function blogDraft({ title, body, tags = '' }) {
  const client = sb();
  if (!client) return { ok: false, error: 'Supabase not configured' };
  const row = {
    title: String(title || '').trim().slice(0, 200) || 'Untitled',
    body: String(body || '').trim().slice(0, 50000),
    tags: String(tags || '').slice(0, 200),
    status: 'draft',
  };
  if (!row.body) return { ok: false, error: 'body empty' };
  const { data, error } = await client
    .from('rq_blog_drafts')
    .insert(row)
    .select('id,title,status,created_at')
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, draft: data };
}

export async function blogQueue(limit = 15) {
  const client = sb();
  if (!client) return { ok: false, error: 'Supabase not configured' };
  const { data, error } = await client
    .from('rq_blog_drafts')
    .select('id,title,status,created_at,published_at,error')
    .order('created_at', { ascending: false })
    .limit(Math.min(40, limit));
  if (error) return { ok: false, error: error.message };
  return { ok: true, rows: data || [] };
}

export async function blogGet(id) {
  const client = sb();
  if (!client) return { ok: false, error: 'Supabase not configured' };
  const { data, error } = await client.from('rq_blog_drafts').select('*').eq('id', id).maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) {
    const q = await blogQueue(40);
    const hit = (q.rows || []).find((x) => String(x.id).startsWith(String(id)));
    if (!hit) return { ok: false, error: 'not found' };
    return blogGet(hit.id);
  }
  return { ok: true, draft: data };
}

/** Public Blogger RSS/JSON — no auth */
export async function blogListLive(limit = 8) {
  const base = blogPublicUrl();
  const feed = base + '/feeds/posts/default?alt=json&max-results=' + Math.min(15, limit);
  try {
    const r = await fetch(feed, {
      headers: { 'User-Agent': 'QueenOS-Blog/33A', Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return { ok: false, error: 'RSS HTTP ' + r.status };
    const j = await r.json();
    const entries = j?.feed?.entry || [];
    const rows = entries.map((e) => {
      const title = e.title?.$t || e.title || 'Untitled';
      const link = (e.link || []).find((l) => l.rel === 'alternate')?.href || base;
      const published = e.published?.$t || e.updated?.$t || '';
      return { title: String(title), link, published };
    });
    return { ok: true, rows, blog: base };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

/**
 * Mail2Blogger: subject = title, body = HTML/text content
 * Blogger secret address from dashboard.
 */
export async function blogPublish(id) {
  const got = await blogGet(id);
  if (!got.ok) return got;
  const d = got.draft;
  const to = bloggerPostEmail();
  if (!to) {
    return {
      ok: false,
      error:
        'BLOGGER_POST_EMAIL not set. Blogger → Settings → Mobile and email → copy Email posting address → Vercel env',
    };
  }
  try {
    const mail = await import('./mailManager.js');
    if (!mail.mailConfigured()) {
      return { ok: false, error: 'RESEND_API_KEY not set' };
    }
    // Light SEO polish wrapper
    const html =
      '<h1>' +
      escapeHtml(d.title) +
      '</h1>\n' +
      '<div>' +
      String(d.body || '')
        .split(/\n\n+/)
        .map((p) => '<p>' + escapeHtml(p).replace(/\n/g, '<br>') + '</p>')
        .join('\n') +
      '</div>\n' +
      '<p><em>Posted via Queen OS · mobile Founder</em></p>';
    const sent = await mail.sendEmail({
      to,
      subject: d.title,
      text: d.title + '\n\n' + d.body,
      html,
    });
    const client = sb();
    if (!sent.ok) {
      if (client) {
        await client
          .from('rq_blog_drafts')
          .update({
            status: 'failed',
            error: String(sent.error || 'send failed').slice(0, 500),
            updated_at: new Date().toISOString(),
          })
          .eq('id', d.id);
      }
      return { ok: false, error: sent.error || 'email failed' };
    }
    if (client) {
      await client
        .from('rq_blog_drafts')
        .update({
          status: 'published',
          blogger_email_id: sent.id || '',
          error: '',
          published_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', d.id);
    }
    return {
      ok: true,
      id: d.id,
      title: d.title,
      emailId: sent.id,
      blog: blogPublicUrl(),
    };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function formatQueue(rows) {
  if (!rows?.length) return '📝 No drafts. `blog draft Title | body text`';
  const lines = ['📝 *Blog queue* (' + rows.length + ')', ''];
  for (const r of rows) {
    lines.push(
      '· `' +
        String(r.id).slice(0, 8) +
        '` *' +
        (r.title || '').slice(0, 60) +
        '* · ' +
        (r.status || 'draft')
    );
  }
  lines.push('', '_`blog publish <id>` · `blog get <id>`_');
  return lines.join('\n');
}

export function formatLiveList(rows, blog) {
  if (!rows?.length) return '📝 No live posts found on ' + (blog || 'blog');
  const lines = ['📝 *Live on Blogger*', blog || '', ''];
  for (const r of rows.slice(0, 8)) {
    lines.push('· ' + (r.title || 'Untitled'));
    if (r.link) lines.push('  ' + r.link);
  }
  return lines.join('\n');
}

export default {
  VERSION,
  blogHelp,
  blogDraft,
  blogQueue,
  blogGet,
  blogListLive,
  blogPublish,
  formatQueue,
  formatLiveList,
  bloggerPostEmail,
  blogPublicUrl,
};
