/**
 * lib/supaAdmin.js — Supabase data admin via service role
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Note: Full Management API needs access token; free path uses PostgREST + SQL via rpc if available
 */
import { createClient } from '@supabase/supabase-js';

function client() {
  const url = process.env.SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function listTables() {
  const sb = client();
  if (!sb) return { ok: false, error: 'SUPABASE_URL / SERVICE_ROLE missing' };
  // Try information_schema via rpc or known tables probe
  const known = [
    'rq_bot_settings',
    'rq_embeddings',
    'rq_knowledge',
    'rq_watches',
    'rq_tracks',
    'rq_webchat_logs',
    'rq_voice_samples',
    'rq_dev_audit',
    'rq_vault_secrets',
    'rq_webhook_logs',
  ];
  const found = [];
  for (const t of known) {
    try {
      const { error, count } = await sb.from(t).select('*', { head: true, count: 'exact' });
      if (!error) found.push({ table: t, count: count ?? null });
    } catch (_) {}
  }
  return { ok: true, tables: found, note: 'Probed known RQ tables (service role)' };
}

export async function tableCount(name) {
  const sb = client();
  if (!sb) return { ok: false, error: 'no supabase' };
  const t = String(name || '').replace(/[^a-zA-Z0-9_]/g, '');
  if (!t) return { ok: false, error: 'table name required' };
  const { count, error } = await sb.from(t).select('*', { head: true, count: 'exact' });
  if (error) return { ok: false, error: error.message };
  return { ok: true, table: t, count };
}

export async function safeSelect(table, limit = 5) {
  const sb = client();
  if (!sb) return { ok: false, error: 'no supabase' };
  const t = String(table || '').replace(/[^a-zA-Z0-9_]/g, '');
  const { data, error } = await sb.from(t).select('*').limit(Math.min(20, limit));
  if (error) return { ok: false, error: error.message };
  return { ok: true, table: t, rows: data };
}

/** Block destructive SQL keywords for /supa sql */
export function isReadOnlySql(sql) {
  const s = String(sql || '').toLowerCase();
  const bad = [
    'insert ',
    'update ',
    'delete ',
    'drop ',
    'alter ',
    'truncate ',
    'create ',
    'grant ',
    'revoke ',
    'execute ',
  ];
  return !bad.some((b) => s.includes(b));
}

export async function listStorageBuckets() {
  const sb = client();
  if (!sb) return { ok: false, error: 'no supabase' };
  const { data, error } = await sb.storage.listBuckets();
  if (error) return { ok: false, error: error.message };
  return {
    ok: true,
    buckets: (data || []).map((b) => ({ id: b.id, name: b.name, public: b.public })),
  };
}

export async function backupSettings() {
  const sb = client();
  if (!sb) return { ok: false, error: 'no supabase' };
  const { data, error } = await sb.from('rq_bot_settings').select('key,value,updated_at').limit(500);
  if (error) return { ok: false, error: error.message };
  return { ok: true, rows: data, count: (data || []).length };
}

export async function auditLog(action, detail) {
  const sb = client();
  if (!sb) return;
  try {
    await sb.from('rq_dev_audit').insert({
      action: String(action).slice(0, 80),
      detail: String(detail || '').slice(0, 2000),
      created_at: new Date().toISOString(),
    });
  } catch (_) {
    // fallback settings
    try {
      await sb.from('rq_bot_settings').upsert({
        key: 'audit_' + Date.now().toString(36),
        value: JSON.stringify({ action, detail: String(detail).slice(0, 500), at: new Date().toISOString() }),
        updated_at: new Date().toISOString(),
      });
    } catch (__) {}
  }
}

export default {
  client,
  listTables,
  tableCount,
  safeSelect,
  isReadOnlySql,
  listStorageBuckets,
  backupSettings,
  auditLog,
};
