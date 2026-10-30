/**
 * swarmScheduler.js — Agent-11
 * Run active rq_swarm_schedules → enqueue research jobs → aggregate digest
 */
'use strict';

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
    body: opts.body || undefined,
  });
  const text = await res.text();
  let json;
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

async function enqueueTopics(topics, ownerId) {
  const list = (topics || []).map((t) => String(t).trim()).filter(Boolean).slice(0, 5);
  const out = [];
  if (!list.length) return out;
  try {
    const hr = await import('./hullRouter.js');
    if (typeof hr.enqueueJob !== 'function') throw new Error('enqueueJob missing');
    for (const topic of list) {
      try {
        const job = await hr.enqueueJob({
          kind: 'research',
          payload: {
            query: topic,
            topic: topic,
            q: topic,
            text: topic,
            skill: 'research',
            swarm: true,
            scheduled: true,
            userId: ownerId || null,
          },
          priority: 4,
          createdBy: ownerId || 'cron',
          hullTarget: 'b',
        });
        out.push({ topic: topic, id: job && job.id, ok: true });
      } catch (e) {
        out.push({ topic: topic, ok: false, error: String(e.message || e) });
      }
    }
  } catch (e) {
    out.push({ ok: false, error: String(e.message || e) });
  }
  return out;
}

/** Load active schedules and enqueue their topics */
export async function runDueSchedules() {
  let rows = [];
  try {
    rows = await rest(
      'rq_swarm_schedules?active=eq.true&select=id,owner_id,topics,cron,last_run_at&order=created_at.asc&limit=20'
    );
  } catch (e) {
    return { ok: false, error: String(e.message || e), enqueued: [] };
  }
  const list = Array.isArray(rows) ? rows : [];
  const enqueued = [];
  for (const sch of list) {
    const topics = Array.isArray(sch.topics) ? sch.topics : [];
    const batch = await enqueueTopics(topics, sch.owner_id || '');
    enqueued.push({ scheduleId: sch.id, topics: topics, jobs: batch });
    try {
      await rest('rq_swarm_schedules?id=eq.' + encodeURIComponent(sch.id), {
        method: 'PATCH',
        prefer: 'return=minimal',
        body: JSON.stringify({ last_run_at: new Date().toISOString() }),
      });
    } catch (_) {}
  }
  return { ok: true, schedules: list.length, enqueued: enqueued };
}

/**
 * Full cron path:
 * 1) run due schedules (enqueue research)
 * 2) optional short wait note (Hull B processes async)
 * 3) aggregate recent done jobs + DM founder
 */
export async function jobSwarmCron() {
  const run = await runDueSchedules();
  const agg = await import('./swarmAggregate.js');
  // Aggregate whatever is already done; new jobs may still be running
  const digest = await agg.jobSwarmDigest();
  return {
    ok: true,
    job: 'swarmdigest',
    schedules: run,
    digest: digest,
  };
}

export async function runScheduleNow(ctx) {
  const run = await runDueSchedules();
  const lines = [
    '⏰ SWARM SCHEDULE RUN',
    'schedules: ' + (run.schedules || 0),
  ];
  (run.enqueued || []).forEach(function (b, i) {
    lines.push(
      i +
        1 +
        '. schedule ' +
        String(b.scheduleId || '').slice(0, 8) +
        ' · topics ' +
        (b.topics || []).length
    );
    (b.jobs || []).forEach(function (j) {
      lines.push(
        '   ' +
          (j.ok ? '✓' : '✗') +
          ' ' +
          String(j.topic || '').slice(0, 40) +
          (j.id ? ' · ' + String(j.id).slice(0, 8) : '') +
          (j.error ? ' · ' + j.error : '')
      );
    });
  });
  lines.push('', 'Hull B will process jobs. Then: swarm aggregate');
  return lines.join('\n');
}

export default { runDueSchedules, jobSwarmCron, runScheduleNow, enqueueTopics };
