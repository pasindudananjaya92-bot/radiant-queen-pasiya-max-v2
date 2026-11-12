// Queen Drive — Platform UI over vault bucket (recursive list)
import * as vault from './vaultManager.js';

export async function listDrive(limit = 80) {
  if (!vault.isConfigured()) {
    return { ok: false, error: 'Vault/Supabase storage not configured', files: [], bucket: vault.BUCKET };
  }
  try {
    const files = await vault.listFiles('');
    const items = (files || []).slice(0, limit).map((f) => ({
      name: f.path || f.name,
      path: f.path || f.name,
      id: f.id || null,
      size: f.size ?? f.metadata?.size ?? null,
      updated_at: f.updated_at || f.created_at || null,
      mimetype: f.metadata?.mimetype || null,
    }));
    return {
      ok: true,
      bucket: vault.BUCKET || 'vault',
      files: items,
      count: items.length,
    };
  } catch (e) {
    return { ok: false, error: e.message || String(e), files: [], bucket: vault.BUCKET };
  }
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
