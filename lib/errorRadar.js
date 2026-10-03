/**
 * lib/errorRadar.js — Pack H self-monitoring
 * - Optional Sentry (SENTRY_DSN)
 * - In-memory ring buffer of recent errors
 * - Founder Telegram alert (rate-limited)
 * - Safe auto-hints (no code edits)
 */
const recent = [];
const MAX = 40;
let lastAlertAt = 0;
const ALERT_COOLDOWN_MS = 3 * 60 * 1000;

export function pushLocalError(err, context) {
  const entry = {
    at: new Date().toISOString(),
    context: String(context || 'unknown').slice(0, 80),
    message: String(err?.message || err || 'error').slice(0, 300),
    stack: String(err?.stack || '').slice(0, 400),
  };
  recent.unshift(entry);
  if (recent.length > MAX) recent.pop();
  return entry;
}

export function getRecentErrors(limit = 10) {
  return recent.slice(0, limit);
}

async function sentryCapture(err, context) {
  const dsn = String(process.env.SENTRY_DSN || '').trim();
  if (!dsn) return { ok: false, skipped: true };
  try {
    // Lightweight ingest without @sentry/node dependency (optional)
    // Prefer official SDK if user adds it later; this is a best-effort beacon.
    const payload = {
      message: String(err?.message || err).slice(0, 200),
      level: 'error',
      tags: { context: String(context || '').slice(0, 40), app: 'radiant-queen' },
      extra: { stack: String(err?.stack || '').slice(0, 500) },
    };
    // Dynamic import if package exists
    try {
      const Sentry = await import('@sentry/node');
      if (Sentry?.captureException) {
        Sentry.captureException(err instanceof Error ? err : new Error(String(err)), {
          tags: payload.tags,
        });
        return { ok: true, via: 'sdk' };
      }
    } catch (_) {}
    return { ok: false, skipped: true, note: 'Install @sentry/node for full Sentry' };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
}

async function telegramFounder(text) {
  const token = process.env.BOT_TOKEN || '';
  const admin = String(process.env.ADMIN_ID || '').trim();
  if (!token || !admin) return { ok: false };
  try {
    await fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: admin,
        text: String(text).slice(0, 3500),
      }),
    });
    return { ok: true };
  } catch (_) {
    return { ok: false };
  }
}

/**
 * Report error: local log + optional Sentry + founder alert (cooldown)
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
      '\n/diagnose for full report';
    const t = await telegramFounder(msg);
    alerted = !!t.ok;
  }

  return { entry, sentry, alerted };
}

/** Safe auto-hints only — never edits code */
export function autoHintFromError(err) {
  const m = String(err?.message || err || '').toLowerCase();
  const hints = [];
  if (m.includes('bot_token') || m.includes('401') && m.includes('telegram')) {
    hints.push('Check BOT_TOKEN on Vercel env + redeploy');
  }
  if (m.includes('gemini') && (m.includes('404') || m.includes('not found'))) {
    hints.push('Model 404: router should fallback (Groq/OpenRouter). Set GEMINI_MODEL=gemini-3.8-flash');
  }
  if (m.includes('429') || m.includes('quota') || m.includes('resource_exhausted')) {
    hints.push('Quota hit: Groq/OpenRouter fallback should engage; wait or add another key');
  }
  if (m.includes('supabase') || m.includes('jwt') || m.includes('password')) {
    hints.push('Check SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY');
  }
  if (m.includes('econnrefused') || m.includes('fetch failed')) {
    hints.push('Network/upstream down — retry later; check /api/telegram GET health');
  }
  if (!hints.length) hints.push('See /diagnose and recent radar errors');
  return hints;
}

export async function runDiagnose(deps = {}) {
  const {
    supabase,
    BOT_TOKEN,
    GEMINI_KEY,
    ADMIN_ID,
    GITHUB_TOKEN,
  } = deps;

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

  // DB ping
  if (supabase) {
    try {
      const { error } = await supabase.from('rq_gold').select('user_id').limit(1);
      ok('DB_rq_gold', !error, error ? error.message : 'readable');
    } catch (e) {
      ok('DB_rq_gold', false, String(e.message || e));
    }
  }

  // Webhook info
  let webhook = null;
  if (BOT_TOKEN) {
    try {
      const r = await fetch('https://api.telegram.org/bot' + BOT_TOKEN + '/getWebhookInfo');
      const j = await r.json();
      webhook = j.result || null;
      ok(
        'WEBHOOK',
        Boolean(j.ok && webhook?.url),
        webhook?.url || j.description || 'no url'
      );
    } catch (e) {
      ok('WEBHOOK', false, String(e.message || e));
    }
  }

  // AI providers
  let aiStatus = null;
  try {
    const { getAiProviderStatus } = await import('./aiRouter.js');
    aiStatus = getAiProviderStatus();
    ok('AI_router', true, 'last=' + (aiStatus.lastProvider || 'none'));
  } catch (e) {
    ok('AI_router', false, String(e.message || e));
  }

  // Search smoke
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
    for (const e of errs) {
      lines.push('• [' + e.context + '] ' + e.message);
    }
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
};
