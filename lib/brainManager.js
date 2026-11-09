import { createClient } from '@supabase/supabase-js';

function sb() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

function founderId() {
  return String(process.env.ADMIN_ID || process.env.FOUNDER_ID || 'founder')
    .split(/[\s,]+/)
    .filter(Boolean)[0] || 'founder';
}

function normalizeKey(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isSecretKey(key) {
  return /password|passwd|pin|otp|secret|token|nic|cvv|private/i.test(key);
}

/** Parse "remember X is Y" / "remember X = Y" / "remember X: Y" */
export function parseRemember(text) {
  let t = String(text || '').replace(/^remember\s+/i, '').trim();
  if (!t) return null;
  let m = t.match(/^(.+?)\s*=\s*(.+)$/);
  if (m) return { key_display: m[1].trim(), value: m[2].trim() };
  m = t.match(/^(.+?)\s*:\s*(.+)$/);
  if (m) return { key_display: m[1].trim(), value: m[2].trim() };
  m = t.match(/^(.+?)\s+is\s+(.+)$/i);
  if (m) return { key_display: m[1].trim(), value: m[2].trim() };
  // "My Wifi Password is Queen123"
  m = t.match(/^my\s+(.+?)\s+is\s+(.+)$/i);
  if (m) return { key_display: m[1].trim(), value: m[2].trim() };
  // fallback: whole thing as note
  return { key_display: t.slice(0, 80), value: t };
}

export async function remember({ key_display, value, source = 'text', media_path = null }) {
  const client = sb();
  if (!client) throw new Error('Supabase not configured');
  const key = normalizeKey(key_display);
  if (!key || !value) throw new Error('key and value required');
  const row = {
    user_id: founderId(),
    key,
    key_display: String(key_display).slice(0, 120),
    value: String(value).slice(0, 4000),
    category: isSecretKey(key) ? 'secret' : 'note',
    sensitivity: isSecretKey(key) ? 'secret' : 'normal',
    source,
    media_path,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await client
    .from('second_brain')
    .upsert(row, { onConflict: 'user_id,key' })
    .select('key_display, value, sensitivity, updated_at')
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function recall(query) {
  const client = sb();
  if (!client) throw new Error('Supabase not configured');
  const q = normalizeKey(
    String(query || '')
      .replace(/^(what\s+is\s+my|what\s+is|what's\s+my|whats\s+my)\s+/i, '')
      .replace(/\?+$/, '')
  );
  if (!q) return null;
  // exact
  let { data } = await client.from('second_brain').select('*').eq('user_id', founderId()).eq('key', q).maybeSingle();
  if (data) return data;
  // contains
  const { data: list } = await client
    .from('second_brain')
    .select('*')
    .eq('user_id', founderId())
    .or(`key.ilike.%${q}%,key_display.ilike.%${q}%`)
    .limit(5);
  if (list && list.length) return list[0];
  return null;
}

export async function forget(query) {
  const client = sb();
  if (!client) throw new Error('Supabase not configured');
  const q = normalizeKey(query);
  const row = await recall(q);
  if (!row) return null;
  await client.from('second_brain').delete().eq('id', row.id);
  return row;
}

export async function listBrain(limit = 20) {
  const client = sb();
  if (!client) throw new Error('Supabase not configured');
  const { data, error } = await client
    .from('second_brain')
    .select('id, key, key_display, value, sensitivity, updated_at, source')
    .eq('user_id', founderId())
    .order('updated_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data || [];
}

export function helpText() {
  return (
    '👑 SECOND BRAIN\n\n' +
    '• remember <fact>\n' +
    '• remember key = value\n' +
    '• what is my <thing>?\n' +
    '• forget <thing>\n' +
    '• brain list\n\n' +
    'Example:\nremember My Wifi Password is Queen123'
  );
}
