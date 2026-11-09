// api/dash.js — Command Center Phase 2
// Auth: Telegram Login Widget HMAC  OR  DASH_SECRET (fallback)
// GET  ?action=overview|health|jobs|night|mem|vault|me
// POST ?action=think_worker|voice_on|voice_off|night_run

import { createClient } from '@supabase/supabase-js';
import { createHash, createHmac, timingSafeEqual } from 'crypto';

function sb() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

function founderIds() {
  const raw = [
    process.env.ADMIN_ID,
    process.env.FOUNDER_ID,
    process.env.TELEGRAM_FOUNDER_ID,
  ]
    .filter(Boolean)
    .join(',');
  return new Set(
    raw
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean)
  );
}

function botToken() {
  return String(process.env.BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN || '').trim();
}

/** Telegram Login Widget verification (official algorithm) */
export function verifyTelegramLogin(payload = {}) {
  const token = botToken();
  if (!token) return { ok: false, error: 'BOT_TOKEN missing' };

  const hash = String(payload.hash || '');
  if (!hash) return { ok: false, error: 'hash missing' };

  const data = { ...payload };
  delete data.hash;

  const checkString = Object.keys(data)
    .sort()
    .map((k) => `${k}=${data[k]}`)
    .join('\n');

  const secretKey = createHash('sha256').update(token).digest();
  const hmac = createHmac('sha256', secretKey).update(checkString).digest('hex');

  try {
    const a = Buffer.from(hmac, 'hex');
    const b = Buffer.from(hash, 'hex');
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return { ok: false, error: 'invalid telegram hash' };
    }
  } catch {
    return { ok: false, error: 'hash compare failed' };
  }

  const authDate = Number(payload.auth_date || 0);
  const age = Math.floor(Date.now() / 1000) - authDate;
  if (!authDate || age > 86400 * 2) {
    return { ok: false, error: 'telegram auth expired (>48h) — login again' };
  }

  const id = String(payload.id || '');
  const founders = founderIds();
  if (founders.size && !founders.has(id)) {
    return { ok: false, error: 'not founder — access denied', id };
  }

  return {
    ok: true,
    user: {
      id,
      username: payload.username || '',
      first_name: payload.first_name || '',
      photo_url: payload.photo_url || '',
    },
  };
}

function dashSecretOk(req) {
  const secret = String(process.env.DASH_SECRET || '').trim();
  if (!secret) return false;
  const q = String(req.query?.secret || '').trim();
  if (q && q === secret) return true;
  const h = String(req.headers?.authorization || '');
  if (h.toLowerCase().startsWith('bearer ') && h.slice(7).trim() === secret) return true;
  const x = String(req.headers?.['x-dash-secret'] || '');
  if (x && x === secret) return true;
  return false;
}

function parseBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  return {};
}

function getTelegramAuth(req) {
  // Prefer header JSON base64 or body fields
  const hdr = String(req.headers?.['x-telegram-auth'] || '').trim();
  if (hdr) {
    try {
      return JSON.parse(Buffer.from(hdr, 'base64').toString('utf8'));
    } catch {
      try {
        return JSON.parse(hdr);
      } catch {
        return null;
      }
    }
  }
  const q = req.query || {};
  if (q.tg_id && q.tg_hash) {
    return {
      id: q.tg_id,
      first_name: q.tg_first_name || '',
      username: q.tg_username || '',
      photo_url: q.tg_photo_url || '',
      auth_date: q.tg_auth_date,
      hash: q.tg_hash,
    };
  }
  const body = parseBody(req);
  if (body.telegram && typeof body.telegram === 'object') return body.telegram;
  if (body.hash && body.id) return body;
  return null;
}

function authorize(req) {
  // 1) Telegram widget session
  const tg = getTelegramAuth(req);
  if (tg && tg.hash) {
    const v = verifyTelegramLogin(tg);
    if (v.ok) return { ok: true, method: 'telegram', user: v.user };
    return { ok: false, error: v.error || 'telegram auth failed', id: v.id };
  }
  // 2) Fallback shared secret (Phase 1)
  if (dashSecretOk(req)) {
    return {
      ok: true,
      method: 'dash_secret',
      user: { id: String([...founderIds()][0] || 'secret'), username: 'secret' },
    };
  }
  return { ok: false, error: 'unauthorized' };
}

