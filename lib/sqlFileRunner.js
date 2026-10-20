/**
 * lib/sqlFileRunner.js — run .sql document via rq_exec_sql + sqlCommander validation
 */

const MAX_BYTES = 1 * 1024 * 1024; // 1MB

export function maxSqlFileBytes() {
  return MAX_BYTES;
}

export async function downloadTelegramFile(botToken, fileId) {
  const metaRes = await fetch(
    `https://api.telegram.org/bot${botToken}/getFile?file_id=${encodeURIComponent(fileId)}`
  );
  const meta = await metaRes.json();
  if (!meta.ok || !meta.result?.file_path) {
    return { ok: false, error: 'getFile failed: ' + (meta.description || metaRes.status) };
  }
  const path = meta.result.file_path;
  const fileRes = await fetch(`https://api.telegram.org/file/bot${botToken}/${path}`);
  if (!fileRes.ok) return { ok: false, error: 'download HTTP ' + fileRes.status };
  const buf = Buffer.from(await fileRes.arrayBuffer());
  return { ok: true, buffer: buf, path, bytes: buf.length };
}

export async function runSqlFileText(sqlText, { supabase, sqlCommanderPath } = {}) {
  const text = String(sqlText || '').trim();
  if (!text) return { ok: false, error: 'empty SQL' };
  if (Buffer.byteLength(text, 'utf8') > MAX_BYTES) {
    return { ok: false, error: 'SQL text exceeds 1MB limit' };
  }

  // Prefer existing sqlCommander validation
  let validateSql = null;
  let execSql = null;
  try {
    const mod = await import('../lib/sqlCommander.js');
    validateSql = mod.validateSql || mod.validate || null;
    execSql = mod.execSql || mod.runSql || mod.executeSql || null;
  } catch (_) {}

  if (typeof validateSql === 'function') {
    const v = await validateSql(text);
    if (v && v.ok === false) {
      return { ok: false, error: 'Blocked: ' + (v.error || v.reason || 'validation'), blocked: true };
    }
  } else {
    // Fallback blocklist
    const blocked =
      /\b(drop\s+database|drop\s+table|truncate\s+table|delete\s+from\s+\w+\s*;?\s*$|alter\s+system)\b/i;
    if (blocked.test(text)) {
      return { ok: false, error: 'Blocked by safety pattern', blocked: true };
    }
  }

  // Split mild multi-statement: run as single RPC payload (rq_exec_sql)
  if (typeof execSql === 'function') {
    try {
      const r = await execSql(text, { supabase });
      return r;
    } catch (e) {
      return { ok: false, error: String(e?.message || e) };
    }
  }

  // Direct RPC
  if (!supabase) return { ok: false, error: 'no supabase' };
  const { data, error } = await supabase.rpc('rq_exec_sql', { q: text });
  if (error) return { ok: false, error: error.message };
  return { ok: true, rows: data };
}

export default {
  maxSqlFileBytes,
  downloadTelegramFile,
  runSqlFileText,
};
