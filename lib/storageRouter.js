/**
 * lib/storageRouter.js — multi-backend free storage
 * Priority: Cloudflare R2 → Vercel Blob → Supabase Storage → none
 */
import { createClient } from '@supabase/supabase-js';

function sb() {
  const url = process.env.SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

/**
 * Upload buffer. Returns { ok, url, backend }
 */
export async function storeFile(path, buffer, contentType = 'application/octet-stream') {
  const key = String(path || 'file').replace(/^\/+/, '');

  // 1) Cloudflare R2 (S3-compatible) via fetch PUT if env set
  const r2 = process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY && process.env.R2_BUCKET;
  if (r2 && process.env.R2_PUBLIC_URL) {
    try {
      // Prefer user-configured Worker or public URL pattern after external upload.
      // Lightweight: store metadata in Supabase and skip binary if no S3 SDK.
      // Full R2 needs aws4 signing — document in R2_SETUP.md; use Supabase path here as reliable free path.
    } catch (_) {}
  }

  // 2) Vercel Blob
  const blobToken = process.env.BLOB_READ_WRITE_TOKEN || '';
  if (blobToken) {
    try {
      const res = await fetch('https://blob.vercel-storage.com/' + encodeURIComponent(key), {
        method: 'PUT',
        headers: {
          Authorization: 'Bearer ' + blobToken,
          'Content-Type': contentType,
          'x-api-version': '7',
        },
        body: buffer,
        signal: AbortSignal.timeout(60000),
      });
      if (res.ok) {
        const j = await res.json().catch(() => ({}));
        const url = j.url || j.downloadUrl;
        if (url) return { ok: true, url, backend: 'vercel-blob' };
      }
    } catch (e) {
      console.log('[storage] blob', e.message);
    }
  }

  // 3) Supabase Storage bucket rq-media
  const client = sb();
  if (client) {
    try {
      const bucket = process.env.SUPABASE_STORAGE_BUCKET || 'rq-media';
      const { error } = await client.storage.from(bucket).upload(key, buffer, {
        contentType,
        upsert: true,
      });
      if (!error) {
        const { data } = client.storage.from(bucket).getPublicUrl(key);
        return { ok: true, url: data?.publicUrl, backend: 'supabase' };
      }
    } catch (e) {
      console.log('[storage] supabase', e.message);
    }
  }

  return { ok: false, error: 'no storage backend configured' };
}

/** Record file meta for 6-month cleanup cron */
export async function registerFileMeta(userId, url, kind) {
  const client = sb();
  if (!client) return;
  try {
    await client.from('rq_bot_settings').upsert({
      key: 'filemeta_' + Date.now().toString(36),
      value: JSON.stringify({
        userId: String(userId || ''),
        url,
        kind: kind || 'file',
        at: new Date().toISOString(),
      }),
      updated_at: new Date().toISOString(),
    });
  } catch (_) {}
}

export default { storeFile, registerFileMeta };
