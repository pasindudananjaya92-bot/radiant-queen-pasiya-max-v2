/**
 * lib/pasiyaFs.js — PasiyaOS Virtual Filesystem (STEP 1)
 * Shared disk for desktop / term / ide / office / studio
 *
 * Upgrades beyond basic VFS:
 * - path normalize + jail (no .. escape)
 * - soft delete → /.Trash
 * - per-user quota (text bytes)
 * - seed standard PC folders
 * - stat / df / tree
 */
import { createClient } from '@supabase/supabase-js';

const MAX_TEXT_BYTES = Number(process.env.PASIYA_FS_QUOTA || 2_000_000); // ~2MB text/user free
const MAX_FILE_CHARS = 200_000;

function sb() {
  const url = process.env.SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** Normalize to absolute POSIX-like path under / */
export function normalizePath(input) {
  let p = String(input || '/').replace(/\\/g, '/').trim();
  if (!p.startsWith('/')) p = '/' + p;
  const parts = [];
  for (const seg of p.split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') {
      if (parts.length) parts.pop();
      continue;
    }
    // block weird segments
    if (/[^\w.\- ()\[\]]+/i.test(seg) && !/^[\w.\- ()\[\]]+$/i.test(seg)) {
      // allow unicode names but block path chars
      if (seg.includes('..') || seg.includes('/') || seg.includes('\\')) continue;
    }
    parts.push(seg.slice(0, 120));
  }
  return '/' + parts.join('/');
}

export function parentPath(path) {
  const p = normalizePath(path);
  if (p === '/') return '/';
  const i = p.lastIndexOf('/');
  return i <= 0 ? '/' : p.slice(0, i) || '/';
}

export function baseName(path) {
  const p = normalizePath(path);
  if (p === '/') return '/';
  const i = p.lastIndexOf('/');
  return p.slice(i + 1);
}

async function getRows(userId, pathEquals) {
  const client = sb();
  if (!client) return { ok: false, error: 'no supabase' };
  const { data, error } = await client
    .from('pasiya_fs')
    .select('*')
    .eq('user_id', String(userId))
    .eq('path', pathEquals)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  return { ok: true, row: data };
}

export async function ensureUserSeed(userId) {
  const client = sb();
  if (!client) return { ok: false, error: 'no supabase' };
  const uid = String(userId);
  const dirs = [
    '/',
    '/Desktop',
    '/Documents',
    '/Downloads',
    '/Pictures',
    '/Music',
    '/Videos',
    '/Projects',
    '/System',
    '/.Trash',
  ];
  for (const d of dirs) {
    const path = normalizePath(d);
    const existing = await getRows(uid, path);
    if (existing.ok && existing.row) continue;
    await client.from('pasiya_fs').upsert(
      {
        user_id: uid,
        path,
        type: 'dir',
        content: null,
        mime: null,
        size: 0,
        meta: { system: true },
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,path' }
    );
  }
  // welcome file
  const welcome = normalizePath('/Documents/Welcome.txt');
  const w = await getRows(uid, welcome);
  if (!w.row) {
    const text =
      'Welcome to PasiyaOS.\n\nThis is your shared disk.\nDesktop, Terminal, IDE, Office, and Studio all use this filesystem.\n\nTry:\n/fs ls /\n/fs cat /Documents/Welcome.txt\n/kernel\n';
    await client.from('pasiya_fs').upsert(
      {
        user_id: uid,
        path: welcome,
        type: 'file',
        content: text,
        mime: 'text/plain',
        size: text.length,
        meta: { system: true },
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,path' }
    );
  }
  return { ok: true, seeded: true };
}

export async function fsStat(userId, path) {
  const client = sb();
  if (!client) return { ok: false, error: 'no supabase' };
  await ensureUserSeed(userId);
  const p = normalizePath(path);
  const { data, error } = await client
    .from('pasiya_fs')
    .select('path,type,size,mime,updated_at,meta')
    .eq('user_id', String(userId))
    .eq('path', p)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: 'not found: ' + p };
  return { ok: true, stat: data };
}

export async function fsList(userId, path) {
  const client = sb();
  if (!client) return { ok: false, error: 'no supabase' };
  await ensureUserSeed(userId);
  const p = normalizePath(path || '/');
  // list children: path prefix
  const { data, error } = await client
    .from('pasiya_fs')
    .select('path,type,size,mime,updated_at')
    .eq('user_id', String(userId))
    .like('path', p === '/' ? '/%' : p + '/%')
    .order('type', { ascending: true })
    .order('path', { ascending: true })
    .limit(200);
  if (error) return { ok: false, error: error.message };
  const depth = p === '/' ? 1 : p.split('/').length;
  const entries = [];
  for (const row of data || []) {
    const parts = row.path.split('/').filter(Boolean);
    // direct children only
    if (p === '/') {
      if (parts.length === 1) entries.push(row);
    } else {
      if (parts.length === depth) {
        // child of p
        if (row.path.startsWith(p + '/')) entries.push(row);
      }
    }
  }
  // fix filter for non-root
  const filtered =
    p === '/'
      ? (data || []).filter((r) => r.path !== '/' && r.path.split('/').filter(Boolean).length === 1)
      : (data || []).filter((r) => {
          if (!r.path.startsWith(p + '/')) return false;
          const rest = r.path.slice(p.length + 1);
          return rest && !rest.includes('/');
        });
  return { ok: true, path: p, entries: filtered };
}

export async function fsRead(userId, path) {
  const client = sb();
  if (!client) return { ok: false, error: 'no supabase' };
  const p = normalizePath(path);
  const { data, error } = await client
    .from('pasiya_fs')
    .select('*')
    .eq('user_id', String(userId))
    .eq('path', p)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: 'not found' };
  if (data.type === 'dir') return { ok: false, error: 'is a directory' };
  return {
    ok: true,
    path: p,
    content: data.content || '',
    mime: data.mime,
    size: data.size,
    storage_url: data.storage_url,
  };
}

