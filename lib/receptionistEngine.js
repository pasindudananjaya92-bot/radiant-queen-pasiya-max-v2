/**
 * Wave 32A — Queen Receptionist (Public Secretary foundation)
 */
import { createClient } from '@supabase/supabase-js';

export const VERSION = '32A';

function sb() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

function founderIds() {
  return String(process.env.ADMIN_ID || process.env.FOUNDER_ID || '')
    .split(/[\s,]+/)
    .filter(Boolean);
}

export function isFounderCtx(ctx) {
  const ids = founderIds();
  const uid = String(ctx?.from?.id || ctx?.message?.from?.id || '');
  if (!ids.length) return true;
  return ids.includes(uid);
}

export function receptionistHelp() {
  return [
    '🛎️ *Queen Receptionist · ' + VERSION + '*',
    'Public secretary foundation (draft-safe)',
    '',
    '• `inbox` / `inbox list` — new messages',
    '• `inbox get <id>`',
    '• `inbox read <id>` · `inbox archive <id>`',
    '• `inbox draft <id> | reply text` — save draft only',
    '• `channel draft <text>` — preview',
    '• `channel post <text>` — post if TELEGRAM_CHANNEL_ID set',
    '',
    'Non-Founder DMs auto-log to inbox + notify you.',
    '_No auto long replies. No money moves._',
  ].join('\n');
}

export async function inboxAdd({
  source = 'telegram',
  visitor_id = '',
  visitor_name = '',
  contact = '',
  message = '',
  meta = {},
}) {
  const client = sb();
  if (!client) return { ok: false, error: 'Supabase not configured' };
  const row = {
    source: String(source || 'telegram').slice(0, 40),
    visitor_id: String(visitor_id || '').slice(0, 80),
    visitor_name: String(visitor_name || '').slice(0, 120),
    contact: String(contact || '').slice(0, 200),
    message: String(message || '').slice(0, 3500),
    status: 'new',
    meta: meta || {},
  };
  const { data, error } = await client
    .from('rq_inbox')
    .insert(row)
    .select('id,source,visitor_name,status,created_at')
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, item: data };
}

export async function inboxList({ status = 'new', limit = 15 } = {}) {
  const client = sb();
  if (!client) return { ok: false, error: 'Supabase not configured' };
  let q = client
    .from('rq_inbox')
    .select('id,source,visitor_id,visitor_name,contact,message,status,draft_reply,created_at')
    .order('created_at', { ascending: false })
    .limit(Math.min(40, limit));
  if (status && status !== 'all') q = q.eq('status', status);
  const { data, error } = await q;
  if (error) return { ok: false, error: error.message };
  return { ok: true, rows: data || [] };
}

export async function inboxGet(id) {
  const client = sb();
  if (!client) return { ok: false, error: 'Supabase not configured' };
  const { data, error } = await client.from('rq_inbox').select('*').eq('id', id).maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) {
    const all = await inboxList({ status: 'all', limit: 40 });
    const hit = (all.rows || []).find((x) => String(x.id).startsWith(String(id)));
    if (!hit) return { ok: false, error: 'not found' };
    return inboxGet(hit.id);
  }
  return { ok: true, item: data };
}

export async function inboxSetStatus(id, status) {
  const client = sb();
  if (!client) return { ok: false, error: 'Supabase not configured' };
  const st = String(status || '').toLowerCase();
  if (!['new', 'read', 'replied', 'archived'].includes(st)) {
    return { ok: false, error: 'status: new|read|replied|archived' };
  }
  const got = await inboxGet(id);
  if (!got.ok) return got;
  const { data, error } = await client
    .from('rq_inbox')
    .update({ status: st, updated_at: new Date().toISOString() })
    .eq('id', got.item.id)
    .select('id,status')
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, item: data };
}

