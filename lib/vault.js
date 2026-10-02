/**
 * lib/vault.js — Pack B Supabase Storage personal vault
 * Bucket: rq_vault (private)
 * Meta table: public.rq_vault_files
 */
const BUCKET = 'rq_vault';
const MAX_BYTES = 8 * 1024 * 1024; // 8MB soft limit (Telegram docs often ~20MB; keep lean)
const MAX_FILES_PER_USER = 40;

function safeName(name) {
  return String(name || 'file')
    .replace(/[^\w.\- ()\u0D80-\u0DFF]+/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 80) || 'file';
}

/**
 * Ensure bucket exists (service role). Safe to call repeatedly.
 */
export async function ensureVaultBucket(supabase) {
  if (!supabase) return { ok: false, error: 'No Supabase' };
  try {
    const { data, error } = await supabase.storage.getBucket(BUCKET);
    if (!error && data) return { ok: true, existed: true };
  } catch (_) {}
  try {
    const { error } = await supabase.storage.createBucket(BUCKET, {
      public: false,
      fileSizeLimit: MAX_BYTES,
    });
    if (error && !String(error.message || '').toLowerCase().includes('already')) {
      // bucket may already exist via SQL
      console.log('[vault] createBucket', error.message);
    }
    return { ok: true, existed: false };
  } catch (e) {
    return { ok: true, note: String(e.message || e) };
  }
}

export async function listVaultFiles(supabase, userId, limit = 20) {
  if (!supabase) return { ok: false, error: 'No Supabase' };
  const { data, error } = await supabase
    .from('rq_vault_files')
    .select('id, name, path, mime, size_bytes, created_at')
    .eq('user_id', Number(userId))
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) return { ok: false, error: error.message };
  return { ok: true, files: data || [] };
}

export async function countVaultFiles(supabase, userId) {
  if (!supabase) return 0;
  const { count } = await supabase
    .from('rq_vault_files')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', Number(userId));
  return count || 0;
}

/**
 * Upload buffer to storage + insert meta row
 */
export async function saveVaultFile(supabase, userId, opts) {
  if (!supabase) return { ok: false, error: 'No Supabase' };
  const uid = Number(userId);
  const buf = Buffer.isBuffer(opts.buffer) ? opts.buffer : Buffer.from(opts.buffer || []);
  if (!buf.length) return { ok: false, error: 'Empty file' };
  if (buf.length > MAX_BYTES) {
    return { ok: false, error: 'File too large (max ' + Math.floor(MAX_BYTES / 1024 / 1024) + 'MB)' };
  }

  const n = await countVaultFiles(supabase, uid);
  if (n >= MAX_FILES_PER_USER) {
    return { ok: false, error: 'Vault full (' + MAX_FILES_PER_USER + ' files). /vault del <id> first.' };
  }

  await ensureVaultBucket(supabase);

  const name = safeName(opts.name || 'file.bin');
  const path = uid + '/' + Date.now() + '_' + name;
  const mime = opts.mime || 'application/octet-stream';

  const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, buf, {
    contentType: mime,
    upsert: false,
  });
  if (upErr) return { ok: false, error: upErr.message };

  const { data, error } = await supabase
    .from('rq_vault_files')
    .insert({
      user_id: uid,
      path,
      name,
      mime,
      size_bytes: buf.length,
      telegram_file_id: opts.telegram_file_id || null,
    })
    .select('id, name, path, mime, size_bytes, created_at')
    .single();
  if (error) {
    // cleanup storage object
    try {
      await supabase.storage.from(BUCKET).remove([path]);
    } catch (_) {}
    return { ok: false, error: error.message };
  }
  return { ok: true, file: data };
}

export async function getVaultFile(supabase, userId, fileId) {
  if (!supabase) return { ok: false, error: 'No Supabase' };
  const { data, error } = await supabase
    .from('rq_vault_files')
    .select('*')
    .eq('id', Number(fileId))
    .eq('user_id', Number(userId))
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: 'Not found (or not yours)' };

  const { data: signed, error: sErr } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(data.path, 60 * 30); // 30 min
  if (sErr) return { ok: false, error: sErr.message, file: data };

  // Also download for re-send
  const { data: blob, error: dErr } = await supabase.storage.from(BUCKET).download(data.path);
  let buffer = null;
  if (!dErr && blob) {
    buffer = Buffer.from(await blob.arrayBuffer());
  }
  return {
    ok: true,
    file: data,
    signedUrl: signed?.signedUrl || null,
    buffer,
  };
}

export async function deleteVaultFile(supabase, userId, fileId) {
  if (!supabase) return { ok: false, error: 'No Supabase' };
  const { data, error } = await supabase
    .from('rq_vault_files')
    .select('*')
    .eq('id', Number(fileId))
    .eq('user_id', Number(userId))
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: 'Not found (or not yours)' };

  try {
    await supabase.storage.from(BUCKET).remove([data.path]);
  } catch (_) {}
  const { error: delErr } = await supabase
    .from('rq_vault_files')
    .delete()
    .eq('id', data.id)
    .eq('user_id', Number(userId));
  if (delErr) return { ok: false, error: delErr.message };
  return { ok: true, deleted: data };
}

export default {
  BUCKET,
  ensureVaultBucket,
  listVaultFiles,
  saveVaultFile,
  getVaultFile,
  deleteVaultFile,
};
