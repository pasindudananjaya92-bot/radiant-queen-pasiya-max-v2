// lib/vaultManager.js
// Agent-21 — Supabase Storage Vault
// Version: 2026-11-03

import { createClient } from '@supabase/supabase-js';

const BUCKET = process.env.VAULT_BUCKET || 'vault';

function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }
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
  const exists = (data || []).some(b => b.name === BUCKET);
  if (!exists) {
    const { error: createErr } = await sb.storage.createBucket(BUCKET, {
      public: false,
      fileSizeLimit: 50 * 1024 * 1024, // 50MB
    });
    if (createErr && !String(createErr.message || '').includes('already')) {
      throw createErr;
    }
  }
}

async function listFiles(prefix = '') {
  await ensureBucket();
  const sb = getSupabase();
  const { data, error } = await sb.storage.from(BUCKET).list(prefix || '', {
    limit: 100,
    offset: 0,
    sortBy: { column: 'created_at', order: 'desc' },
  });
  if (error) throw error;
  return (data || []).filter(f => f.name && f.id);
}

async function getSignedUrl(path, expiresSec = 3600) {
  await ensureBucket();
  const sb = getSupabase();
  const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(path, expiresSec);
  if (error) throw error;
  return data?.signedUrl || null;
}

async function uploadBuffer(path, buffer, contentType = 'application/octet-stream') {
  await ensureBucket();
  const sb = getSupabase();
  const { data, error } = await sb.storage.from(BUCKET).upload(path, buffer, {
    contentType,
    upsert: true,
  });
  if (error) throw error;
  return data;
}

async function deleteFile(path) {
  await ensureBucket();
  const sb = getSupabase();
  const { error } = await sb.storage.from(BUCKET).remove([path]);
  if (error) throw error;
  return true;
}

async function getInfo() {
  await ensureBucket();
  const files = await listFiles();
  const total = files.length;
  let sizeHint = 0;
  for (const f of files) {
    sizeHint += f.metadata?.size || 0;
  }
  return {
    bucket: BUCKET,
    files: total,
    approxBytes: sizeHint,
    configured: true,
  };
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
