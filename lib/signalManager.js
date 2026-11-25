/**
 * Wave 36B · Supabase Signal Desk
 * Free-tier event log. No paid Realtime required.
 * Client pattern matches blogManager / youtubeManager (ESM import).
 */
import { createClient } from '@supabase/supabase-js';

export const VERSION = '36B';

let _client = null;

function getClient() {
  if (_client) return _client;
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    '';
  if (!url || !key) return null;
  try {
    _client = createClient(url, key, { auth: { persistSession: false } });
    return _client;
  } catch (_) {
    return null;
  }
}

export async function emitSignal(p) {
  const client = getClient();
  if (!client) return { ok: false, error: 'supabase_missing' };
  const row = {
    kind: String(p.kind || 'info').slice(0, 64),
    source: String(p.source || 'system').slice(0, 64),
    title: String(p.title || 'signal').slice(0, 200),
    body: p.body ? String(p.body).slice(0, 2000) : null,
    level: ['info', 'warn', 'error', 'ok'].includes(p.level) ? p.level : 'info',
    meta: p.meta && typeof p.meta === 'object' ? p.meta : {},
    seen: false,
  };
  try {
    const { data, error } = await client.from('rq_signals').insert(row).select('id').single();
    if (error) return { ok: false, error: error.message };
    return { ok: true, id: data?.id };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

export async function listSignals({ limit = 15, unseenOnly = false } = {}) {
  const client = getClient();
  if (!client) return { ok: false, error: 'supabase_missing', rows: [] };
  try {
    let q = client
      .from('rq_signals')
      .select('id, kind, source, title, body, level, seen, created_at')
      .order('created_at', { ascending: false })
      .limit(Math.min(50, Math.max(1, limit)));
    if (unseenOnly) q = q.eq('seen', false);
    const { data, error } = await q;
    if (error) return { ok: false, error: error.message, rows: [] };
    return { ok: true, rows: data || [] };
  } catch (e) {
    return { ok: false, error: e.message || String(e), rows: [] };
  }
}

export async function markSeen(ids) {
  const client = getClient();
  if (!client) return { ok: false, error: 'supabase_missing' };
  try {
    if (!ids || !ids.length) {
      const { error } = await client.from('rq_signals').update({ seen: true }).eq('seen', false);
      if (error) return { ok: false, error: error.message };
      return { ok: true, mode: 'all' };
    }
    const { error } = await client.from('rq_signals').update({ seen: true }).in('id', ids);
    if (error) return { ok: false, error: error.message };
    return { ok: true, mode: 'ids', count: ids.length };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

export async function clearOld({ days = 14 } = {}) {
  const client = getClient();
  if (!client) return { ok: false, error: 'supabase_missing' };
  const cutoff = new Date(Date.now() - days * 864e5).toISOString();
  try {
    const { error, count } = await client
      .from('rq_signals')
      .delete({ count: 'exact' })
      .lt('created_at', cutoff);
    if (error) return { ok: false, error: error.message };
    return { ok: true, deleted: count ?? 0 };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

export async function status() {
  const client = getClient();
  if (!client) {
    return { ok: false, version: VERSION, supabase: false, line: '❌ Supabase not configured' };
  }
  try {
    const { count: total, error: e1 } = await client
      .from('rq_signals')
      .select('*', { count: 'exact', head: true });
    if (e1) {
      return {
        ok: false,
        version: VERSION,
        supabase: true,
        error: e1.message,
        line: `⚠️ Signal status error: ${e1.message}`,
      };
    }
    const { count: unseen, error: e2 } = await client
      .from('rq_signals')
      .select('*', { count: 'exact', head: true })
      .eq('seen', false);
    if (e2) {
      return {
        ok: false,
        version: VERSION,
        supabase: true,
        error: e2.message,
        line: `⚠️ Signal status error: ${e2.message}`,
      };
    }
    return {
      ok: true,
      version: VERSION,
      supabase: true,
      total: total ?? 0,
      unseen: unseen ?? 0,
      line: `✅ Signal desk online · total ${total ?? 0} · unseen ${unseen ?? 0}`,
    };
  } catch (e) {
    return {
      ok: false,
      version: VERSION,
      supabase: true,
      error: e.message,
      line: `⚠️ Signal status error: ${e.message}`,
    };
  }
}

export function levelIcon(level) {
  if (level === 'error') return '🔴';
  if (level === 'warn') return '🟡';
  if (level === 'ok') return '🟢';
  return '🔵';
}

export function formatList(rows) {
  if (!rows || !rows.length) return '📭 No signals yet.\nTry: `signal test`';
  const lines = rows.slice(0, 15).map((r, i) => {
    const id = String(r.id || '').slice(0, 8);
    const when = r.created_at
      ? new Date(r.created_at).toISOString().slice(0, 16).replace('T', ' ')
      : '';
    const seen = r.seen ? '' : ' · NEW';
    return `${i + 1}. ${levelIcon(r.level)} *${r.title}*${seen}\n   \`${id}\` · ${r.source}/${r.kind} · ${when}`;
  });
  return `📡 *Signals* (${rows.length})\n\n` + lines.join('\n');
}

export function helpText() {
  return (
    `📡 *Signal Desk · ${VERSION}*\n` +
    `Supabase event log · free · no paid Realtime\n\n` +
    `• \`signal help\` — this menu\n` +
    `• \`signal status\` — totals / unseen\n` +
    `• \`signal list\` — latest signals\n` +
    `• \`signal unseen\` — only unread\n` +
    `• \`signal read\` — mark all seen\n` +
    `• \`signal test\` — write a test signal\n` +
    `• \`signal clear\` — delete signals older than 14d\n\n` +
    `_Other modules can emitSignal() into this desk._\n` +
    `_Unseen count can surface in morning pack / queen pulse._`
  );
}
