/**
 * Wave 33A.2 — Blogger Web Master
 * Publish path: Gmail SMTP (App Password) first → Resend fallback
 * Short UUID / 8-char prefix resolve kept from 33A.1
 * No new api/*.js
 */
import { createClient } from '@supabase/supabase-js';
import nodemailer from 'nodemailer';

export const VERSION = '33A.2';

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

function gmailUser() {
  return String(process.env.GMAIL_USER || process.env.GMAIL_EMAIL || 'pasindudananjaya92@gmail.com').trim();
}

function gmailAppPassword() {
  return String(process.env.GMAIL_APP_PASSWORD || '').replace(/\s+/g, '').trim();
}

function isFullUuid(id) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id || ''));
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function blogHelp() {
  return [
    '📝 *Blogger Web Master · ' + VERSION + '*',
    'Mail2Blogger · Gmail SMTP (free) · mobile-safe',
    '',
    '• `blog draft <title> | <body>` — save draft',
    '• `blog list` — live posts (RSS)',
    '• `blog queue` — local drafts',
    '• `blog get <id>` — full or short id (8 chars OK)',
    '• `blog publish <id>` — email → Blogger',
    '• `blog publish now | <title> | <body>`',
    '• `blog help`',
    '',
    'Env (free path):',
    '· `GMAIL_APP_PASSWORD` — 16-char App Password',
    '· `GMAIL_USER` — optional (default Founder Gmail)',
    '· `BLOGGER_POST_EMAIL` — Blogger Mobile/email address',
    'Fallback: RESEND_* if Gmail not set',
    'Optional: `BLOG_PUBLIC_URL`',
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
  const raw = String(id || '').trim();
  if (!raw) return { ok: false, error: 'missing id' };

  if (isFullUuid(raw)) {
    const { data, error } = await client.from('rq_blog_drafts').select('*').eq('id', raw).maybeSingle();
    if (error) return { ok: false, error: error.message };
    if (!data) return { ok: false, error: 'not found' };
    return { ok: true, draft: data };
  }

  const q = await blogQueue(40);
  if (!q.ok) return q;
  const hit = (q.rows || []).find((x) => String(x.id).toLowerCase().startsWith(raw.toLowerCase()));
  if (!hit) return { ok: false, error: 'not found (use id from blog queue)' };
  const { data, error } = await client.from('rq_blog_drafts').select('*').eq('id', hit.id).maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: 'not found' };
  return { ok: true, draft: data };
}

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

async function sendViaGmail({ to, subject, text, html }) {
  const user = gmailUser();
  const pass = gmailAppPassword();
  if (!pass) return { ok: false, error: 'GMAIL_APP_PASSWORD not set', provider: 'gmail' };
  if (!to) return { ok: false, error: 'missing to', provider: 'gmail' };

  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user, pass },
  });

  try {
    const info = await transporter.sendMail({
      from: '"Queen OS Blog" <' + user + '>',
      to,
      subject: String(subject || '').slice(0, 200),
      text: String(text || ''),
      html: html || undefined,
    });
    return { ok: true, id: info.messageId || 'gmail-ok', provider: 'gmail' };
  } catch (e) {
    const msg = e && e.message ? e.message : String(e);
    return { ok: false, error: msg, provider: 'gmail' };
  }
}

async function sendViaResendFallback({ to, subject, text, html }) {
  try {
    const mail = await import('./mailManager.js');
    if (!mail.mailConfigured || !mail.mailConfigured()) {
      return { ok: false, error: 'Resend not configured', provider: 'resend' };
    }
    const sent = await mail.sendEmail({ to, subject, text, html });
    if (!sent.ok) return { ok: false, error: sent.error || 'resend failed', provider: 'resend' };
    return { ok: true, id: sent.id, provider: 'resend' };
  } catch (e) {
    return { ok: false, error: e.message || String(e), provider: 'resend' };
  }
}

/** Prefer Gmail App Password (100% free). Resend only if Gmail missing. */
async function sendBlogEmail(payload) {
  if (gmailAppPassword()) {
    const g = await sendViaGmail(payload);
    if (g.ok) return g;
    // If Gmail fails hard, try Resend once
    const r = await sendViaResendFallback(payload);
    if (r.ok) return r;
    return {
      ok: false,
      error: 'Gmail: ' + (g.error || 'fail') + ' | Resend: ' + (r.error || 'fail'),
      provider: 'none',
    };
  }
  return sendViaResendFallback(payload);
}

export async function blogPublish(id) {
  const got = await blogGet(id);
  if (!got.ok) return got;
  const d = got.draft;
  const to = bloggerPostEmail();
  if (!to) {
    return {
      ok: false,
      error:
        'BLOGGER_POST_EMAIL not set. Blogger → Settings → Mobile and email → copy address → Vercel env',
    };
  }

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

  const sent = await sendBlogEmail({
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
        blogger_email_id: String(sent.id || sent.provider || ''),
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
    provider: sent.provider,
    blog: blogPublicUrl(),
  };
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
