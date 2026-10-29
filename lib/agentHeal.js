/**
 * agentHeal.js — Agent-6 bounded self-heal helpers for chains
 * Safe defaults: retry transients; code errors → suggest /debug (no auto-apply unless env).
 */

export function classifyError(err) {
  const m = String(err && (err.message || err) || '');
  if (/timeout|ETIMEDOUT|ECONNRESET|fetch failed|network|429|502|503|504/i.test(m)) {
    return 'transient';
  }
  if (
    /is not a function|Cannot find module|Unexpected token|not defined|SyntaxError/i.test(
      m
    )
  ) {
    return 'code';
  }
  return 'other';
}

/** Infer a lib path hint from error stacks (best-effort). */
export function guessFileFromError(err) {
  const s = String(err && (err.stack || err.message) || '');
  const m = s.match(/\/lib\/([a-zA-Z0-9_.-]+\.js)/);
  if (m) return 'lib/' + m[1];
  if (/agentExecute/i.test(s)) return 'lib/agentExecute.js';
  if (/hullControl/i.test(s)) return 'lib/hullControl.js';
  if (/repoBridge/i.test(s)) return 'lib/repoBridge.js';
  return null;
}

/**
 * Run fn; on transient failure retry once.
 * onCode: optional async (err) => void for logging / queue.
 */
export async function withHealRetry(fn, opts) {
  const maxTransient = (opts && opts.maxTransient) || 1;
  let lastErr = null;
  for (let i = 0; i <= maxTransient; i++) {
    try {
      return { ok: true, result: await fn(), retries: i };
    } catch (e) {
      lastErr = e;
      const kind = classifyError(e);
      if (kind === 'transient' && i < maxTransient) continue;
      if (kind === 'code' && opts && typeof opts.onCode === 'function') {
        try {
          await opts.onCode(e);
        } catch (_) {}
      }
      return {
        ok: false,
        error: e,
        kind: kind,
        fileHint: guessFileFromError(e),
        retries: i,
      };
    }
  }
  return { ok: false, error: lastErr, kind: classifyError(lastErr), retries: maxTransient };
}

export default { classifyError, guessFileFromError, withHealRetry };
