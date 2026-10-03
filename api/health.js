/**
 * api/health.js — Pack H public health for UptimeRobot / BetterStack
 * GET /api/health  → { ok, service, time, checks }
 */
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  const checks = {
    token: Boolean(process.env.BOT_TOKEN),
    gemini: Boolean(process.env.GEMINI_API_KEY),
    groq: Boolean(process.env.GROQ_API_KEY),
    supabase: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
  };
  let db = null;
  try {
    if (checks.supabase) {
      const sb = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
      );
      const { error } = await sb.from('rq_gold').select('user_id').limit(1);
      db = !error;
    }
  } catch (_) {
    db = false;
  }
  const ok = checks.token && (checks.groq || checks.gemini);
  res.setHeader('Cache-Control', 'no-store');
  return res.status(ok ? 200 : 503).json({
    ok,
    service: 'radiant-queen',
    time: new Date().toISOString(),
    checks: { ...checks, db },
  });
}
