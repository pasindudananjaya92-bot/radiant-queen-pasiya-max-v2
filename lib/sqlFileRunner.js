/**
 * lib/sqlFileRunner.js — run .sql document via rq_exec_sql
 * FIX: call executeSql(supabase, sql, isReadOnly) with correct arg order
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

export async function runSqlFileText(sqlText, { supabase } = {}) {
  let text = String(sqlText || '').trim();
  if (!text) return { ok: false, error: 'empty SQL' };
  // Strip comments so leading -- lines don't break ALLOW_START
  try {
    const mod = await import('../lib/sqlCommander.js');
    if (typeof mod.stripSqlComments === 'function') {
      text = mod.stripSqlComments(text);
    } else {
      text = text.replace(/^\s*--[^\n]*\n/gm, '').trim();
    }
  } catch (_) {
    text = text.replace(/^\s*--[^\n]*\n/gm, '').trim();
  }
  if (!text) return { ok: false, error: 'empty SQL after stripping comments' };
  if (Buffer.byteLength(text, 'utf8') > MAX_BYTES) {
    return { ok: false, error: 'SQL text exceeds 1MB limit' };
  }
  if (!supabase) return { ok: false, error: 'no supabase client' };

  // 1) Validate via sqlCommander.staticValidate when available
  let staticValidate = null;
  let executeSql = null;
  let formatResult = null;
  try {
    const mod = await import('../lib/sqlCommander.js');
    staticValidate = mod.staticValidate || null;
    executeSql = mod.executeSql || mod.execSql || mod.runSql || null;
    formatResult = mod.formatResult || null;
  } catch (e) {
    // continue with local fallback
  }

  if (typeof staticValidate === 'function') {
    const v = staticValidate(text);
    if (!v.ok) {
      return { ok: false, error: 'Blocked: ' + (v.reason || v.error || 'validation'), blocked: true };
    }
  } else {
    const blocked =
      /\b(drop\s+database|drop\s+table|truncate\s+table)\b/i;
    if (blocked.test(text)) {
      return { ok: false, error: 'Blocked by safety pattern', blocked: true };
    }
  }

  const isReadOnly = /^\s*(select|with|explain)\b/i.test(text);

  // 2) executeSql(supabase, sql, isReadOnly) — CORRECT order
  if (typeof executeSql === 'function') {
    try {
      const r = await executeSql(supabase, text, isReadOnly);
      if (r && r.ok) {
        return {
          ok: true,
          rows: r.data !== undefined ? r.data : r.rows,
          via: r.via || 'executeSql',
          formatted: formatResult ? formatResult(r.data ?? r.rows) : null,
        };
      }
      // Surface real error (not only generic install msg)
      return {
        ok: false,
        error: (r && r.error) || 'executeSql failed',
        needRpc: r?.needRpc,
      };
    } catch (e) {
      return { ok: false, error: 'executeSql throw: ' + String(e?.message || e) };
    }
  }

  // 3) Direct RPC fallback — try common param names
  for (const payload of [{ q: text }, { sql: text }, { query: text }]) {
    try {
      const { data, error } = await supabase.rpc('rq_exec_sql', payload);
      if (!error) {
        return { ok: true, rows: data, via: 'rpc:' + Object.keys(payload)[0] };
      }
      const msg = String(error.message || error);
      // wrong signature — try next param name
      if (/could not find|function|argument|parameter/i.test(msg)) continue;
      return { ok: false, error: msg };
    } catch (e) {
      continue;
    }
  }

  return {
    ok: false,
    error:
      'RPC rq_exec_sql failed. Check function exists and param is named q (or re-run SQL_GODMODE.sql). Detail: no matching signature.',
  };
}

export default {
  maxSqlFileBytes,
  downloadTelegramFile,
  runSqlFileText,
};
