/**
 * lib/vaultClient.js — simple founder vault (XOR + base64, better with pgsodium later)
 * NOT military grade — founder-only Telegram access is the main gate.
 */
import { createClient } from '@supabase/supabase-js';

function sb() {
  const url = process.env.SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

function vaultKey() {
  return process.env.VAULT_MASTER_KEY || process.env.BOT_TOKEN || 'rq-vault';
}

export function seal(plain) {
  const k = vaultKey();
  const raw = String(plain);
  const out = [];
  for (let i = 0; i < raw.length; i++) {
    out.push(String.fromCharCode(raw.charCodeAt(i) ^ k.charCodeAt(i % k.length)));
  }
  return Buffer.from(out.join(''), 'binary').toString('base64');
}

export function unseal(sealed) {
  try {
    const k = vaultKey();
    const raw = Buffer.from(String(sealed), 'base64').toString('binary');
    const out = [];
    for (let i = 0; i < raw.length; i++) {
      out.push(String.fromCharCode(raw.charCodeAt(i) ^ k.charCodeAt(i % k.length)));
    }
    return out.join('');
  } catch (_) {
    return '';
  }
}

export async function vaultSet(name, value) {
  const client = sb();
  const key = 'vault_' + String(name || '').toUpperCase().replace(/[^A-Z0-9_]/g, '');
  if (!key || key === 'vault_') return { ok: false, error: 'bad name' };
  const sealed = seal(value);
  if (client) {
    try {
      await client.from('rq_vault_secrets').upsert({
        name: key.replace(/^vault_/, ''),
        sealed,
        updated_at: new Date().toISOString(),
      });
    } catch (_) {}
    await client.from('rq_bot_settings').upsert({
      key,
      value: sealed,
      updated_at: new Date().toISOString(),
    });
  }
  return { ok: true, name: key.replace(/^vault_/, '') };
}

export async function vaultGet(name) {
  const client = sb();
  if (!client) return { ok: false, error: 'no supabase' };
  const key = 'vault_' + String(name || '').toUpperCase().replace(/[^A-Z0-9_]/g, '');
  const { data } = await client.from('rq_bot_settings').select('value').eq('key', key).maybeSingle();
  if (!data?.value) return { ok: false, error: 'not found' };
  return { ok: true, name: name, value: unseal(data.value) };
}

export async function vaultList() {
  const client = sb();
  if (!client) return { ok: false, error: 'no supabase' };
  const { data } = await client.from('rq_bot_settings').select('key').like('key', 'vault_%').limit(50);
  return {
    ok: true,
    keys: (data || []).map((r) => String(r.key).replace(/^vault_/, '')),
  };
}

export default { seal, unseal, vaultSet, vaultGet, vaultList };