function json(res, status, body) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Authorization, Content-Type, X-Dash-Secret, X-Telegram-Auth'
  );
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
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
  } else checks.push({ name: 'Supabase', ok: false, detail: 'not configured' });
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
  return { ok: checks.every((c) => c.ok), checks, ts: new Date().toISOString() };
}

async function actionJobs(limit = 12) {
  const client = sb();
  if (!client) return { ok: false, error: 'supabase not configured', jobs: [] };
  const { data, error } = await client
    .from('think_jobs')
    .select('id, status, prompt, created_at, updated_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) return { ok: false, error: error.message, jobs: [] };
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
  try {
    const vm = await import('../lib/vaultManager.js');
    if (typeof vm.listFiles === 'function') {
      const files = await vm.listFiles();
      return { ok: true, files: (files || []).slice(0, limit) };
    }
  } catch (_) {}
  return { ok: true, files: [], note: 'vaultManager unavailable' };
}

async function actionOverview() {
  const [health, jobs, night, mem] = await Promise.all([
    actionHealth(),
    actionJobs(8),
    actionNight(3),
    actionMem(5),
  ]);
  const list = jobs.jobs || [];
  let cron = { ok: false, jobs: [], error: null };
  try {
    cron = await actionCronList();
  } catch (e) {
    cron = { ok: false, jobs: [], error: e.message || String(e) };
  }
  return {
    ok: true,
    ts: new Date().toISOString(),
    system: {
      name: 'Radiant Queen OS',
      hull: 'Hull B (Vercel + cron)',
      agents: '20–27 · God Pack · Think · Night · Sentry · Dash P3 Cron',
    },
    health,
    queue: {
      queued: list.filter((j) => j.status === 'queued').length,
      running: list.filter((j) => j.status === 'running').length,
      done: list.filter((j) => j.status === 'done').length,
      recent: list,
    },
    night,
    mem,
    cron,
  };
}

async function actionThinkWorker() {
  const { processThinkQueue } = await import('../lib/hullBManager.js');
  const results = await processThinkQueue(1);
  return { ok: true, action: 'think_worker', results };
}

async function actionVoice(on) {
  const client = sb();
  const uid = String([...founderIds()][0] || '');
  if (!client || !uid) return { ok: false, error: 'supabase or ADMIN_ID missing' };
  const { error } = await client.from('rq_user_prefs').upsert(
    {
      user_id: uid,
      voice_replies: !!on,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' }
  );
  if (error) {
    // table might use different PK — try update then insert
    const u = await client
      .from('rq_user_prefs')
      .update({ voice_replies: !!on })
      .eq('user_id', uid);
    if (u.error) return { ok: false, error: error.message || u.error.message };
  }
  return { ok: true, action: on ? 'voice_on' : 'voice_off', voice_replies: !!on };
}

async function actionNightRun() {
  const { runNightOpsNow } = await import('../lib/nightOperator.js');
  const r = await runNightOpsNow();
  return {
    ok: true,
    action: 'night_run',
    scan_ok: r?.scan?.allOk,
    brief_ok: r?.brief?.ok,
    voice: r?.brief?.voiceResult?.ok || false,
  };
}


async function actionCronList() {
  const cm = await import('../lib/cronManager.js');
  const jobs = await cm.listJobs();
  const mapped = (jobs || []).map((j) => {
    const id = j.jobId ?? j.job_id ?? j.id;
    const last = j.lastStatus;
    let health = 'unknown';
    if (j.enabled === false) health = 'disabled';
    else if (last === 1 || last === 200 || last === 201 || last === 204) health = 'ok';
    else if (last == null || last === 0) health = 'pending';
    else if (last >= 400 || last === 2 || last === 3) health = 'fail';
    else health = 'warn';
    return {
      id,
      title: j.title || 'untitled',
      enabled: j.enabled !== false,
      lastStatus: last,
      health,
      nextExecution: j.nextExecution
        ? new Date(j.nextExecution * 1000).toISOString()
        : null,
      url: String(j.url || '').slice(0, 240),
      emoji: typeof cm.statusEmoji === 'function' ? cm.statusEmoji(j) : '',
    };
  });
  return { ok: true, count: mapped.length, jobs: mapped };
}

async function actionCronEnable(id) {
  const cm = await import('../lib/cronManager.js');
  await cm.enableJob(id);
  return { ok: true, action: 'cron_enable', id };
}

async function actionCronDisable(id) {
  const cm = await import('../lib/cronManager.js');
  await cm.disableJob(id);
  return { ok: true, action: 'cron_disable', id };
}

async function actionCronDelete(id) {
  const cm = await import('../lib/cronManager.js');
  await cm.deleteJob(id);
  return { ok: true, action: 'cron_delete', id };
}

async function actionCronHeal() {
  const cm = await import('../lib/cronManager.js');
  const r = await cm.healJobs({});
  return { ok: true, action: 'cron_heal', ...r };
}


export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Authorization, Content-Type, X-Dash-Secret, X-Telegram-Auth'
    );
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    return res.status(204).end();
  }

  const action = String(req.query?.action || (req.method === 'POST' ? '' : 'overview'))
    .toLowerCase()
    .trim();

  // Auth verify endpoint (widget callback can POST telegram fields)
  if (req.method === 'POST' && (action === 'auth' || action === 'telegram_auth')) {
    const body = parseBody(req);
    const tg = body.telegram || body;
    const v = verifyTelegramLogin(tg);
    if (!v.ok) return json(res, 401, { ok: false, error: v.error, id: v.id });
    return json(res, 200, { ok: true, user: v.user, method: 'telegram' });
  }

  const auth = authorize(req);
  if (!auth.ok) {
    return json(res, 401, {
      ok: false,
      error: auth.error || 'unauthorized',
      hint: 'Login with Telegram (founder) or pass DASH_SECRET',
    });
  }

  try {
    if (req.method === 'GET') {
      if (action === 'me') return json(res, 200, { ok: true, auth });
      if (action === 'health') return json(res, 200, await actionHealth());
      if (action === 'jobs' || action === 'queue') return json(res, 200, await actionJobs(20));
      if (action === 'night') return json(res, 200, await actionNight(8));
      if (action === 'mem' || action === 'memory') return json(res, 200, await actionMem(15));
      if (action === 'vault') return json(res, 200, await actionVault(20));
      if (action === 'config') {
        return json(res, 200, {
          ok: true,
          bot_username: process.env.TELEGRAM_BOT_USERNAME || process.env.BOT_USERNAME || '',
          founder_gated: founderIds().size > 0,
        });
      }
      if (action === 'cron' || action === 'crons' || action === 'cron_list') {
        return json(res, 200, await actionCronList());
      }
      return json(res, 200, await actionOverview());
    }

    if (req.method === 'POST') {
      if (action === 'think_worker' || action === 'worker') {
        return json(res, 200, await actionThinkWorker());
      }
      if (action === 'voice_on') return json(res, 200, await actionVoice(true));
      if (action === 'voice_off') return json(res, 200, await actionVoice(false));
      if (action === 'night_run' || action === 'night') {
        return json(res, 200, await actionNightRun());
      }
      const body = parseBody(req);
      const id = body.id || body.jobId || req.query?.id;
      if (action === 'cron_enable' || action === 'cron_on') {
        if (!id) return json(res, 400, { ok: false, error: 'id required' });
        return json(res, 200, await actionCronEnable(id));
      }
      if (action === 'cron_disable' || action === 'cron_off') {
        if (!id) return json(res, 400, { ok: false, error: 'id required' });
        return json(res, 200, await actionCronDisable(id));
      }
      if (action === 'cron_delete') {
        if (!id) return json(res, 400, { ok: false, error: 'id required' });
        return json(res, 200, await actionCronDelete(id));
      }
      if (action === 'cron_heal') {
        return json(res, 200, await actionCronHeal());
      }
      return json(res, 400, {
        ok: false,
        error: 'unknown POST action',
        actions: [
          'think_worker',
          'voice_on',
          'voice_off',
          'night_run',
          'cron_enable',
          'cron_disable',
          'cron_delete',
          'cron_heal',
          'auth',
        ],
      });
    }

    return json(res, 405, { ok: false, error: 'method not allowed' });
  } catch (e) {
    return json(res, 500, { ok: false, error: e.message || String(e) });
  }
}
