/**
 * lib/intentLedger.js — S3 Intent Ledger (forensic audit)
 *
 * Fire-and-forget writes to rq_audit_log. Never throws to callers.
 */

/**
 * @param {import('@supabase/supabase-js').SupabaseClient|null} supabase
 * @param {object} entry
 */
export async function logIntent(supabase, entry) {
  try {
    if (!supabase) return { ok: false, skipped: true, reason: 'no supabase' };
    const row = {
      user_id: String(entry.userId || entry.user_id || '').slice(0, 40),
      is_founder: Boolean(entry.isFounder ?? entry.is_founder),
      command: String(entry.command || '').replace(/^\//, '').slice(0, 64),
      action: String(entry.action || 'command').slice(0, 40),
      args_preview: String(entry.argsPreview ?? entry.args_preview ?? '').slice(0, 500),
      result: String(entry.result || 'ok').slice(0, 40),
      detail: String(entry.detail || '').slice(0, 1000),
      chat_id: entry.chatId != null ? String(entry.chatId) : entry.chat_id != null ? String(entry.chat_id) : '',
      message_id:
        entry.messageId != null
          ? String(entry.messageId)
          : entry.message_id != null
            ? String(entry.message_id)
            : '',
      meta: entry.meta && typeof entry.meta === 'object' ? entry.meta : {},
    };
    if (!row.user_id) row.user_id = 'unknown';
    const { error } = await supabase.from('rq_audit_log').insert(row);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
}

/**
 * Telegraf middleware — logs founder commands (and optional all users).
 * @param {object} opts
 * @param {*} opts.supabase
 * @param {string} opts.adminId
 * @param {boolean} [opts.founderOnly=true] log only ADMIN_ID
 */
export function intentLedgerMiddleware({ supabase, adminId, founderOnly = true }) {
  const admin = String(adminId || '').trim();
  return async (ctx, next) => {
    const start = Date.now();
    let err = null;
    try {
      await next();
    } catch (e) {
      err = e;
      throw e;
    } finally {
      try {
        const uid = String(ctx.from?.id || '');
        const isFounder = uid && admin && uid === admin;
        if (founderOnly && !isFounder) {
          /* skip */
        } else {
          const text = String(ctx.message?.text || ctx.message?.caption || '');
          const isCmd = text.startsWith('/') || ctx.updateType === 'callback_query';
          if (isCmd || isFounder) {
            let command = '';
            let argsPreview = '';
            if (text.startsWith('/')) {
              const parts = text.trim().split(/\s+/);
              command = (parts[0] || '').replace(/@\w+$/, '').replace(/^\//, '');
              argsPreview = parts.slice(1).join(' ').slice(0, 500);
            } else if (ctx.callbackQuery?.data) {
              command = 'callback';
              argsPreview = String(ctx.callbackQuery.data).slice(0, 500);
            } else {
              command = ctx.updateType || 'event';
            }
            // fire and forget
            logIntent(supabase, {
              userId: uid || 'unknown',
              isFounder,
              command,
              action: 'command',
              argsPreview,
              result: err ? 'error' : 'ok',
              detail: err ? String(err.message || err).slice(0, 500) : '',
              chatId: ctx.chat?.id,
              messageId: ctx.message?.message_id,
              meta: { ms: Date.now() - start, updateType: ctx.updateType },
            }).catch(() => {});
          }
        }
      } catch (_) {}
    }
  };
}

/**
 * Manual log helper for lib modules (/prfix, /sql, chronos)
 */
export async function logAction(supabase, ctx, action, result, detail, meta) {
  const admin = String(process.env.ADMIN_ID || '').trim();
  const uid = String(ctx?.from?.id || '');
  return logIntent(supabase, {
    userId: uid,
    isFounder: uid === admin,
    command: action,
    action: action,
    argsPreview: '',
    result: result || 'ok',
    detail: detail || '',
    chatId: ctx?.chat?.id,
    messageId: ctx?.message?.message_id,
    meta: meta || {},
  });
}

export async function fetchRecentAudit(supabase, { limit = 15, userId = null } = {}) {
  if (!supabase) return { ok: false, error: 'no supabase' };
  let q = supabase
    .from('rq_audit_log')
    .select('created_at, user_id, is_founder, command, action, args_preview, result, detail')
    .order('created_at', { ascending: false })
    .limit(Math.min(50, limit));
  if (userId) q = q.eq('user_id', String(userId));
  const { data, error } = await q;
  if (error) return { ok: false, error: error.message };
  return { ok: true, rows: data || [] };
}

export function formatAuditLines(rows) {
  if (!rows?.length) return 'No audit rows yet.';
  return rows
    .map((r, i) => {
      const t = String(r.created_at || '').replace('T', ' ').slice(0, 19);
      const cmd = r.command || r.action || '?';
      const res = r.result || '';
      const args = r.args_preview ? ' ' + String(r.args_preview).slice(0, 40) : '';
      return `${i + 1}. ${t} · /${cmd}${args}\n   → ${res}${r.detail ? ' · ' + String(r.detail).slice(0, 60) : ''}`;
    })
    .join('\n');
}

export default {
  logIntent,
  logAction,
  intentLedgerMiddleware,
  fetchRecentAudit,
  formatAuditLines,
};
