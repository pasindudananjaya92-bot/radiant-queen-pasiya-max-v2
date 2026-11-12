// Queen Drive — Platform view over existing Vault storage
import * as vault from './vaultManager.js';

export async function listDrive(limit = 50) {
  if (!vault.isConfigured()) {
    return { ok: false, error: 'Vault/Supabase storage not configured', files: [] };
  }
  const files = await vault.listFiles('');
  const items = (files || []).slice(0, limit).map((f) => ({
    name: f.name,
    id: f.id,
    size: f.metadata?.size || f.size || null,
    updated_at: f.updated_at || f.created_at || null,
    mimetype: f.metadata?.mimetype || null,
  }));
  return { ok: true, bucket: vault.BUCKET, files: items, count: items.length };
}

export async function signFile(path) {
  if (!path) throw new Error('path required');
  const url = await vault.getSignedUrl(path, 3600);
  return { ok: true, url, path };
}

export async function removeFile(path) {
  if (!path) throw new Error('path required');
  await vault.deleteFile(path);
  return { ok: true, path };
}
