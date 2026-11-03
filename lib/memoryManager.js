// lib/memoryManager.js
// Agent-22 — Memory Brain (pgvector + Supabase)
// Version: 2026-11-03

import { createClient } from '@supabase/supabase-js';

const TABLE = 'rq_memories';

function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  return createClient(url, key, { auth: { persistSession: false } });
}

function isConfigured() {
  try {
    getSupabase();
    return true;
  } catch {
    return false;
  }
}

/** Simple hash embedding fallback (no external API needed) */
function simpleEmbed(text) {
  const str = String(text || '').toLowerCase().slice(0, 2000);
  const vec = new Array(64).fill(0);
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    vec[i % 64] += code * (1 + (i % 7));
  }
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
  return vec.map(v => Number((v / norm).toFixed(6)));
}

async function remember(uid, content, tags = []) {
  const sb = getSupabase();
  const embedding = simpleEmbed(content);
  const { data, error } = await sb.from(TABLE).insert({
    user_id: String(uid),
    content: String(content).slice(0, 4000),
    tags: tags || [],
    embedding,
    created_at: new Date().toISOString(),
  }).select('id').single();
  if (error) throw error;
  return data;
}

async function search(uid, query, limit = 5) {
  const sb = getSupabase();
  // Fallback: text search if rpc not ready
  const { data, error } = await sb
    .from(TABLE)
    .select('id, content, tags, created_at')
    .eq('user_id', String(uid))
    .ilike('content', `%${query.slice(0, 80)}%`)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

async function listRecent(uid, limit = 10) {
  const sb = getSupabase();
  const { data, error } = await sb
    .from(TABLE)
    .select('id, content, tags, created_at')
    .eq('user_id', String(uid))
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

async function forget(uid, id) {
  const sb = getSupabase();
  const { error } = await sb.from(TABLE).delete().eq('id', id).eq('user_id', String(uid));
  if (error) throw error;
  return true;
}

async function stats(uid) {
  const sb = getSupabase();
  const { count, error } = await sb
    .from(TABLE)
    .select('*', { count: 'exact', head: true })
    .eq('user_id', String(uid));
  if (error) throw error;
  return { count: count || 0 };
}

export {
  isConfigured,
  remember,
  search,
  listRecent,
  forget,
  stats,
  simpleEmbed,
};
