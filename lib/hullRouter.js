/**
 * Phase D2 — Route heavy work to Hull B (queue or HTTP proxy)
 * Hull A stays light. No new api/*.js on Hull A required.
 */
const ADMIN = () =>
  String(process.env.ADMIN_ID || process.env.FOUNDER_ID || '').trim();

/** Commands / prefixes treated as heavy */
export const HEAVY_PREFIXES = [
  '/researchdeep',
  '/research ',
  '/debug file',
  '/architect scan',
  '/architect retest',
  '/omniprompt',
  '/forgedrop',
  '/browse',
  '/docask',
  '/prfix',
  '/swarm recall',
];

export function isHeavyCommand(text) {
  const raw = String(text || '').trim();
  const t = raw.toLowerCase();
  if (!t.startsWith('/')) return false;

  // ALWAYS local — code repair / SQL / shadow / expect must never leave Hull A
  if (
    /^\/(debug|sql|shadow|expect|prfix|healcheck|doctor|patchlog|hulljobs|hullops)\b/.test(t)
  ) {
    return false;
  }

  // Flags: --local / -local / —local (emdash) / local=1
  if (
    /(?:^|\s)(--local|-local|—local|–local)\b/i.test(raw) ||
    /\blocal=1\b/i.test(raw)
  ) {
    return false;
  }

  // Force hull B
  if (/(?:^|\s)--hull-b\b/i.test(raw)) return true;

  return HEAVY_PREFIXES.some((p) => t.startsWith(p.toLowerCase()));
}

function sb() {
  const url = process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
  if (!url || !key) return null;
  return { url: url.replace(/\/$/, ''), key };
}

async function rest(path, opts = {}) {
  const s = sb();
  if (!s) throw new Error('Supabase not configured');
  const res = await fetch(s.url + '/rest/v1/' + path, {
    method: opts.method || 'GET',
    headers: {
      apikey: s.key,
      Authorization: 'Bearer ' + s.key,
      'Content-Type': 'application/json',
      Prefer: opts.prefer || 'return=representation',
    },
    body: opts.body,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch (_) {
    json = { raw: text.slice(0, 200) };
  }
  if (!res.ok) {
    throw new Error(
      (json && (json.message || json.error || json.raw)) ||
        'HTTP ' + res.status
    );
  }
  return json;
}

export async function enqueueJob({
  kind,
  payload,
  priority = 5,
  createdBy = '',
  hullTarget = 'b',
}) {
  const row = {
    kind: String(kind || 'generic').slice(0, 80),
    payload: payload || {},
    status: 'queued',
    priority,
    hull_target: hullTarget,
    created_by: createdBy || null,
  };
  const ins = await rest('rq_hull_jobs', {
    method: 'POST',
    prefer: 'return=representation',
    body: JSON.stringify(row),
  });
  const job = Array.isArray(ins) ? ins[0] : ins;
  if (!job || !job.id) {
    throw new Error('enqueue: no id returned — check rq_hull_jobs RLS / grants');
  }
  // read-back verify
  try {
    const check = await rest(
      'rq_hull_jobs?id=eq.' + encodeURIComponent(job.id) + '&select=id,status&limit=1'
    );
    if (!Array.isArray(check) || !check[0]) {
      throw new Error('enqueue: insert not readable after write (RLS?)');
    }
  } catch (e) {
    if (String(e.message || e).includes('readable') || String(e.message || e).includes('RLS')) throw e;
  }
  // optional: wake Hull B
  const wake = (process.env.HULL_B_URL || '').replace(/\/$/, '');
  const secret = process.env.HULL_SHARED_SECRET || process.env.CRON_SECRET || '';
  if (wake && secret) {
    try {
      await fetch(wake + '/api/worker?secret=' + encodeURIComponent(secret), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'process', jobId: job?.id }),
      });
    } catch (_) {}
  }
  return job;
}

export async function listJobs({ status = '', limit = 15 } = {}) {
  const lim = Math.min(30, limit);
  // Prefer recent jobs; optional status filter
  let path =
    'rq_hull_jobs?select=id,kind,status,priority,error,created_at,finished_at,started_at&order=created_at.desc&limit=' +
    lim;
  if (status && status !== 'all') {
    path += '&status=eq.' + encodeURIComponent(status);
  }
  try {
    const rows = await rest(path);
    return Array.isArray(rows) ? rows : [];
  } catch (e) {
    // surface error as pseudo-row for UI
    return [{ id: 'err', kind: 'list', status: 'error', error: String(e.message || e) }];
  }
}

export function formatJobs(rows) {
  if (!rows.length) return 'No hull jobs.';
  return rows
    .map((r, i) => {
      const id = String(r.id || '').slice(0, 13);
      return (
        i +
        1 +
        '. `' +
        id +
        '` · ' +
        (r.kind || '?') +
        ' · **' +
        (r.status || '?') +
        '**' +
        (r.error ? '\n   ❌ ' + String(r.error).slice(0, 80) : '')
      );
    })
    .join('\n');
}

/**
 * Proxy heavy command text to Hull B worker (sync, short timeout)
 * Hull B should implement POST /api/worker { action:'run', text, chatId }
 */
