// lib/vaultManager.js — Agent-21 Supabase Storage Vault (P6D list fix)
import { createClient } from '@supabase/supabase-js';

const BUCKET = process.env.VAULT_BUCKET || 'vault';

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

async function ensureBucket() {
  const sb = getSupabase();
  const { data, error } = await sb.storage.listBuckets();
  if (error) throw error;
  const exists = (data || []).some((b) => b.name === BUCKET);
  if (!exists) {
    const { error: createErr } = await sb.storage.createBucket(BUCKET, {
      public: false,
      fileSizeLimit: 50 * 1024 * 1024,
    });
    if (createErr && !String(createErr.message || '').includes('already')) throw createErr;
  }
}

/**
 * List files. Walks folders (Supabase folders have id=null and were previously dropped).
 * Returns objects with .name = full path inside bucket.
 */
async function listFiles(prefix = '', depth = 0) {
  await ensureBucket();
  const sb = getSupabase();
  const { data, error } = await sb.storage.from(BUCKET).list(prefix || '', {
    limit: 100,
    offset: 0,
  });
  if (error) throw error;

  const out = [];
  for (const f of data || []) {
    if (!f?.name || f.name === '.emptyFolderPlaceholder') continue;
    const path = prefix ? `${prefix.replace(/\/$/, '')}/${f.name}` : f.name;
    // Folder heuristic: null id OR null metadata without size
    const isFolder = f.id == null || (f.metadata == null && !f.size && depth < 4);
    if (isFolder && f.id == null && depth < 4) {
      try {
        const nested = await listFiles(path, depth + 1);
        out.push(...nested);
      } catch (_) {
        /* skip unreadable prefix */
      }
      continue;
    }
    // File (or leaf)
    if (f.id != null || f.metadata != null || typeof f.size === 'number') {
      out.push({
        ...f,
        name: path,
        path,
        size: f.metadata?.size ?? f.size ?? null,
      });
    } else if (depth < 4) {
      // ambiguous — try as folder once
      try {
        const nested = await listFiles(path, depth + 1);
        if (nested.length) out.push(...nested);
        else out.push({ ...f, name: path, path });
      } catch (_) {
        out.push({ ...f, name: path, path });
      }
    }
  }
  return out;
}

async function getSignedUrl(path, expiresSec = 3600) {
  await ensureBucket();
  const sb = getSupabase();
  const clean = String(path || '').replace(/^\/+/, '');
  const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(clean, expiresSec);
  if (error) throw error;
  return data?.signedUrl || null;
}

async function uploadBuffer(path, buffer, contentType = 'application/octet-stream') {
  await ensureBucket();
  const sb = getSupabase();
  const clean = String(path || '').replace(/^\/+/, '');
  const { data, error } = await sb.storage.from(BUCKET).upload(clean, buffer, {
    contentType,
    upsert: true,
  });
  if (error) throw error;
  return data;
}

async function deleteFile(path) {
  await ensureBucket();
  const sb = getSupabase();
  const clean = String(path || '').replace(/^\/+/, '');
  const { error } = await sb.storage.from(BUCKET).remove([clean]);
  if (error) throw error;
  return true;
}

async function getInfo() {
  await ensureBucket();
  const files = await listFiles();
  let sizeHint = 0;
  for (const f of files) sizeHint += f.metadata?.size || f.size || 0;
  return { bucket: BUCKET, files: files.length, approxBytes: sizeHint, configured: true };
}

export {
  isConfigured,
  listFiles,
  getSignedUrl,
  uploadBuffer,
  deleteFile,
  getInfo,
  BUCKET,
};
