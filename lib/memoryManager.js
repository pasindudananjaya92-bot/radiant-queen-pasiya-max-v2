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
  const q = String(query || '').trim();
  const lim = Math.min(20, Math.max(1, limit));

  // Try RPC vector search if available
  try {
    const embedding = simpleEmbed(q);
    const { data: vec, error: vErr } = await sb.rpc('match_rq_memories', {
      query_embedding: embedding,
      match_user: String(uid),
      match_count: lim,
    });
    if (!vErr && vec?.length) return vec;
  } catch (_) {}

  // Ranked text fallback over recent rows
  const { data, error } = await sb
    .from(TABLE)
    .select('id, content, tags, created_at')
    .eq('user_id', String(uid))
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  const qLow = q.toLowerCase();
  const tokens = qLow.split(/\s+/).filter((w) => w.length > 2);
  const ranked = (data || [])
    .map((r) => {
      const c = String(r.content || '').toLowerCase();
      let score = 0;
      if (qLow && c.includes(qLow.slice(0, 48))) score += 6;
      for (const t of tokens) if (c.includes(t)) score += 1;
      return { ...r, _score: score };
    })
    .filter((r) => r._score > 0)
    .sort((a, b) => b._score - a._score)
    .slice(0, lim);
  if (ranked.length) return ranked;

  // last resort: ilike
  const { data: d2 } = await sb
    .from(TABLE)
    .select('id, content, tags, created_at')
    .eq('user_id', String(uid))
    .ilike('content', `%${q.slice(0, 80).replace(/%/g, '')}%`)
    .order('created_at', { ascending: false })
    .limit(lim);
  return d2 || [];
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
