// lib/healthManager.js — Wave 28A deep probes integrated
async function checkUrl(url, options = {}, timeoutMs = 6000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return { ok: res.ok, status: res.status, ms: Date.now() - started };
  } catch (e) {
    return { ok: false, status: 0, ms: Date.now() - started, error: e.message || String(e) };
  } finally {
    clearTimeout(timer);
  }
}

async function checkSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return { name: 'Supabase', ok: false, detail: 'env missing' };
  const r = await checkUrl(`${url.replace(/\/$/, '')}/rest/v1/`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  return {
    name: 'Supabase',
    ok: r.ok || r.status === 200 || r.status === 404,
    detail: r.ok || r.status ? `${r.status} · ${r.ms}ms` : r.error || 'fail',
  };
}

async function checkVercel() {
  return {
    name: 'Vercel',
    ok: true,
    detail: process.env.VERCEL_ENV || process.env.VERCEL ? 'production' : 'runtime',
  };
}

export async function runFullCheck() {
  let make, snap, cron;
  try {
    const deep = await import('./deepProbes.js');
    const p = await deep.runDeepProbes();
    make = p.make;
    snap = p.snap;
    cron = p.cron;
  } catch {
    make = {
      name: 'Make Webhook',
      ok: Boolean(process.env.MAKE_WEBHOOK_URL),
      detail: process.env.MAKE_WEBHOOK_URL ? 'configured' : 'missing',
    };
    snap = {
      name: 'SnapDeploy',
      ok: Boolean(process.env.SNAPDEPLOY_API_KEY),
      detail: process.env.SNAPDEPLOY_API_KEY ? 'key present' : 'missing',
    };
    cron = {
      name: 'cron-job.org',
      ok: Boolean(process.env.CRONJOB_API_KEY || process.env.CRON_JOB_API_KEY),
      detail: 'key present/soft',
    };
  }
  const [vercel, supabase] = await Promise.all([checkVercel(), checkSupabase()]);
  const checks = [vercel, supabase, make, snap, cron];
  const ok = checks.every((c) => c.ok);
  return { ok, checks, at: new Date().toISOString() };
}

export function formatHealth(result) {
  const lines = result.checks.map((c) => `${c.ok ? '✅' : '❌'} *${c.name}*: ${c.detail}`);
  const head = result.ok ? '🟢 *All systems operational*' : '🟡 *Some checks failed*';
  return [head, '', ...lines, '', `_${result.at}_`].join('\n');
}

export default { runFullCheck, formatHealth };
