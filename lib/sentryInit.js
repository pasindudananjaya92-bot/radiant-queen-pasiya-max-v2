// lib/sentryInit.js — safe one-time Sentry init (optional if SENTRY_DSN missing)
let initialized = false;
let initAttempted = false;

export async function ensureSentry() {
  if (initialized) return { ok: true, initialized: true };
  if (initAttempted) return { ok: false, initialized: false };
  initAttempted = true;

  const dsn = String(process.env.SENTRY_DSN || '').trim();
  if (!dsn) return { ok: false, skipped: true, reason: 'SENTRY_DSN not set' };

  try {
    const Sentry = await import('@sentry/node');
    const init = Sentry.init || Sentry.default?.init;
    if (typeof init !== 'function') {
      return { ok: false, error: 'Sentry.init missing' };
    }
    init({
      dsn,
      environment: process.env.VERCEL_ENV || process.env.NODE_ENV || 'production',
      tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE || 0),
      // Keep serverless light
      sendDefaultPii: false,
    });
    initialized = true;
    return { ok: true, initialized: true };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

export async function captureException(err, context = '') {
  const ready = await ensureSentry();
  if (!ready.ok && !ready.initialized) {
    return { ok: false, skipped: true, note: ready.reason || ready.error };
  }
  try {
    const Sentry = await import('@sentry/node');
    const capture = Sentry.captureException || Sentry.default?.captureException;
    if (typeof capture !== 'function') return { ok: false, error: 'no captureException' };
    capture(err instanceof Error ? err : new Error(String(err)), {
      tags: {
        context: String(context || 'app').slice(0, 48),
        app: 'radiant-queen',
      },
    });
    // flush best-effort for serverless
    try {
      const flush = Sentry.flush || Sentry.default?.flush;
      if (typeof flush === 'function') await flush(2000);
    } catch (_) {}
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

export default { ensureSentry, captureException };
