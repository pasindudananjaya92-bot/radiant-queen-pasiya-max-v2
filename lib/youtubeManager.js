/**
 * Wave 35A — YouTube Desk (FREE, mobile-safe)
 * Draft + copy-pack for YouTube app. NO video byte upload (Vercel 10s + OAuth).
 */
import { createClient } from '@supabase/supabase-js';

export const VERSION = '35A';

function sb() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

function channelUrl() {
  return String(process.env.YOUTUBE_CHANNEL_URL || '').trim();
}

function isFullUuid(id) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id || ''));
}

export function youtubeHelp() {
  const ch = channelUrl();
  return [
    '🎬 *YouTube Desk · ' + VERSION + '*',
    'Draft + copy-pack · no auto-upload · free',
    '',
    '• `yt help` / `youtube help`',
    '• `yt draft <title> | <description>`',
    '• `yt queue` — local drafts',
    '• `yt get <id>` — full or 8-char id',
    '• `yt pack <id>` — title + description + tags for YouTube app',
    '',
    'Upload video in YouTube app → paste pack text.',
    'Vercel Hobby cannot stream video bytes (10s limit).',
    ch ? 'Channel: ' + ch : 'Optional env: `YOUTUBE_CHANNEL_URL`',
  ].join('\n');
}

export async function ytDraft({ title, description, tags = '' }) {
  const client = sb();
  if (!client) return { ok: false, error: 'Supabase not configured' };
  const row = {
    title: String(title || '').trim().slice(0, 100) || 'Untitled',
    description: String(description || '').trim().slice(0, 5000),
    tags: String(tags || '').slice(0, 400),
    status: 'draft',
  };
  if (!row.description) return { ok: false, error: 'description empty — yt draft Title | description' };
  const { data, error } = await client
    .from('rq_youtube_drafts')
    .insert(row)
    .select('id,title,status,created_at')
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, draft: data };
}

export async function ytQueue(limit = 15) {
  const client = sb();
  if (!client) return { ok: false, error: 'Supabase not configured' };
  const { data, error } = await client
    .from('rq_youtube_drafts')
    .select('id,title,status,created_at,error')
    .order('created_at', { ascending: false })
    .limit(Math.min(40, limit));
  if (error) return { ok: false, error: error.message };
  return { ok: true, rows: data || [] };
}

export async function ytGet(id) {
  const client = sb();
  if (!client) return { ok: false, error: 'Supabase not configured' };
  const raw = String(id || '').trim();
  if (!raw) return { ok: false, error: 'missing id' };

  if (isFullUuid(raw)) {
    const { data, error } = await client.from('rq_youtube_drafts').select('*').eq('id', raw).maybeSingle();
    if (error) return { ok: false, error: error.message };
    if (!data) return { ok: false, error: 'not found' };
    return { ok: true, draft: data };
  }

  const q = await ytQueue(40);
  if (!q.ok) return q;
  const hit = (q.rows || []).find((x) => String(x.id).toLowerCase().startsWith(raw.toLowerCase()));
  if (!hit) return { ok: false, error: 'not found — use id from yt queue' };
  const { data, error } = await client.from('rq_youtube_drafts').select('*').eq('id', hit.id).maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: 'not found' };
  return { ok: true, draft: data };
}

export async function ytPack(id) {
  const got = await ytGet(id);
  if (!got.ok) return got;
  const d = got.draft;
  const tagLine =
    String(d.tags || '').trim() ||
    'Queen OS, Telegram bot, mobile automation, Vercel, Supabase, AI assistant';
  const pack = [
    'TITLE:',
    (d.title || 'Untitled').slice(0, 100),
    '',
    'DESCRIPTION:',
    String(d.description || '').trim(),
    '',
    '—',
    'Telegram: https://t.me/PasiyaMaxQueen_bot',
    'Site: https://pasiya-max-site.gt.tc',
    'Substack: https://pasindudananjaya.substack.com',
    '',
    'TAGS:',
    tagLine,
    '',
    '_Pack by Queen OS ' + VERSION + ' · paste in YouTube app · Founder upload_',
  ].join('\n');

  const client = sb();
  if (client) {
    await client
      .from('rq_youtube_drafts')
      .update({ pack_md: pack, status: 'packed', updated_at: new Date().toISOString() })
      .eq('id', d.id);
  }
  return { ok: true, id: d.id, title: d.title, pack };
}

export function formatQueue(rows) {
  if (!rows?.length) return '🎬 No drafts. `yt draft Title | description`';
  const lines = ['🎬 *YouTube queue* (' + rows.length + ')', ''];
  for (const r of rows) {
    lines.push(
      '· `' + String(r.id).slice(0, 8) + '` *' + (r.title || '').slice(0, 56) + '* · ' + (r.status || 'draft')
    );
  }
  lines.push('', '_`yt pack <id>` · `yt get <id>`_');
  return lines.join('\n');
}

export default {
  VERSION,
  youtubeHelp,
  ytDraft,
  ytQueue,
  ytGet,
  ytPack,
  formatQueue,
  channelUrl,
};
