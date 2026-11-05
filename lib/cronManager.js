/**
 * Agent-18 · cron-job.org Manager
 * Free REST API: https://api.cron-job.org
 * Auth: Authorization: Bearer <CRONJOB_API_KEY>
 *
 * Env:
 *   CRONJOB_API_KEY  (required) — Settings → API on cron-job.org
 *   CRON_SECRET      (optional) — auto-appended to keepalive URLs if missing
 *   VERCEL_URL / PROJECT URL for default targets
 */

const API = 'https://api.cron-job.org';

function apiKey() {
  return (
    process.env.CRONJOB_API_KEY ||
    process.env.CRON_JOB_ORG_API_KEY ||
    process.env.CRONJOBORG_API_KEY ||
    ''
  ).trim();
}

function headers() {
  const key = apiKey();
  if (!key) throw new Error('CRONJOB_API_KEY not set (cron-job.org → Settings → API)');
  return {
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
}

async function api(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: headers(),
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const msg =
      data?.message ||
      data?.error ||
      data?.raw ||
      `HTTP ${res.status}`;
    const err = new Error(String(msg).slice(0, 300));
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

/** Schedule helpers → cron-job.org schedule object */
function scheduleEveryMinutes(mins) {
  const m = Math.max(1, Math.min(59, Number(mins) || 5));
  // minutes array: every N minutes
  const minutes = [];
  for (let i = 0; i < 60; i += m) minutes.push(i);
  return {
    timezone: process.env.CRON_TZ || 'Asia/Colombo',
    expiresAt: 0,
    hours: [-1],
    mdays: [-1],
    minutes,
    months: [-1],
    wdays: [-1],
  };
}

function scheduleEveryHours(h = 1) {
  const hours = [];
  for (let i = 0; i < 24; i += Math.max(1, h)) hours.push(i);
  return {
    timezone: process.env.CRON_TZ || 'Asia/Colombo',
    expiresAt: 0,
    hours,
    mdays: [-1],
    minutes: [0],
    months: [-1],
    wdays: [-1],
  };
}

function scheduleDaily(hour = 1, minute = 0) {
  return {
    timezone: process.env.CRON_TZ || 'Asia/Colombo',
    expiresAt: 0,
    hours: [hour],
    mdays: [-1],
    minutes: [minute],
    months: [-1],
    wdays: [-1],
  };
}

/** Parse one cron field into cron-job.org array (-1 = *) */
function parseCronField(field, minV, maxV) {
  const f = String(field || '*').trim();
  if (f === '*') return [-1];
  if (f.includes('/')) {
    const [base, stepRaw] = f.split('/');
    const step = Math.max(1, Number(stepRaw) || 1);
    const start = base === '*' ? minV : Number(base);
    const out = [];
    for (let i = Number.isNaN(start) ? minV : start; i <= maxV; i += step) out.push(i);
    return out.length ? out : [-1];
  }
  if (f.includes(',')) {
    return f.split(',').map((x) => Number(x.trim())).filter((n) => !Number.isNaN(n));
  }
  if (f.includes('-')) {
    const [a, b] = f.split('-').map((x) => Number(x.trim()));
    const out = [];
    if (!Number.isNaN(a) && !Number.isNaN(b)) {
      for (let i = a; i <= b; i++) out.push(i);
    }
    return out.length ? out : [-1];
  }
  const n = Number(f);
  return Number.isNaN(n) ? [-1] : [n];
}

/** Standard 5-field cron: minute hour day-of-month month day-of-week */
function scheduleFromCronExpr(expr) {
  const parts = String(expr || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length < 5) return null;
  // allow 6-field with seconds — ignore seconds
  const p = parts.length >= 6 ? parts.slice(1, 6) : parts.slice(0, 5);
  const [min, hour, mday, month, wday] = p;
  return {
    timezone: process.env.CRON_TZ || 'Asia/Colombo',
    expiresAt: 0,
    minutes: parseCronField(min, 0, 59),
    hours: parseCronField(hour, 0, 23),
    mdays: parseCronField(mday, 1, 31),
    months: parseCronField(month, 1, 12),
    wdays: parseCronField(wday, 0, 6),
  };
}

/**
 * Parse schedule:
 *  - "0 2 * * *" / "0 7 * * *" (standard cron)
 *  - "5m" | "every 5m" | "15m" | "1h" | "daily" | "daily 7"
 */
function parseSchedule(raw) {
  const original = String(raw || '5m').trim();
  const s = original.toLowerCase();

  // Standard cron expression (5 or 6 fields)
  if (/^[\d\*\-\/,]+\s+[\d\*\-\/,]+\s+[\d\*\-\/,]+\s+[\d\*\-\/,]+\s+[\d\*\-\/,]+/.test(original)) {
    const sch = scheduleFromCronExpr(original);
    if (sch) return sch;
  }

  if (/daily|day/.test(s)) {
    const h = Number((s.match(/(\d{1,2})/) || [])[1] || 1);
    return scheduleDaily(h, 0);
  }
  if (/h|hour/.test(s)) {
    const n = Number((s.match(/(\d+)/) || [])[1] || 1);
    return scheduleEveryHours(n);
  }
  // plain "2:00" or "7:00"
  const hm = s.match(/^(\d{1,2}):(\d{2})$/);
  if (hm) return scheduleDaily(Number(hm[1]), Number(hm[2]));

  const n = Number((s.match(/(\d+)/) || [])[1] || 5);
  return scheduleEveryMinutes(n);
}

function describeSchedule(sch) {
  if (!sch) return '?';
  const mins = sch.minutes || [];
  const hours = sch.hours || [];
  const mdays = sch.mdays || [];
  const months = sch.months || [];
  const wdays = sch.wdays || [];
  const isStar = (arr) => Array.isArray(arr) && arr.length === 1 && arr[0] === -1;
  if (Array.isArray(mins) && mins[0] !== -1 && isStar(hours) && isStar(mdays)) {
    if (mins.length >= 12) return `every ~${Math.round(60 / mins.length)}m`;
    return `minutes: ${mins.slice(0, 8).join(',')}${mins.length > 8 ? '…' : ''}`;
  }
  if (!isStar(hours) && mins.length >= 1 && isStar(mdays) && isStar(months) && isStar(wdays)) {
    const m = mins[0] === -1 ? 0 : mins[0];
    const h = hours[0];
    if (hours.length === 1 && mins.length === 1) {
      return `daily @ ${h}:${String(m).padStart(2, '0')} (${sch.timezone || 'TZ'})`;
    }
  }
  // rebuild approx cron
  const fmt = (arr, starChar = '*') => (isStar(arr) ? starChar : arr.join(','));
  return `cron ${fmt(mins)} ${fmt(hours)} ${fmt(mdays)} ${fmt(months)} ${fmt(wdays)}`;
}

function statusEmoji(job) {
  if (job.enabled === false) return '⏸';
  const st = job.lastStatus;
  if (st === 1 || st === 200 || st === 201 || st === 204) return '✅';
  if (st === null || st === undefined || st === 0) return '⚪';
  if (st >= 400 || st === 2 || st === 3) return '❌';
  return '⚠️';
}

function formatJob(j) {
  const id = j.jobId ?? j.job_id ?? j.id;
  const title = j.title || j.url || 'untitled';
  const en = j.enabled !== false ? 'ON' : 'OFF';
  const last = j.lastStatus != null ? `last=${j.lastStatus}` : 'last=?';
  const next = j.nextExecution
    ? new Date(j.nextExecution * 1000).toISOString().replace('T', ' ').slice(0, 16)
    : '?';
  return `${statusEmoji(j)} #${id} · ${en} · ${title}\n   ${last} · next ${next} UTC\n   ${(j.url || '').slice(0, 200)}`;
}

async function listJobs() {
  const data = await api('GET', '/jobs');
  const jobs = data.jobs || data || [];
  return Array.isArray(jobs) ? jobs : [];
}

async function getJob(jobId) {
  const data = await api('GET', `/jobs/${jobId}`);
  return data.jobDetails || data.job || data;
}

async function createJob({ title, url, schedule, enabled = true }) {
  if (!url) throw new Error('url required');
  const job = {
    url: String(url).trim(),
    title: (title || 'PasiyaOS job').slice(0, 120),
    enabled: !!enabled,
    saveResponses: false,
    schedule: schedule || scheduleEveryMinutes(5),
    requestMethod: 0, // GET
  };
  const data = await api('PUT', '/jobs', { job });
  return data.jobId ?? data.job_id ?? data.id ?? data;
}

async function updateJob(jobId, patch) {
  const job = { ...patch };
  await api('PATCH', `/jobs/${jobId}`, { job });
  return true;
}

async function enableJob(jobId) {
  return updateJob(jobId, { enabled: true });
}

async function disableJob(jobId) {
  return updateJob(jobId, { enabled: false });
}

async function deleteJob(jobId) {
  await api('DELETE', `/jobs/${jobId}`);
  return true;
}

/**
 * Heal: re-enable disabled jobs matching our bot URLs,
 * report failed lastStatus jobs.
 */
async function healJobs(opts = {}) {
  const jobs = await listJobs();
  const base =
    process.env.VERCEL_PROJECT_PRODUCTION_URL ||
    process.env.VERCEL_URL ||
    'radiant-queen-pasiya-max-v2.vercel.app';
  const ours = jobs.filter((j) => {
    const u = String(j.url || '');
    return (
      u.includes(base) ||
      u.includes('radiant-queen') ||
      u.includes('/api/cron') ||
      (opts.all === true)
    );
  });

  const disabled = ours.filter((j) => j.enabled === false);
  const failed = ours.filter((j) => {
    const st = j.lastStatus;
    return st != null && st !== 0 && st !== 1 && st !== 200 && st !== 201 && st !== 204;
  });

  const enabledIds = [];
  for (const j of disabled) {
    try {
      await enableJob(j.jobId);
      enabledIds.push(j.jobId);
    } catch (e) {
      /* continue */
    }
  }

  return {
    total: jobs.length,
    ours: ours.length,
    reEnabled: enabledIds,
    failed: failed.map((j) => ({
      id: j.jobId,
      title: j.title,
      lastStatus: j.lastStatus,
      url: j.url,
    })),
    disabledBefore: disabled.length,
  };
}

/** Default keepalive URL for our bot */
function defaultKeepAliveUrl() {
  const host =
    process.env.VERCEL_PROJECT_PRODUCTION_URL ||
    (process.env.VERCEL_URL || 'radiant-queen-pasiya-max-v2.vercel.app').replace(/^https?:\/\//, '');
  const secret = process.env.CRON_SECRET || '';
  return `https://${host}/api/cron?job=keepalive&secret=${encodeURIComponent(secret)}`;
}

function helpText() {
  return (
    '⏱ CRON MANAGER · Agent-18 (cron-job.org API)\n\n' +
    'Commands\n' +
    '• cron list — all jobs\n' +
    '• cron status <id> — one job detail\n' +
    '• cron create title | url | 5m\n' +
    '• cron keepalive — create/ensure StrideClub keep-alive (5m)\n' +
    '• cron enable <id> / cron disable <id>\n' +
    '• cron delete <id> → then confirm cron delete <id>\n' +
    '• cron heal — re-enable our disabled jobs + report fails\n\n' +
    'Env: CRONJOB_API_KEY from cron-job.org → Settings → API\n' +
    'Safety: founder-only · delete needs confirm'
  );
}

export {
  apiKey,
  listJobs,
  getJob,
  createJob,
  updateJob,
  enableJob,
  disableJob,
  deleteJob,
  healJobs,
  parseSchedule,
  scheduleFromCronExpr,
  parseCronField,
  describeSchedule,
  formatJob,
  statusEmoji,
  defaultKeepAliveUrl,
  scheduleEveryMinutes,
  helpText,
};
