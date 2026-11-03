// lib/healthManager.js
// Agent-23 — God Health Monitor (fixed Supabase check)
// Version: 2026-11-04

async function checkUrl(url, options = {}, timeoutMs = 6000) {
  const start = Date.now();
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(url, {
      method: options.method || 'GET',
      signal: ctrl.signal,
      headers: {
        'User-Agent': 'PasiyaBot-Health/1.0',
        ...(options.headers || {}),
      },
    });
    clearTimeout(t);
    return {
      ok: res.ok || (res.status > 0 && res.status < 500),
      status: res.status,
      ms: Date.now() - start,
    };
  } catch (e) {
    return {
      ok: false,
      status: 0,
      ms: Date.now() - start,
      error: e.name === 'AbortError' ? 'timeout' : (e.message || 'error'),
    };
  }
}

async function checkSupabase() {
  const url = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';

  if (!url) return { name: 'Supabase', ok: false, detail: 'SUPABASE_URL missing' };
  if (!key) return { name: 'Supabase', ok: false, detail: 'SUPABASE key missing' };

  const r = await checkUrl(`${url}/rest/v1/`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Accept: 'application/json',
    },
  }, 6000);

  const authOk = r.status && r.status !== 401 && r.status !== 403;
  return {
    name: 'Supabase',
    ok: authOk,
    detail: authOk ? `${r.status} · ${r.ms}ms` : (r.error || `HTTP ${r.status}`),
  };
}

async function checkMakeWebhook() {
  const url = process.env.MAKE_WEBHOOK_URL;
  if (!url) return { name: 'Make Webhook', ok: false, detail: 'MAKE_WEBHOOK_URL missing' };
  return {
    name: 'Make Webhook',
    ok: url.startsWith('http'),
    detail: url.startsWith('http') ? 'configured' : 'invalid URL',
  };
}

async function checkSnap() {
  const key = process.env.SNAPDEPLOY_API_KEY;
  if (!key) return { name: 'SnapDeploy', ok: false, detail: 'SNAPDEPLOY_API_KEY missing' };
  return { name: 'SnapDeploy', ok: true, detail: 'key present' };
}

async function checkCron() {
  const key = process.env.CRONJOB_API_KEY || process.env.CRON_JOB_API_KEY;
  if (!key) return { name: 'cron-job.org', ok: false, detail: 'API key missing' };
  return { name: 'cron-job.org', ok: true, detail: 'key present' };
}

async function checkVercel() {
  const onVercel = Boolean(process.env.VERCEL || process.env.VERCEL_URL);
  return {
    name: 'Vercel',
    ok: onVercel,
    detail: onVercel ? (process.env.VERCEL_ENV || 'running') : 'not detected',
  };
}

async function runFullCheck() {
  const checks = await Promise.all([
    checkVercel(),
    checkSupabase(),
    checkMakeWebhook(),
    checkSnap(),
    checkCron(),
  ]);

  const allOk = checks.every(c => c.ok);
  return { allOk, checks, ts: new Date().toISOString() };
}

export {
  runFullCheck,
  checkUrl,
  checkSupabase,
  checkMakeWebhook,
  checkSnap,
  checkCron,
  checkVercel,
};
