// Queen Drive — direct Supabase Storage list (bucket: vault)
import { createClient } from '@supabase/supabase-js';

const BUCKET = process.env.VAULT_BUCKET || 'vault';

function sb() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

async function listPrefix(client, prefix, depth, acc) {
  const { data, error } = await client.storage.from(BUCKET).list(prefix || '', {
    limit: 100,
    offset: 0,
  });
  if (error) throw new Error(error.message);

  for (const f of data || []) {
    if (!f?.name || f.name === '.emptyFolderPlaceholder') continue;
    const path = prefix ? `${prefix}/${f.name}` : f.name;

    // Supabase: folders have id === null
    if (f.id == null) {
      if (depth < 5) await listPrefix(client, path, depth + 1, acc);
      continue;
    }

    acc.push({
      name: path,
      path,
      id: f.id,
      size: f.metadata?.size ?? null,
      updated_at: f.updated_at || f.created_at || null,
      mimetype: f.metadata?.mimetype || null,
    });
  }
}

export async function listDrive(limit = 100) {
  const client = sb();
  if (!client) {
    return { ok: false, error: 'Supabase not configured', files: [], bucket: BUCKET };
  }
  try {
    const acc = [];
    await listPrefix(client, '', 0, acc);
    acc.sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
    const files = acc.slice(0, limit);
    return { ok: true, bucket: BUCKET, files, count: files.length };
  } catch (e) {
    return { ok: false, error: e.message || String(e), files: [], bucket: BUCKET };
  }
}

export async function signFile(path) {
  const client = sb();
  if (!client) throw new Error('Supabase not configured');
  const clean = String(path || '').replace(/^\/+/, '');
  const { data, error } = await client.storage.from(BUCKET).createSignedUrl(clean, 3600);
  if (error) throw new Error(error.message);
  return { ok: true, url: data?.signedUrl || null, path: clean };
}

export async function removeFile(path) {
  const client = sb();
  if (!client) throw new Error('Supabase not configured');
  const clean = String(path || '').replace(/^\/+/, '');
  const { error } = await client.storage.from(BUCKET).remove([clean]);
  if (error) throw new Error(error.message);
  return { ok: true, path: clean };
}