export async function proxyToHullB({ text, chatId, userId }) {
  const base = (process.env.HULL_B_URL || '').replace(/\/$/, '');
  const secret = process.env.HULL_SHARED_SECRET || process.env.CRON_SECRET || '';
  if (!base) throw new Error('HULL_B_URL not set');
  if (!secret) throw new Error('HULL_SHARED_SECRET or CRON_SECRET required');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 25000);
  try {
    const res = await fetch(base + '/api/worker', {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        'Content-Type': 'application/json',
        'x-hull-secret': secret,
      },
      body: JSON.stringify({
        action: 'run',
        text,
        chatId,
        userId,
        source: 'hull-a',
      }),
    });
    const body = await res.text();
    let json = null;
    try {
      json = body ? JSON.parse(body) : null;
    } catch (_) {
      json = { raw: body.slice(0, 500) };
    }
    if (!res.ok) {
      throw new Error(
        (json && (json.error || json.message || json.raw)) ||
          'HTTP ' + res.status
      );
    }
    return json;
  } finally {
    clearTimeout(timer);
  }
}

export async function handleHullJobsCmd(text, ctx) {
  if (String(ctx?.from?.id || '') !== ADMIN()) return '👑 Founder-only.';
  const arg = String(text || '')
    .replace(/^\/hulljobs\s*/i, '')
    .trim()
    .toLowerCase();
  if (!arg || arg === 'list' || arg === 'all') {
    const rows = await listJobs({ status: 'all', limit: 15 });
    return '📦 HULL JOBS (all)\n' + formatJobs(rows);
  }
  if (arg === 'queued' || arg === 'running' || arg === 'done' || arg === 'failed') {
    const rows = await listJobs({ status: arg, limit: 15 });
    return '📦 HULL JOBS (' + arg + ')\n' + formatJobs(rows);
  }
  if (arg === 'diag' || arg === 'status') {
    const mode = (process.env.HULL_MODE || 'off').toLowerCase();
    const b = process.env.HULL_B_URL || '';
    const sec = !!(process.env.HULL_SHARED_SECRET || process.env.CRON_SECRET);
    return (
      '📦 HULL ROUTE DIAG\n' +
      'HULL_MODE=' + mode + '\n' +
      'HULL_B_URL=' + (b || '❌ missing') + '\n' +
      'SECRET=' + (sec ? '✅' : '❌') + '\n' +
      'Heavy sample: /researchdeep → ' + (isHeavyCommand('/researchdeep x') ? 'YES' : 'NO') + '\n' +
      (mode === 'off' || mode === '0' || mode === 'false'
        ? '\n⚠️ MODE is off — set HULL_MODE=queue and REDEPLOY Hull A'
        : '\nMode active — heavy cmds should queue/proxy')
    );
  }
  if (arg === 'help') {
    return (
      '📦 HULL JOBS\n' +
      '/hulljobs — recent\n' +
      '/hulljobs queued\n' +
      '/hulljobs diag — show HULL_MODE / URL\n' +
      'Heavy cmds auto-queue when HULL_MODE=queue\n' +
      'Or proxy when HULL_MODE=proxy + HULL_B_URL set\n' +
      'Override: add --local (force A) or --hull-b (force B)'
    );
  }
  return 'Unknown. /hulljobs help';
}

/**
 * Called from telegram founder middleware before normal heavy handlers.
 * Returns reply string if handled (queued/proxied), else null.
 */
export async function maybeRouteHeavy({ text, ctx }) {
  // belt-and-suspenders local force
  if (/(?:^|\s)(--local|-local|—local)\b/i.test(String(text || ''))) return null;
  if (/^\/(debug|sql|shadow|expect)\b/i.test(String(text || '').trim())) return null;

  const mode = (process.env.HULL_MODE || 'off').toLowerCase();
  if (mode === 'off' || mode === '0' || mode === 'false') return null;
  if (!isHeavyCommand(text)) return null;

  const chatId = ctx?.chat?.id;
  const userId = ctx?.from?.id;

  if (mode === 'proxy') {
    try {
      const r = await proxyToHullB({ text, chatId, userId });
      if (r?.reply) return String(r.reply).slice(0, 4000);
      if (r?.queued) return '📦 Proxied → Hull B queued `' + String(r.id || '').slice(0, 8) + '`';
      return '📦 Hull B: ' + JSON.stringify(r).slice(0, 500);
    } catch (e) {
      // fallback queue
      try {
        const job = await enqueueJob({
          kind: 'telegram_cmd',
          payload: { text, chatId, userId },
          createdBy: String(userId || ''),
        });
        return (
          '⚠️ Proxy failed (' +
          String(e.message || e).slice(0, 80) +
          ')\n📦 Queued `' +
          String(job?.id || '').slice(0, 8) +
          '` for Hull B'
        );
      } catch (e2) {
        return '❌ Hull route: ' + String(e2.message || e2).slice(0, 200);
      }
    }
  }

  // default: queue
  try {
    const job = await enqueueJob({
      kind: 'telegram_cmd',
      payload: { text, chatId, userId },
      createdBy: String(userId || ''),
    });
    return (
      '📦 Queued on Hull B\n' +
      'Job `' +
      String(job?.id || '').slice(0, 8) +
      '` · ' +
      String(text).slice(0, 60) +
      '\n/hulljobs to track · worker wakes if HULL_B_URL set'
    );
  } catch (e) {
    return '❌ Queue failed: ' + String(e.message || e).slice(0, 200);
  }
}

export default {
  HEAVY_PREFIXES,
  isHeavyCommand,
  enqueueJob,
  listJobs,
  maybeRouteHeavy,
  handleHullJobsCmd,
  proxyToHullB,
};