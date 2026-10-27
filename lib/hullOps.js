/**
 * Phase E — Hull ops: health, wake, job get/retry, DNA on failure
 */
const ADMIN = () =>
  String(process.env.ADMIN_ID || process.env.FOUNDER_ID || '').trim();

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

function hullB() {
  return (process.env.HULL_B_URL || '').replace(/\/$/, '');
}
function secret() {
  return process.env.HULL_SHARED_SECRET || process.env.CRON_SECRET || '';
}

export async function pingHullB() {
  const base = hullB();
  if (!base) return { ok: false, error: 'HULL_B_URL missing' };
  const t0 = Date.now();
  try {
    const res = await fetch(base + '/api/worker', { method: 'GET' });
    const j = await res.json().catch(() => ({}));
    return {
      ok: res.ok,
      ms: Date.now() - t0,
      status: res.status,
      body: j,
    };
  } catch (e) {
    return { ok: false, ms: Date.now() - t0, error: e.message || String(e) };
  }
}

export async function wakeHullB(max = 3) {
  const base = hullB();
  const sec = secret();
  if (!base) throw new Error('HULL_B_URL missing');
  if (!sec) throw new Error('HULL_SHARED_SECRET missing');
  const res = await fetch(
    base + '/api/worker?secret=' + encodeURIComponent(sec),
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-hull-secret': sec,
      },
      body: JSON.stringify({ action: 'process', max }),
    }
  );
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch (_) {
    json = { raw: text.slice(0, 300) };
  }
  if (!res.ok) {
    throw new Error(
      (json && (json.error || json.message || json.raw)) ||
        'HTTP ' + res.status
    );
  }
  return json;
}

export async function getJob(idPrefix) {
  const q = String(idPrefix || '').trim();
  if (!q) throw new Error('job id required');
  // uuid prefix match via string cast
  const path =
    'rq_hull_jobs?select=*&order=created_at.desc&limit=5&id=like.' +
    encodeURIComponent(q + '%');
  let rows;
  try {
    rows = await rest(path);
  } catch (_) {
    // fallback: fetch recent and filter
    const all = await rest(
      'rq_hull_jobs?select=*&order=created_at.desc&limit=30'
    );
    rows = (Array.isArray(all) ? all : []).filter((r) =>
      String(r.id || '').startsWith(q)
    );
  }
  if (!Array.isArray(rows) || !rows[0]) return null;
  // prefer exact prefix longest match
  rows.sort(
    (a, b) => String(a.id).length - String(b.id).length
  );
  return rows.find((r) => String(r.id).startsWith(q)) || rows[0];
}

export async function retryJob(idPrefix) {
  const job = await getJob(idPrefix);
  if (!job) throw new Error('job not found: ' + idPrefix);
  const attempts = Number(job.attempts || 0) + 1;
  // re-queue
  await rest('rq_hull_jobs?id=eq.' + encodeURIComponent(job.id), {
    method: 'PATCH',
    prefer: 'return=minimal',
    body: JSON.stringify({
      status: 'queued',
      error: null,
      result: null,
      started_at: null,
      finished_at: null,
      attempts,
    }),
  });
  let wake = null;
  try {
    wake = await wakeHullB(2);
  } catch (e) {
    wake = { error: e.message };
  }
  return { id: job.id, attempts, wake };
}

export async function recordFailedJobsToDna(limit = 5) {
  let dna;
  try {
    dna = await import('./errorDna.js');
  } catch (_) {
    return { ok: false, error: 'errorDna missing' };
  }
  const rows = await rest(
    'rq_hull_jobs?status=eq.failed&order=finished_at.desc&limit=' + limit
  );
  const list = Array.isArray(rows) ? rows : [];
  let n = 0;
  for (const r of list) {
    try {
      await dna.recordErrorDna({
        message: r.error || 'hull job failed',
        command: r.kind || 'hull_job',
        filePath: 'hull-b',
        status: 'open',
        meta: { jobId: r.id },
      });
      n++;
    } catch (_) {}
  }
  return { ok: true, logged: n };
}

export async function handleHullOps(text, ctx) {
  if (String(ctx?.from?.id || '') !== ADMIN()) return '👑 Founder-only.';
  const raw = String(text || '').trim();
  const body = raw.replace(/^\/hull\s*/i, '').trim();
  const [action, ...rest] = body.split(/\s+/);
  const a = (action || '').toLowerCase();
  const arg = rest.join(' ').trim();

  // also allow /hullops as alias via text starting with /hullops
  const isOps =
    /^\/hullops\b/i.test(raw) ||
    ['ping', 'wake', 'get', 'retry', 'dna', 'ops'].includes(a);

  if (/^\/hullops\b/i.test(raw)) {
    const sub = raw.replace(/^\/hullops\s*/i, '').trim();
    const [s2, ...r2] = sub.split(/\s+/);
    return handleHullOps('/hull ' + (s2 || 'help') + ' ' + r2.join(' '), ctx);
  }

  if (a === 'ping' || a === 'b-ping') {
    const r = await pingHullB();
    if (!r.ok) {
      return (
        '🛰 Hull B PING ❌\n' +
        (r.error || 'status ' + r.status) +
        ' · ' +
        r.ms +
        'ms\nURL: ' +
        (hullB() || 'missing')
      );
    }
    return (
      '🛰 Hull B PING ✅\n' +
      r.ms +
      'ms · HTTP ' +
      r.status +
      '\n' +
      JSON.stringify(r.body || {}).slice(0, 200)
    );
  }

  if (a === 'wake') {
    const r = await wakeHullB(Number(arg) || 3);
    return (
      '🛰 Hull B WAKE\nprocessed: ' +
      (r.processed ?? '?') +
      '\n' +
      JSON.stringify(r.results || r).slice(0, 500)
    );
  }

  if (a === 'get') {
    const job = await getJob(arg);
    if (!job) return 'Job not found: ' + arg;
    return (
      '📦 JOB `' +
      String(job.id).slice(0, 13) +
      '`\n' +
      'status: **' +
      job.status +
      '** · kind: ' +
      job.kind +
      '\n' +
      (job.error ? 'error: ' + job.error + '\n' : '') +
      (job.result
        ? 'result: ' + JSON.stringify(job.result).slice(0, 400) + '\n'
        : '') +
      'created: ' +
      job.created_at
    );
  }

  if (a === 'retry') {
    const r = await retryJob(arg);
    return (
      '♻️ Re-queued `' +
      String(r.id).slice(0, 13) +
      '` · attempts=' +
      r.attempts +
      '\nWake: ' +
      JSON.stringify(r.wake).slice(0, 200)
    );
  }

  if (a === 'dna') {
    const r = await recordFailedJobsToDna(8);
    return '🧬 Logged failed jobs to Error DNA: ' + (r.logged ?? 0);
  }

  if (a === 'ops' || a === 'help') {
    return (
      '🛰 HULL OPS (Phase E)\n' +
      '/hull ping — Hull B health\n' +
      '/hull wake — process queue now\n' +
      '/hull get <id-prefix>\n' +
      '/hull retry <id-prefix>\n' +
      '/hull dna — failed jobs → Error DNA\n' +
      '/shadow help — Shadow Twin drafts\n' +
      '/hulljobs — job list'
    );
  }

  return null; // let phaseD hullControl handle create/list/env
}

export default {
  pingHullB,
  wakeHullB,
  getJob,
  retryJob,
  handleHullOps,
};