export async function inboxSaveDraft(id, draft) {
  const client = sb();
  if (!client) return { ok: false, error: 'Supabase not configured' };
  const got = await inboxGet(id);
  if (!got.ok) return got;
  const { data, error } = await client
    .from('rq_inbox')
    .update({
      draft_reply: String(draft || '').slice(0, 3500),
      status: 'read',
      updated_at: new Date().toISOString(),
    })
    .eq('id', got.item.id)
    .select('id,status,draft_reply')
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, item: data };
}

export function formatInboxList(rows) {
  if (!rows?.length) return '🛎️ Inbox empty. Visitor DMs / site form appear here.';
  const lines = ['🛎️ *Inbox* (' + rows.length + ')', ''];
  for (const r of rows) {
    const short = String(r.id).slice(0, 8);
    const who = r.visitor_name || r.visitor_id || r.contact || 'visitor';
    const msg = String(r.message || '').replace(/\s+/g, ' ').slice(0, 80);
    lines.push('· `' + short + '` *' + who + '* · ' + (r.status || 'new'));
    lines.push('  ' + msg + (msg.length >= 80 ? '…' : ''));
  }
  lines.push('', '_`inbox get <id>` · `inbox draft <id> | text`_');
  return lines.join('\n');
}

export async function notifyFounder(text) {
  const token = process.env.BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
  const admin = founderIds()[0];
  if (!token || !admin) return { ok: false, error: 'no token/admin' };
  try {
    const r = await fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: admin,
        text: String(text || '').slice(0, 3500),
        disable_web_page_preview: true,
      }),
    });
    const j = await r.json();
    return { ok: !!j.ok, error: j.description };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

export async function handlePublicDm(ctx, text) {
  const from = ctx?.from || {};
  const name = [from.first_name, from.last_name].filter(Boolean).join(' ').trim();
  const uname = from.username ? '@' + from.username : '';
  const saved = await inboxAdd({
    source: 'telegram',
    visitor_id: String(from.id || ''),
    visitor_name: name || uname || 'Visitor',
    contact: uname || String(from.id || ''),
    message: text,
    meta: { chat_id: ctx?.chat?.id },
  });
  if (!saved.ok) {
    return { ok: false, visitorReply: 'Please try again later.', error: saved.error };
  }
  const short = String(saved.item.id).slice(0, 8);
  await notifyFounder(
    '🛎️ New inbox `' + short + '`\nFrom: ' + (name || uname || from.id) + '\n' +
      String(text).slice(0, 500) + '\n\ninbox get ' + short
  );
  try {
    const leads = await import('./leadsManager.js');
    await leads.leadAdd({
      name: name || uname || 'TG ' + from.id,
      contact: uname || String(from.id),
      note: 'inbox:' + short + ' · ' + String(text).slice(0, 200),
    });
  } catch (_) {}
  const receiptOff = String(process.env.RECEPTIONIST_RECEIPT || '1') === '0';
  return {
    ok: true,
    id: saved.item.id,
    visitorReply: receiptOff
      ? null
      : '✅ Message received. Founder will review soon.\n(Automated receipt · Queen OS)',
  };
}

export async function channelPost(text, { draftOnly = false } = {}) {
  const body = String(text || '').trim();
  if (!body) return { ok: false, error: 'empty' };
  const channel = String(process.env.TELEGRAM_CHANNEL_ID || '').trim();
  if (draftOnly || !channel) {
    return {
      ok: true,
      draft: true,
      text: body,
      note: channel
        ? 'Draft only — use channel post to send'
        : 'Set TELEGRAM_CHANNEL_ID (e.g. -100…) to enable post',
    };
  }
  const token = process.env.BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return { ok: false, error: 'BOT_TOKEN missing' };
  const r = await fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: channel, text: body.slice(0, 4000) }),
  });
  const j = await r.json();
  if (!j.ok) return { ok: false, error: j.description || 'send failed' };
  return { ok: true, draft: false, message_id: j.result?.message_id };
}

export default {
  VERSION,
  receptionistHelp,
  isFounderCtx,
  inboxAdd,
  inboxList,
  inboxGet,
  inboxSetStatus,
  inboxSaveDraft,
  formatInboxList,
  notifyFounder,
  handlePublicDm,
  channelPost,
};
