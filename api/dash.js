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
  const b = req.body;
  if (b && typeof b === 'object' && !Buffer.isBuffer(b)) return b;
  if (typeof b === 'string' && b.trim()) {
    try { return JSON.parse(b); } catch (_) { return {}; }
  }
  if (Buffer.isBuffer(b)) {
    try { return JSON.parse(b.toString('utf8') || '{}'); } catch (_) { return {}; }
  }
  return {};
}

function pickJobId(req, body) {
  const candidates = [
    body?.id,
    body?.jobId,
    body?.job_id,
    req.query?.id,
    req.query?.jobId,
    req.query?.job_id,
  ];
  for (const c of candidates) {
    if (c === undefined || c === null || c === '') continue;
    return String(c).trim();
  }
  return '';
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

async function authorize(req) {
  // 1) Telegram widget session
  const tg = getTelegramAuth(req);
  if (tg && tg.hash) {
    const v = verifyTelegramLogin(tg);
    if (v.ok) return { ok: true, method: 'telegram', user: v.user };
    return { ok: false, error: v.error || 'telegram auth failed', id: v.id };
  }
  // 2) Remember-Me session token (cookie or Bearer session)
  try {
    const sess = await import('../lib/dashboardSession.js');
    let token = '';
    const h = String(req.headers?.authorization || '');
    if (h.toLowerCase().startsWith('bearer ') && h.slice(7).includes('.')) {
      token = h.slice(7).trim();
    }
    if (!token) token = sess.readCookieToken(req);
    const qTok = String(req.query?.session || '').trim();
    if (!token && qTok) token = qTok;
    if (token) {
      const v = sess.verifySessionToken(token);
      if (v.ok) {
        return {
          ok: true,
          method: 'session',
          user: { id: String([...founderIds()][0] || 'founder'), username: 'session' },
          exp: v.payload?.exp,
        };
      }
    }
  } catch (_) {}

  // 3) Fallback shared secret (Phase 1)
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
  let usage = { ok: false, byTool: {}, rows: [] };
  let alerts = { ok: false, alerts: [], unseen: 0 };
  try {
    const st = await import('../lib/dashboardStats.js');
    usage = await st.usageSummary(30);
  } catch (_) {}
  try {
    const al = await import('../lib/dashboardAlerts.js');
    alerts = await al.collectLiveAlerts();
  } catch (_) {}
  return {
    ok: true,
    ts: new Date().toISOString(),
    system: {
      name: 'Radiant Queen OS',
      hull: 'Hull B (Vercel + cron)',
      agents: 'Queen OS 50x · P6AB · Chat Pro · Brain Pro',
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
    usage,
    alerts,
    shadow: await actionShadowList().catch((e) => ({ ok: false, error: e.message, tasks: [] })),
    brain: await actionBrainList().catch((e) => ({ ok: false, error: e.message, items: [] })),
    bank: await actionBankSummary().catch((e) => ({ ok: false, error: e.message })),
    apk: await actionApkStatus().catch((e) => ({ ok: false, error: e.message })),
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
  const jobId = String(id).trim();
  await cm.enableJob(jobId);
  return { ok: true, action: 'cron_enable', id: jobId };
}

async function actionCronDisable(id) {
  const cm = await import('../lib/cronManager.js');
  const jobId = String(id).trim();
  await cm.disableJob(jobId);
  return { ok: true, action: 'cron_disable', id: jobId };
}

async function actionCronDelete(id) {
  const cm = await import('../lib/cronManager.js');
  const jobId = String(id).trim();
  await cm.deleteJob(jobId);
  return { ok: true, action: 'cron_delete', id: jobId };
}

async function actionCronHeal() {
  const cm = await import('../lib/cronManager.js');
  const r = await cm.healJobs({});
  return { ok: true, action: 'cron_heal', ...r };
}



async function actionChat(message) {
  const mod = await import('../lib/dashboardChat.js');
  return mod.handleChat(message);
}

async function actionChatHistory() {
  const mod = await import('../lib/dashboardChat.js');
  return mod.listMessages(50);
}

async function actionUsage() {
  const mod = await import('../lib/dashboardStats.js');
  return mod.usageSummary(40);
}

async function actionAlerts() {
  const mod = await import('../lib/dashboardAlerts.js');
  return mod.collectLiveAlerts();
}

async function actionAlertsSeen() {
  const mod = await import('../lib/dashboardAlerts.js');
  return mod.markAlertsSeen();
}

async function actionWarRoom() {
  const mod = await import('../lib/warRoom.js');
  return mod.getWarRoomOverview();
}

async function actionHealNow() {
  const mod = await import('../lib/healerEngine.js');
  return mod.runImmuneCycle({ dryRun: false });
}

async function actionHealDry() {
  const mod = await import('../lib/healerEngine.js');
  return mod.runImmuneCycle({ dryRun: true });
}

async function actionSentinelScan() {
  const mod = await import('../lib/sentinelEngine.js');
  return mod.runSentinelScan();
}

async function actionScoutOs() {
  const mod = await import('../lib/scoutEngine.js');
  return mod.runScoutIntel('os');
}

async function actionMissionList() {
  const mod = await import('../lib/missionControl.js');
  const list = await mod.listMissions({ limit: 12 });
  return { ok: true, missions: list };
}

async function actionAlertsClear() {
  const mod = await import('../lib/dashboardAlerts.js');
  if (typeof mod.clearAlerts === 'function') return mod.clearAlerts();
  return { ok: false, error: 'clearAlerts missing' };
}

async function actionSessionLogin() {
  const mod = await import('../lib/dashboardSession.js');
  const token = mod.createSessionToken('founder');
  return { ok: true, token, cookie: mod.sessionCookie(token), days: Number(process.env.DASH_SESSION_DAYS || 30) };
}

async function actionGodHeal() {
  const out = { health: null, cron_heal: null, snap: null };
  try {
    const hm = await import('../lib/healthManager.js');
    if (typeof hm.runFullCheck === 'function') out.health = await hm.runFullCheck();
  } catch (e) {
    out.health = { ok: false, error: e.message };
  }
  try {
    const cm = await import('../lib/cronManager.js');
    out.cron_heal = await cm.healJobs({});
  } catch (e) {
    out.cron_heal = { ok: false, error: e.message };
  }
  try {
    const snap = await import('../lib/snapDeployManager.js');
    if (typeof snap.wakeAll === 'function') out.snap = await snap.wakeAll();
    else if (typeof snap.listContainers === 'function') out.snap = { list: await snap.listContainers() };
    else out.snap = { note: 'snap manager present — use bot snap wake' };
  } catch (e) {
    out.snap = { ok: false, error: e.message || 'snap unavailable' };
  }
  return { ok: true, action: 'god_heal', ...out };
}

async function actionDashThink(q) {
  const mod = await import('../lib/dashboardChat.js');
  return mod.handleChat('think ' + String(q || '').trim());
}



async function actionShadowList() {
  const sm = await import('../lib/shadowManager.js');
  const tasks = await sm.listTasks({ status: 'pending', limit: 30 });
  return { ok: true, tasks };
}
async function actionShadowAdd(text) {
  const sm = await import('../lib/shadowManager.js');
  const row = await sm.addTask(text);
  return { ok: true, task: row };
}
async function actionShadowMorning() {
  const sm = await import('../lib/shadowManager.js');
  return await sm.runMorningReport({ sendTelegram: true });
}
async function actionShadowDone(id) {
  const sm = await import('../lib/shadowManager.js');
  await sm.setTaskStatus(id, 'done');
  return { ok: true, id };
}
async function actionShadowDelete(id) {
  const sm = await import('../lib/shadowManager.js');
  await sm.setTaskStatus(id, 'cancelled');
  return { ok: true, id };
}
async function actionBrainList() {
  const bm = await import('../lib/brainManager.js');
  const items = await bm.listBrain(20);
  // mask secrets for list
  const safe = items.map((x) => ({
    ...x,
    value_masked: x.sensitivity === 'secret' ? '***' : x.value,
    value: x.sensitivity === 'secret' ? '***' : x.value,
  }));
  return { ok: true, items: safe };
}
async function actionBrainRemember(key, value) {
  const bm = await import('../lib/brainManager.js');
  const row = await bm.remember({ key_display: key, value });
  return { ok: true, item: row };
}
async function actionBrainForget(q) {
  const bm = await import('../lib/brainManager.js');
  const row = await bm.forget(q);
  return { ok: true, deleted: row };
}
async function actionBrainRecall(q) {
  const bm = await import('../lib/brainManager.js');
  const row = await bm.recall(q);
  return { ok: true, item: row };
}



async function actionJobsList() {
  const j = await import('../lib/platformJobs.js');
  return { ok: true, jobs: await j.listJobs(25) };
}
async function actionJobGet(id) {
  const j = await import('../lib/platformJobs.js');
  const job = await j.getJob(id);
  return { ok: !!job, job };
}
async function actionJobEnqueue(type, input) {
  const j = await import('../lib/platformJobs.js');
  const job = await j.enqueueJob(type, input || {});
  return { ok: true, job };
}
async function actionEvents() {
  const j = await import('../lib/platformJobs.js');
  return { ok: true, events: await j.listEvents(30) };
}
async function actionChatProHistory(limit, before) {
  const c = await import('../lib/chatPro.js');
  return c.history(limit || 100, before || null);
}
async function actionChatProSend(message) {
  const c = await import('../lib/chatPro.js');
  return c.send(message);
}
async function actionChatProClear() {
  const c = await import('../lib/chatPro.js');
  return c.clearHistory();
}
async function actionBrainProList() {
  const b = await import('../lib/brainPro.js');
  return { ok: true, items: await b.listMasked(40) };
}
async function actionBrainProSearch(q) {
  const b = await import('../lib/brainPro.js');
  return { ok: true, items: await b.search(q, 30) };
}
async function actionBrainProReveal(key) {
  const b = await import('../lib/brainPro.js');
  return b.reveal(key);
}



async function actionBankSummary() {
  const b = await import('../lib/bankManager.js');
  return b.summary(30);
}
async function actionBankList() {
  const b = await import('../lib/bankManager.js');
  return { ok: true, transactions: await b.listTransactions(50) };
}
async function actionBankAdd(body) {
  const b = await import('../lib/bankManager.js');
  const row = await b.addTransaction(body || {});
  return { ok: true, transaction: row };
}
async function actionBankDelete(id) {
  const b = await import('../lib/bankManager.js');
  await b.deleteTransaction(id);
  return { ok: true, id };
}
async function actionBankBill(body) {
  const b = await import('../lib/bankManager.js');
  let payload = body || {};
  if (payload.text && !payload.amount) {
    const parsed = b.parseBillText(payload.text);
    if (parsed) payload = { ...payload, ...parsed };
  }
  const row = await b.addTransaction({ ...payload, source: payload.source || 'bill' });
  return { ok: true, transaction: row };
}
async function actionApkStatus() {
  const a = await import('../lib/apkStatus.js');
  return a.getApkStatus();
}



async function actionDriveList() {
  const d = await import('../lib/driveManager.js');
  return d.listDrive(50);
}
async function actionDriveSign(path) {
  const d = await import('../lib/driveManager.js');
  return d.signFile(path);
}
async function actionDriveDelete(path) {
  const d = await import('../lib/driveManager.js');
  return d.removeFile(path);
}


async function actionMailSend(body = {}) {
  const m = await import('../lib/mailManager.js');
  return m.sendEmail(body);
}
async function actionMailStatus() {
  const m = await import('../lib/mailManager.js');
  return {
    ok: true,
    configured: m.mailConfigured(),
    from: process.env.RESEND_FROM || process.env.MAIL_FROM || null,
    to: process.env.FOUNDER_EMAIL || process.env.MAIL_TO || null,
  };
}
async function actionVoiceSpeak(body = {}) {
  const v = await import('../lib/voiceDash.js');
  return v.speakForDashboard(body.text || body.message || '');
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

  // Pre-auth: session_login with body.secret or query secret
  const preAction = String(req.query?.action || '').toLowerCase();
  if (req.method === 'POST' && (preAction === 'session_login' || preAction === 'remember')) {
    const body = parseBody(req);
    const sec = String(process.env.DASH_SECRET || '').trim();
    const provided =
      body.secret ||
      req.query?.secret ||
      (String(req.headers?.authorization || '').toLowerCase().startsWith('bearer ')
        ? String(req.headers.authorization).slice(7).trim()
        : '');
    if (!sec || provided !== sec) {
      return json(res, 401, { ok: false, error: 'invalid DASH_SECRET' });
    }
    const r = await actionSessionLogin();
    res.setHeader('Set-Cookie', r.cookie);
    return json(res, 200, { ok: true, token: r.token, days: r.days });
  }

  const auth = await authorize(req);
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
      if (action === 'warroom' || action === 'war_room' || action === 'nation') return json(res, 200, await actionWarRoom());
      if (action === 'missions') return json(res, 200, await actionMissionList());
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
      if (action === 'chat_history' || action === 'history') {
        return json(res, 200, await actionChatHistory());
      }
      if (action === 'usage' || action === 'stats') {
        return json(res, 200, await actionUsage());
      }
      if (action === 'alerts') {
        return json(res, 200, await actionAlerts());
      }
      if (action === 'shadow' || action === 'shadow_list') {
        return json(res, 200, await actionShadowList());
      }
      if (action === 'brain' || action === 'brain_list') {
        return json(res, 200, await actionBrainList());
      }
      if (action === 'brain_pro' || action === 'brain_pro_list') {
        return json(res, 200, await actionBrainProList());
      }
      if (action === 'jobs' || action === 'platform_jobs') {
        return json(res, 200, await actionJobsList());
      }
      if (action === 'job' || action === 'job_status') {
        const id = req.query?.id;
        return json(res, 200, await actionJobGet(id));
      }
      if (action === 'events' || action === 'activity') {
        return json(res, 200, await actionEvents());
      }
      if (action === 'chat_pro_history' || action === 'chat_history_pro') {
        return json(res, 200, await actionChatProHistory(Number(req.query?.limit || 100), req.query?.before));
      }
      if (action === 'bank' || action === 'bank_summary') {
        return json(res, 200, await actionBankSummary());
      }
      if (action === 'bank_list' || action === 'bank_tx') {
        return json(res, 200, await actionBankList());
      }
      if (action === 'apk' || action === 'apk_status') {
        return json(res, 200, await actionApkStatus());
      }
      if (action === 'drive' || action === 'drive_list') {
        return json(res, 200, await actionDriveList());
      }
      if (action === 'mail_status') {
        return json(res, 200, await actionMailStatus());
      }
      return json(res, 200, await actionOverview());
    }

    if (req.method === 'POST') {
      if (action === 'session_login' || action === 'remember') {
        if (!dashSecretOk(req) && !(await authorize(req)).ok) {
          // allow body.secret
          const body = parseBody(req);
          const sec = String(process.env.DASH_SECRET || '').trim();
          if (!sec || body.secret !== sec) {
            return json(res, 401, { ok: false, error: 'unauthorized for session' });
          }
        }
        const r = await actionSessionLogin();
        res.setHeader('Set-Cookie', r.cookie);
        return json(res, 200, { ok: true, token: r.token, days: r.days });
      }
      if (action === 'session_logout') {
        const sess = await import('../lib/dashboardSession.js');
        res.setHeader('Set-Cookie', sess.clearSessionCookie());
        return json(res, 200, { ok: true });
      }
      if (action === 'chat') {
        const body = parseBody(req);
        const msg = body.message || body.text || body.q || '';
        return json(res, 200, await actionChat(msg));
      }
      if (action === 'think' || action === 'dash_think') {
        const body = parseBody(req);
        return json(res, 200, await actionDashThink(body.q || body.message || body.text || ''));
      }
      if (action === 'god_heal' || action === 'emergency_heal') {
        return json(res, 200, await actionGodHeal());
      }
      if (action === 'shadow_add') {
        const body = parseBody(req);
        return json(res, 200, await actionShadowAdd(body.text || body.task || ''));
      }
      if (action === 'shadow_morning') {
        return json(res, 200, await actionShadowMorning());
      }
      if (action === 'shadow_done') {
        const body = parseBody(req);
        return json(res, 200, await actionShadowDone(body.id || req.query?.id));
      }
      if (action === 'shadow_delete') {
        const body = parseBody(req);
        return json(res, 200, await actionShadowDelete(body.id || req.query?.id));
      }
      if (action === 'brain_remember') {
        const body = parseBody(req);
        return json(res, 200, await actionBrainRemember(body.key || body.key_display, body.value));
      }
      if (action === 'brain_forget') {
        const body = parseBody(req);
        return json(res, 200, await actionBrainForget(body.q || body.key || body.id));
      }
      if (action === 'brain_recall') {
        const body = parseBody(req);
        return json(res, 200, await actionBrainRecall(body.q || body.key));
      }
      if (action === 'brain_pro_search') {
        const body = parseBody(req);
        return json(res, 200, await actionBrainProSearch(body.q || body.query || ''));
      }
      if (action === 'brain_reveal' || action === 'brain_pro_reveal') {
        const body = parseBody(req);
        return json(res, 200, await actionBrainProReveal(body.key || body.id || body.q));
      }
      if (action === 'chat_pro' || action === 'chat_pro_send') {
        const body = parseBody(req);
        return json(res, 200, await actionChatProSend(body.message || body.text || ''));
      }
      if (action === 'chat_pro_clear') {
        return json(res, 200, await actionChatProClear());
      }
      if (action === 'job_enqueue') {
        const body = parseBody(req);
        return json(res, 200, await actionJobEnqueue(body.type || 'generic', body.input || body));
      }
      if (action === 'bank_add' || action === 'bank_tx_add') {
        const body = parseBody(req);
        return json(res, 200, await actionBankAdd(body));
      }
      if (action === 'bank_delete' || action === 'bank_tx_delete') {
        const body = parseBody(req);
        const id = body.id || body.tx_id || req.query?.id || '';
        if (!id) return json(res, 400, { ok: false, error: 'id required' });
        return json(res, 200, await actionBankDelete(String(id)));
      }
      if (action === 'bank_bill' || action === 'bank_bill_ingest') {
        const body = parseBody(req);
        return json(res, 200, await actionBankBill(body));
      }
      if (action === 'drive_sign') {
        const body = parseBody(req);
        return json(res, 200, await actionDriveSign(body.path || body.name));
      }
      if (action === 'drive_delete') {
        const body = parseBody(req);
        return json(res, 200, await actionDriveDelete(body.path || body.name));
      }
      if (action === 'mail_send') {
        const body = parseBody(req);
        return json(res, 200, await actionMailSend(body));
      }
      if (action === 'voice_speak') {
        const body = parseBody(req);
        return json(res, 200, await actionVoiceSpeak(body));
      }
      if (action === 'alerts_seen') {
        return json(res, 200, await actionAlertsSeen());
      }
      if (action === 'alerts_clear') {
        return json(res, 200, await actionAlertsClear());
      }
      if (action === 'heal_now') {
        return json(res, 200, await actionHealNow());
      }
      if (action === 'heal_dry') {
        return json(res, 200, await actionHealDry());
      }
      if (action === 'sentinel_scan') {
        return json(res, 200, await actionSentinelScan());
      }
      if (action === 'scout_os') {
        return json(res, 200, await actionScoutOs());
      }
      if (action === 'think_worker' || action === 'worker') {
        return json(res, 200, await actionThinkWorker());
      }
      if (action === 'voice_on') return json(res, 200, await actionVoice(true));
      if (action === 'voice_off') return json(res, 200, await actionVoice(false));
      if (action === 'night_run' || action === 'night') {
        return json(res, 200, await actionNightRun());
      }
      const body = parseBody(req);
      const id = pickJobId(req, body);
      if (action === 'cron_enable' || action === 'cron_on') {
        if (!id) return json(res, 400, { ok: false, error: 'id required (body.id or ?id=)' });
        try {
          const r = await actionCronEnable(id);
          return json(res, 200, r);
        } catch (e) {
          return json(res, 500, { ok: false, error: e.message || String(e), action: 'cron_enable', id });
        }
      }
      if (action === 'cron_disable' || action === 'cron_off') {
        if (!id) return json(res, 400, { ok: false, error: 'id required (body.id or ?id=)' });
        try {
          const r = await actionCronDisable(id);
          return json(res, 200, r);
        } catch (e) {
          return json(res, 500, { ok: false, error: e.message || String(e), action: 'cron_disable', id });
        }
      }
      if (action === 'cron_delete') {
        if (!id) return json(res, 400, { ok: false, error: 'id required (body.id or ?id=)' });
        try {
          const r = await actionCronDelete(id);
          return json(res, 200, r);
        } catch (e) {
          return json(res, 500, { ok: false, error: e.message || String(e), action: 'cron_delete', id });
        }
      }
      if (action === 'cron_heal') {
        try {
          return json(res, 200, await actionCronHeal());
        } catch (e) {
          return json(res, 500, { ok: false, error: e.message || String(e), action: 'cron_heal' });
        }
      }
      return json(res, 400, {
        ok: false,
        error: 'unknown POST action',
        actions: ['chat','think','god_heal','session_login','think_worker','voice_on','voice_off','night_run','cron_enable','cron_disable','cron_delete','cron_heal','alerts_seen','alerts_clear','heal_now','heal_dry','sentinel_scan','auth'],
      });
    }

    return json(res, 405, { ok: false, error: 'method not allowed' });
  } catch (e) {
    return json(res, 500, { ok: false, error: e.message || String(e) });
  }
}
