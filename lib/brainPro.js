import { createClient } from '@supabase/supabase-js';
import * as bm from './brainManager.js';

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

/** List with secrets always masked */
export async function listMasked(limit = 30) {
  const items = await bm.listBrain(limit);
  return items.map((x) => ({
    id: x.id,
    key: x.key,
    key_display: x.key_display,
    sensitivity: x.sensitivity,
    source: x.source,
    updated_at: x.updated_at,
    value: x.sensitivity === 'secret' ? '***' : x.value,
    masked: x.sensitivity === 'secret',
  }));
}

/** Reveal full value + audit log — Platform only */
export async function reveal(keyOrId) {
  const client = sb();
  if (!client) throw new Error('Supabase not configured');
  const q = String(keyOrId || '').trim();
  let row = null;
  const byId = await client.from('second_brain').select('*').eq('id', q).maybeSingle();
  if (byId.data) row = byId.data;
  if (!row) row = await bm.recall(q);
  if (!row) return { ok: false, error: 'not found' };
  try {
    await client.from('brain_reveal_audit').insert({
      user_id: uid(),
      brain_key: row.key || row.key_display,
    });
  } catch (_) {}
  return {
    ok: true,
    item: {
      id: row.id,
      key_display: row.key_display,
      value: row.value,
      sensitivity: row.sensitivity,
      updated_at: row.updated_at,
    },
  };
}

export async function search(q, limit = 20) {
  const all = await bm.listBrain(50);
  const n = String(q || '').toLowerCase().trim();
  if (!n) return listMasked(limit);
  return all
    .filter(
      (x) =>
        (x.key && x.key.includes(n)) ||
        (x.key_display && x.key_display.toLowerCase().includes(n)) ||
        (x.sensitivity !== 'secret' && String(x.value).toLowerCase().includes(n))
    )
    .slice(0, limit)
    .map((x) => ({
      id: x.id,
      key_display: x.key_display,
      sensitivity: x.sensitivity,
      value: x.sensitivity === 'secret' ? '***' : x.value,
      masked: x.sensitivity === 'secret',
      updated_at: x.updated_at,
    }));
}
