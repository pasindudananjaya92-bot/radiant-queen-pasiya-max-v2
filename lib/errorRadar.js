/**
 * lib/errorRadar.js — Pack L (CODE TRAINING refactor)
 *
 * Self-monitoring + command stats for continuous improvement.
 * - Optional Sentry (SENTRY_DSN)
 * - In-memory ring buffer of recent errors
 * - Command hit/fail counters (memory + optional Supabase)
 * - Founder Telegram alerts (rate-limited)
 * - Safe auto-hints only (never auto-edits code)
 */

/** @typedef {{ at: string, context: string, message: string, stack: string }} RadarError */
/** @typedef {{ hits: number, fails: number, lastFail?: string, lastAt?: string }} CmdStat */

const recent = [];
const MAX_ERRORS = 40;
/** @type {Map<string, CmdStat>} */
const cmdStats = new Map();
let lastAlertAt = 0;
const ALERT_COOLDOWN_MS = 3 * 60 * 1000;

/**
 * @param {unknown} err
 * @param {string} [context]
 * @returns {RadarError}
 */
export function pushLocalError(err, context) {
  const entry = {
    at: new Date().toISOString(),
    context: String(context || 'unknown').slice(0, 80),
    message: String(err?.message || err || 'error').slice(0, 300),
    stack: String(err?.stack || '').slice(0, 400),
  };
  recent.unshift(entry);
  if (recent.length > MAX_ERRORS) recent.pop();
  // auto-link to command stats when context looks like a command name
  const ctx = entry.context.toLowerCase();
  if (ctx && !ctx.includes(' ') && ctx.length < 40) {
    trackCommand(ctx, false, entry.message);
  }
  return entry;
}

/**
 * @param {number} [limit]
 * @returns {RadarError[]}
 */
export function getRecentErrors(limit = 10) {
  return recent.slice(0, Math.max(1, limit));
}

/**
 * Track command success/failure for self-improvement reports.
 * @param {string} command
 * @param {boolean} ok
 * @param {string} [failMessage]
 */
export function trackCommand(command, ok, failMessage) {
  const key = String(command || 'unknown')
    .replace(/^\//, '')
    .toLowerCase()
    .slice(0, 40);
  if (!key) return;
  const cur = cmdStats.get(key) || { hits: 0, fails: 0 };
  cur.hits += 1;
  if (!ok) {
    cur.fails += 1;
    cur.lastFail = String(failMessage || 'fail').slice(0, 160);
    cur.lastAt = new Date().toISOString();
  }
  cmdStats.set(key, cur);
}

/**
 * @returns {Array<{ command: string } & CmdStat>}
 */
export function getCommandStats() {
  return [...cmdStats.entries()]
    .map(([command, s]) => ({ command, ...s }))
    .sort((a, b) => b.fails - a.fails || b.hits - a.hits);
}

/**
 * Build founder self-im