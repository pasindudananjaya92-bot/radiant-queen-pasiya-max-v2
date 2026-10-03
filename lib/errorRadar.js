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
 * Build founder self-improvement report text.
 * @returns {string}
 */
export function buildSelfReport() {
  const stats = getCommandStats();
  const errs = getRecentErrors(8);
  const lines = [
    '🧠 SELF-REPORT · Radiant Queen',
    'Time: ' + new Date().toISOString(),
    '',
    '— Command health —',
  ];
  if (!stats.length) {
    lines.push('No command stats in this instance yet (serverless memory resets).');
    lines.push('Tip: stats grow during warm instances; errors still alert founder.');
  } else {
    for (const s of stats.slice(0, 12)) {
      const rate = s.hits ? Math.round((s.fails / s.hits) * 100) : 0;
      lines.push(
        `/${s.command}: hits=${s.hits} fails=${s.fails} (${rate}%)` +
          (s.lastFail ? ` · last: ${s.lastFail}` : '')
      );
    }
  }
  if (errs.length) {
    lines.push('', '— Recent radar errors —');
    for (const e of errs) {
      lines.push(`• [${e.context}] ${e.message}`);
    }
  }
  lines.push('', '— Hints —');
  if (stats.some((s) => s.fails > 0)) {
    const top = stats.find((s) => s.fails > 0);
    lines.push(...autoHintFromError(top?.lastFail || 'error').map((h) => '→ ' + h));
  } else {
    lines.push('→ No failures in memory. Run /diagnose for env/DB/search checks.');
  }
  lines.push('→ Weekly: review /selfreport + /diagnose + CI workflow.');
  lines.push('', '— Weekly training checklist —');
  lines.push('□ /diagnose  □ /selfreport  □ /api/health');
  lines.push('□ CI green on GitHub Actions');
  lines.push('□ Top failing command fixed or documented');
  lines.push('□ AI fallback keys still valid (Groq/OpenRouter/Gemini)');
    lines.push('□ Pack N: /rss HN + /trimage + /qrscan smoke tests');
  lines.push('□ Pack O: /barcode + /receipt + /identify + /kb list');
  lines.push('□ Pack P: /oracle + /ghost + /timecapsule + /twin + /forgepage');
  lines.push('□ CI green on GitHub Actions');
  lines.push('□ Top failing command fixed or documented');
  lines.push('□ AI fallback keys still valid (Groq/OpenRouter/Gemini)');
  if (stats.filter((s) => s.fails > 2).length) {
    lines.push('', '⚠ Priority: fix commands with fails > 2 this week.');
  }
  lines.push('', '— Pack O learnings —');
  lines.push('• Barcode: qrserver decode → Open Food Facts → UPCitemdb');
  lines.push('• Receipt: OCR heuristics for total/date + expenses_ key');
  lines.push('• Identify: vision guess + iNat taxa (vision API not public)');
  lines.push('• KB: keyword match before AI; founder /kb add Q | A');
  lines.push('• RAG/pgvector: SQL ready — enable when embeddings wired');
  lines.push('• Ghost: setTimeout delete is best-effort on serverless');
  lines.push('• Time capsule: sealed in bot_settings, unlock with /timecapsule open');
  lines.push('• Forge: HTML file download — user hosts statically');
  lines.push('• Hive/BotFather spawn: impossible without public API');
  return lines.join('\n');

}

/**
 * @param {unknown} err
 * @param {string} [context]
 */
async function sentryCapture(err, context) {
  const dsn = String(process.env.SENTRY_DSN || '').trim();
  if (!dsn) return { ok: false, skipped: true };
  try {
    try {
      const Sentry = await import('@sentry/node');
      if (Sentry?.captureException) {
        Sentry.captureException(err instanceof Error ? err : new Error(String(err)), {
          tags: { context: String(context || '').slice(0, 40), app: 'radiant-queen' },
        });
        return { ok: true, via: 'sdk' };
      }
    } catch (_) {}
    return { ok: false, skipped: true, note: 'Install @sentry/node for full Sentry' };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
}

/**
 * @param {string} text
 */
async function telegramFounder(text) {
  const token = process.env.BOT_TOKEN || '';
  const admin = String(process.env.ADMIN_ID || '').trim();
  if (!token || !admin) return { ok: false };
  try {
    await fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: admin, text: String(text).slice(0, 3500) }),
    });
    return { ok: true };
  } catch (_) {
    return { ok: false };
  }
}

/**
 * Report error: local log + optional Sentry + founder alert (cooldown)
 * @param {unknown} err
 * @param {string} [context]
 */
export async function reportError(err, context) {
  const entry = pushLocalError(err, context);
  let sentry = { skipped: true };
  try {
    sentry = await sentryCapture(err, context);
  } catch (_) {}

  const now = Date.now();
  let alerted = false;
  if (now - lastAlertAt > ALERT_COOLDOWN_MS) {
    lastAlertAt = now;
    const msg =
      '🚨 RADAR\n' +
      'Context: ' +
      entry.context +
      '\n' +
      entry.message +
      '\n' +
      entry.at +
      '\n/diagnose · /selfreport';
    const t = await telegramFounder(msg);
    alerted = !!t.ok;
  }
  return { entry, sentry, alerted };
}

/**
 * Safe auto-hints only — never edits code
 * @param {unknown} err
 * @returns {string[]}
 */
