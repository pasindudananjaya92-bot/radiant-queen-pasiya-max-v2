// api/dash.js — Radiant Queen Command Center (Phase 1)
// ONE serverless function: ?action=overview|health|jobs|night|mem|vault
// Auth: Authorization: Bearer DASH_SECRET  OR  ?secret=DASH_SECRET

import { createClient } from '@supabase/supabase-js';

function sb() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

function authorized(req) {
  const secret = String(process.env.DASH_SECRET || process.env.CRON_SECRET || '').trim();
  if (!secret) return false;
  const q = String(req.query?.secret || '').trim();
  if (q && q === secret) return true;
  const h = String(req.headers?.authorization || req.headers?.Authorization || '');
  if (h.toLowerCase().startsWith('bearer ') && h.slice(7).trim() === secret) return true;
  const x = String(req.headers?.['x-dash-secret'] || '');
  if (x && x === secret) return true;
  return false;
}

function json(res, status, body) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Dash-Secret');
  return res.status(status).json(body);
}

async function actionHealth() {
  try {
    const hm = await import('../lib/healthManager.js');
    if (typeof hm.runFullCheck === 'function') {
      const r = await hm.runFullCheck();
      return { ok: true, source: 'healthManager', ...r };
    }
  } catch (_) {}
  // Fallback lightweight checks
  const checks = [];
  checks.push({
    name: 'Vercel',
    ok: Boolean(process.env.VERCEL || process.env.VERCEL_URL),
    detail: process.env.VERCEL_URL || 'local',
  });
  const url = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';
  if (url && key) {
    const t0 = Date.now();
    try {
      const r = await fetch(url + '/rest/v1/', {
        headers: { apikey: key, Authorization: 'Bearer ' + key },
        signal: AbortSignal.timeout(5000),
      });
      checks.push({
        name: 'Supabase',
        ok: r.status !== 401 && r.status !== 403,
        detail: r.status + ' · ' + (Date.now() - t0) + 'ms',
      });
    } catch (e) {
      checks.push({ name: 'Supabase', ok: false, detail: e.message || 'error' });
    }
  } else {
    checks.push({ name: 'Supabase', ok: false, detail: 'not configured' });
  }
  checks.push({
    name: 'Make Webhook',
    ok: Boolean(process.env.MAKE_WEBHOOK_URL),
    detail: process.env.MAKE_WEBHOOK_URL ? 'configured' : 'missing',
  });
  checks.push({
    name: 'SnapDeploy',
    ok: Boolean(process.env.SNAPDEPLOY_API_KEY),
    detail: process.env.SNAPDEPLOY_API_KEY ? 'key present' : 'missing',
  });
  const allOk = checks.every((c) => c.ok);
  return { ok: allOk, checks, ts: new Date().toISOString() };
}

async function actionJobs(limit = 12) {
  const client = sb();
  if (!client) return { ok: false, error: 'supabase not configured', jobs: [] };
  const { data, error } = await client
    .from('think_jobs')
    .select('id, status, prompt, created_at, updated_at, error, result_preview')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    // softer column set
    const r2 = await client
      .from('think_jobs')
      .select('id, status, prompt, created_at, updated_at')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (r2.error) return { ok: false, error: r2.error.message, jobs: [] };
    return { ok: true, jobs: r2.data || [] };
  }
  return { ok: true, jobs: data || [] };
}

async function actionNight(limit = 5) {
  const client = sb();
  if (!client) return { ok: false, error: 'supabase not configured', reports: [] };
  const { data, error } = await client
    .from('night_reports')
    .select('id, phase, briefing_text, payload, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) return { ok: false, error: error.message, reports: [] };
  return {
    ok: true,
    reports: (data || []).map((r) => ({
      id: r.id,
      phase: r.phase,
      created_at: r.created_at,
      preview: String(r.briefing_text || '').slice(0, 280),
      payload: r.payload,
    })),
  };
}

async function actionMem(limit = 8) {
  const client = sb();
  if (!client) return { ok: false, error: 'supabase not configured', memories: [] };
  const { data, error } = await client
    .from('rq_memories')
    .select('id, content, tags, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) return { ok: false, error: error.message, memories: [] };
  return {
    ok: true,
    count: (data || []).length,
    memories: (data || []).map((m) => ({
      id: m.id,
      preview: String(m.content || '').slice(0, 160),
      tags: m.tags,
      created_at: m.created_at,
    })),
  };
}

async function actionVault(limit = 12) {
  // Prefer listing via vault manager if present
  try {
    const vm = await import('../lib/vaultManager.js');
    if (typeof vm.listFiles === 'function') {
      const files = await vm.listFiles();
      return { ok: true, files: (files || []).slice(0, limit) };
    }
  } catch (_) {}
  return { ok: true, files: [], note: 'vaultManager unavailable — use bot vault list' };
}

async function actionOverview() {
  const [health, jobs, night, mem] = await Promise.all([
    actionHealth(),
    actionJobs(8),
    actionNight(3),
    actionMem(5),
  ]);
  const queued = (jobs.jobs || []).filter((j) => j.status === 'queued').length;
  const running = (jobs.jobs || []).filter((j) => j.status === 'running').length;
  const done = (jobs.jobs || []).filter((j) => j.status === 'done').length;
  return {
    ok: true,
    ts: new Date().toISOString(),
    system: {
      name: 'Radiant Queen OS',
      hull: 'Hull B (Vercel + cron)',
      agents: '20–27 · God Pack · Think · Night · Sentry',
    },
    health,
    queue: { queued, running, done, recent: jobs.jobs || [] },
    night,
    mem,
  };
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Dash-Secret');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    return res.status(204).end();
  }

  if (req.method !== 'GET') {
    return json(res, 405, { ok: false, error: 'GET only' });
  }

  if (!authorized(req)) {
    return json(res, 401, {
      ok: false,
      error: 'unauthorized',
      hint: 'Set DASH_SECRET in Vercel and pass ?secret= or Authorization: Bearer',
    });
  }

  const action = String(req.query?.action || 'overview').toLowerCase().trim();

  try {
    if (action === 'health') return json(res, 200, await actionHealth());
    if (action === 'jobs' || action === 'queue') return json(res, 200, await actionJobs(20));
    if (action === 'night') return json(res, 200, await actionNight(8));
    if (action === 'mem' || action === 'memory') return json(res, 200, await actionMem(15));
    if (action === 'vault') return json(res, 200, await actionVault(20));
    if (action === 'overview' || action === 'status' || action === 'home') {
      return json(res, 200, await actionOverview());
    }
    return json(res, 400, {
      ok: false,
      error: 'unknown action',
      actions: ['overview', 'health', 'jobs', 'night', 'mem', 'vault'],
    });
  } catch (e) {
    return json(res, 500, { ok: false, error: e.message || String(e) });
  }
}
