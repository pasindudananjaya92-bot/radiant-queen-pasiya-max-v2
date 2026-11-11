import { createClient } from '@supabase/supabase-js';
import * as dc from './dashboardChat.js';

function sb() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

function uid() {
  return String(process.env.ADMIN_ID || process.env.FOUNDER_ID || 'founder')
    .split(/[\s,]+/)
    .filter(Boolean)[0] || 'founder';
}

export async function history(limit = 100, before = null) {
  const client = sb();
  if (!client) return { ok: false, messages: [], error: 'no supabase' };
  let q = client
    .from('dash_chat_messages')
    .select('id, role, content, tools, trust, latency_ms, created_at')
    .eq('user_id', uid())
    .order('created_at', { ascending: false })
    .limit(Math.min(Number(limit) || 100, 200));
  if (before) q = q.lt('created_at', before);
  const { data, error } = await q;
  if (error) return { ok: false, messages: [], error: error.message };
  const messages = (data || []).reverse();
  return { ok: true, messages, has_more: (data || []).length >= limit };
}

export async function send(message) {
  // Reuse Phase 4 chat handler (no 4096 hard truncate on store)
  const r = await dc.handleChat(message);
  try {
    const { emitEvent } = await import('./platformJobs.js');
    await emitEvent('chat.message', { ok: r.ok, latency_ms: r.latency_ms });
  } catch (_) {}
  return r;
}

export async function clearHistory() {
  const client = sb();
  if (!client) throw new Error('no supabase');
  const { error } = await client.from('dash_chat_messages').delete().eq('user_id', uid());
  if (error) throw new Error(error.message);
  return { ok: true };
}