export function autoHintFromError(err) {
  const m = String(err?.message || err || '').toLowerCase();
  const hints = [];
  if (m.includes('bot_token') || (m.includes('401') && m.includes('telegram'))) {
    hints.push('Check BOT_TOKEN on Vercel env + redeploy');
  }
  if (m.includes('gemini') && (m.includes('404') || m.includes('not found'))) {
    hints.push('Model 404: router should fallback (Groq/OpenRouter). Set GEMINI_MODEL');
  }
  if (m.includes('429') || m.includes('quota') || m.includes('resource_exhausted')) {
    hints.push('Quota hit: add Groq/OpenRouter keys or wait; use /tools free commands');
  }
  if (m.includes('supabase') || m.includes('jwt')) {
    hints.push('Check SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY');
  }
  if (m.includes('econnrefused') || m.includes('fetch failed')) {
    hints.push('Network/upstream down — retry; check /api/health');
  }
  if (m.includes('getter') || m.includes('cannot set property')) {
    hints.push('Do not assign ctx.from/ctx.chat — use local override objects');
  }
  if (!hints.length) hints.push('See /diagnose and /selfreport');
  return hints;
}

/**
 * @param {object} deps
 */
export async function runDiagnose(deps = {}) {
  const { supabase, BOT_TOKEN, GEMINI_KEY, ADMIN_ID, GITHUB_TOKEN } = deps;
  const checks = [];
  const ok = (name, pass, detail) => checks.push({ name, pass: !!pass, detail: detail || '' });

  ok('BOT_TOKEN', Boolean(BOT_TOKEN), BOT_TOKEN ? 'set' : 'MISSING');
  ok('ADMIN_ID', Boolean(ADMIN_ID), ADMIN_ID || 'MISSING');
  ok('GEMINI_API_KEY', Boolean(GEMINI_KEY), GEMINI_KEY ? 'set' : 'missing (Groq may still work)');
  ok('GROQ_API_KEY', Boolean(process.env.GROQ_API_KEY), process.env.GROQ_API_KEY ? 'set' : 'missing');
  ok('OPENROUTER_API_KEY', Boolean(process.env.OPENROUTER_API_KEY), process.env.OPENROUTER_API_KEY ? 'set' : 'missing');
  ok('SUPABASE', Boolean(supabase), supabase ? 'client ok' : 'MISSING');
  ok('GITHUB_TOKEN', Boolean(GITHUB_TOKEN), GITHUB_TOKEN ? 'set' : 'missing');
  ok('SENTRY_DSN', Boolean(process.env.SENTRY_DSN), process.env.SENTRY_DSN ? 'set' : 'optional');
  ok('CRON_SECRET', Boolean(process.env.CRON_SECRET), process.env.CRON_SECRET ? 'set' : 'optional');
  ok('RESEND_API_KEY', Boolean(process.env.RESEND_API_KEY), process.env.RESEND_API_KEY ? 'set' : 'optional');

  if (supabase) {
    try {
      const { error } = await supabase.from('rq_gold').select('user_id').limit(1);
      ok('DB_rq_gold', !error, error ? error.message : 'readable');
    } catch (e) {
      ok('DB_rq_gold', false, String(e.message || e));
    }
  }

  let webhook = null;
  if (BOT_TOKEN) {
    try {
      const r = await fetch('https://api.telegram.org/bot' + BOT_TOKEN + '/getWebhookInfo');
      const j = await r.json();
      webhook = j.result || null;
      ok('WEBHOOK', Boolean(j.ok && webhook?.url), webhook?.url || j.description || 'no url');
    } catch (e) {
      ok('WEBHOOK', false, String(e.message || e));
    }
  }

  let aiStatus = null;
  try {
    const { getAiProviderStatus } = await import('./aiRouter.js');
    aiStatus = getAiProviderStatus();
    ok('AI_router', true, 'last=' + (aiStatus.lastProvider || 'none'));
  } catch (e) {
    ok('AI_router', false, String(e.message || e));
  }

  try {
    const { webSearch } = await import('./webBoost.js');
    const s = await webSearch('Sri Lanka');
    ok('SEARCH', s.ok && s.results?.length > 0, s.ok ? s.provider + ' n=' + s.results.length : s.error);
  } catch (e) {
    ok('SEARCH', false, String(e.message || e));
  }

  const failed = checks.filter((c) => !c.pass);
  const lines = [
    '🩺 DIAGNOSE · Radiant Queen',
    'Time: ' + new Date().toISOString(),
    'Pass: ' + checks.filter((c) => c.pass).length + '/' + checks.length,
    '',
  ];
  for (const c of checks) {
    lines.push((c.pass ? '✅ ' : '❌ ') + c.name + ' — ' + c.detail);
  }
  const errs = getRecentErrors(5);
  if (errs.length) {
    lines.push('', 'Recent radar errors:');
    for (const e of errs) lines.push('• [' + e.context + '] ' + e.message);
  }
  const stats = getCommandStats().filter((s) => s.fails > 0).slice(0, 5);
  if (stats.length) {
    lines.push('', 'Top failing commands (this instance):');
    for (const s of stats) lines.push(`• /${s.command} fails=${s.fails}/${s.hits}`);
  }
  if (failed.length) {
    lines.push('', 'Hints:');
    for (const f of failed) {
      autoHintFromError(f.detail).forEach((h) => lines.push('→ ' + h));
    }
  }
  if (webhook?.last_error_message) {
    lines.push('', 'Webhook last error: ' + webhook.last_error_message);
  }
  lines.push('', 'Also try: /selfreport');

  return {
    ok: failed.length === 0,
    text: lines.join('\n'),
    checks,
    webhook,
    aiStatus,
    recentErrors: errs,
  };
}

export default {
  reportError,
  getRecentErrors,
  autoHintFromError,
  runDiagnose,
  pushLocalError,
  trackCommand,
  getCommandStats,
  buildSelfReport,
};