export async function fsQuotaUsed(userId) {
  const client = sb();
  if (!client) return { ok: false, error: 'no supabase' };
  const { data, error } = await client
    .from('pasiya_fs')
    .select('size')
    .eq('user_id', String(userId))
    .eq('type', 'file');
  if (error) return { ok: false, error: error.message };
  const used = (data || []).reduce((a, r) => a + (Number(r.size) || 0), 0);
  return { ok: true, used, max: MAX_TEXT_BYTES, left: Math.max(0, MAX_TEXT_BYTES - used) };
}

export async function fsWrite(userId, path, content, mime = 'text/plain') {
  const client = sb();
  if (!client) return { ok: false, error: 'no supabase' };
  await ensureUserSeed(userId);
  const p = normalizePath(path);
  if (p === '/' || p.startsWith('/System')) {
    // allow System only for meta notes, block overwrite of dirs
  }
  if (p === '/') return { ok: false, error: 'cannot write to root dir' };
  const text = String(content ?? '').slice(0, MAX_FILE_CHARS);
  const q = await fsQuotaUsed(userId);
  if (q.ok) {
    // approximate: if replacing, ignore old size for simplicity
    if (text.length > q.left + 5000) {
      return { ok: false, error: 'quota exceeded (' + q.used + '/' + q.max + ' bytes)' };
    }
  }
  // ensure parent exists
  const parent = parentPath(p);
  if (parent !== '/') {
    const pe = await getRows(userId, parent);
    if (!pe.row) {
      // auto mkdir parents
      await fsMkdir(userId, parent);
    }
  }
  const { error } = await client.from('pasiya_fs').upsert(
    {
      user_id: String(userId),
      path: p,
      type: 'file',
      content: text,
      mime: mime || 'text/plain',
      size: text.length,
      storage_url: null,
      meta: {},
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,path' }
  );
  if (error) return { ok: false, error: error.message };
  return { ok: true, path: p, size: text.length };
}

export async function fsMkdir(userId, path) {
  const client = sb();
  if (!client) return { ok: false, error: 'no supabase' };
  await ensureUserSeed(userId);
  const p = normalizePath(path);
  if (p === '/') return { ok: true, path: p };
  // parents
  const parts = p.split('/').filter(Boolean);
  let cur = '';
  for (const seg of parts) {
    cur += '/' + seg;
    const ex = await getRows(userId, cur);
    if (ex.row) {
      if (ex.row.type !== 'dir') return { ok: false, error: 'file in path: ' + cur };
      continue;
    }
    const { error } = await client.from('pasiya_fs').upsert(
      {
        user_id: String(userId),
        path: cur,
        type: 'dir',
        content: null,
        size: 0,
        mime: null,
        meta: {},
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,path' }
    );
    if (error) return { ok: false, error: error.message };
  }
  return { ok: true, path: p };
}

export async function fsRm(userId, path, hard = false) {
  const client = sb();
  if (!client) return { ok: false, error: 'no supabase' };
  const p = normalizePath(path);
  if (p === '/' || p === '/.Trash') return { ok: false, error: 'protected path' };
  if (hard) {
    // delete self + descendants
    const { error } = await client
      .from('pasiya_fs')
      .delete()
      .eq('user_id', String(userId))
      .or('path.eq.' + p + ',path.like.' + p + '/%');
    if (error) return { ok: false, error: error.message };
    return { ok: true, removed: p, mode: 'hard' };
  }
  // soft → trash
  const name = baseName(p);
  const dest = normalizePath('/.Trash/' + Date.now().toString(36) + '_' + name);
  const { data: row } = await client
    .from('pasiya_fs')
    .select('*')
    .eq('user_id', String(userId))
    .eq('path', p)
    .maybeSingle();
  if (!row) return { ok: false, error: 'not found' };
  // move node
  await client
    .from('pasiya_fs')
    .update({ path: dest, updated_at: new Date().toISOString(), meta: { ...(row.meta || {}), trashedFrom: p } })
    .eq('user_id', String(userId))
    .eq('path', p);
  return { ok: true, removed: p, trash: dest, mode: 'soft' };
}

export async function fsTree(userId, path = '/', maxDepth = 3) {
  const client = sb();
  if (!client) return { ok: false, error: 'no supabase' };
  await ensureUserSeed(userId);
  const p = normalizePath(path);
  const { data, error } = await client
    .from('pasiya_fs')
    .select('path,type,size')
    .eq('user_id', String(userId))
    .or(p === '/' ? 'path.neq.null' : 'path.eq.' + p + ',path.like.' + p + '/%')
    .order('path')
    .limit(300);
  if (error) return { ok: false, error: error.message };
  const lines = [];
  for (const r of data || []) {
    if (p !== '/' && r.path !== p && !r.path.startsWith(p + '/')) continue;
    const rel = r.path;
    const depth = rel.split('/').filter(Boolean).length;
    if (depth > maxDepth + (p === '/' ? 0 : p.split('/').filter(Boolean).length)) continue;
    const indent = '  '.repeat(Math.max(0, depth - 1));
    lines.push(indent + (r.type === 'dir' ? '📁 ' : '📄 ') + rel + (r.type === 'file' ? ' (' + r.size + 'b)' : ''));
  }
  return { ok: true, tree: lines.join('\n') };
}

export default {
  normalizePath,
  parentPath,
  baseName,
  ensureUserSeed,
  fsStat,
  fsList,
  fsRead,
  fsWrite,
  fsMkdir,
  fsRm,
  fsTree,
  fsQuotaUsed,
};
