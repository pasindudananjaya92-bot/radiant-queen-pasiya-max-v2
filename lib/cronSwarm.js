/**
 * lib/cronSwarm.js — job registry in Supabase; executed by /api/cron?job=swarm
 * Does NOT rewrite vercel.json every time (Vercel limits). Optional export helper only.
 */

export async function listJobs(supabase) {
  const { data, error } = await supabase
    .from('rq_cron_jobs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(30);
  if (error) return { ok: false, error: error.message };
  return { ok: true, jobs: data || [] };
}

export async function createJob(supabase, { name, schedule, action, payload }) {
  const row = {
    name: String(name || 'job').slice(0, 80),
    schedule: String(schedule || '0 * * * *').slice(0, 80),
    action: String(action || 'ping').slice(0, 40),
    payload: payload && typeof payload === 'object' ? payload : {},
    enabled: true,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase.from('rq_cron_jobs').insert(row).select().maybeSingle();
  if (error) return { ok: false, error: error.message };
  return { ok: true, job: data };
}

export async function deleteJob(supabase, idOrName) {
  const q = String(idOrName || '');
  let req = supabase.from('rq_cron_jobs').delete();
  if (/^[0-9a-f-]{36}$/i.test(q)) req = req.eq('id', q);
  else req = req.eq('name', q);
  const { error } = await req;
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function runDueJobs(supabase, log) {
  const { data: jobs, error } = await supabase
    .from('rq_cron_jobs')
    .select('*')
    .eq('enabled', true)
    .limit(20);
  if (error) return { ok: false, error: error.message };
  const results = [];
  for (const job of jobs || []) {
    try {
      let detail = '';
      if (job.action === 'ping' || job.action === 'health') {
        const base =
          process.env.CHRONOS_HEALTH_URL ||
          process.env.MINIAPP_URL ||
          'https://radiant-queen-pasiya-max-v2.vercel.app';
        const r = await fetch(base.replace(/\/$/, '') + '/api/health');
        detail = 'health ' + r.status;
      } else if (job.action === 'secreport') {
        detail = 'secreport queued (run /secreport manually for full scan)';
      } else if (job.action === 'swarm_init') {
        const swarm = await import('../lib/swarm.js');
        await swarm.ensureDefaultAgents(supabase);
        detail = 'swarm init ok';
      } else {
        detail = 'unknown action ' + job.action;
      }
      await supabase
        .from('rq_cron_jobs')
        .update({ last_run_at: new Date().toISOString(), last_result: detail })
        .eq('id', job.id);
      results.push({ name: job.name, ok: true, detail });
      if (log) await log(job.name + ': ' + detail);
    } catch (e) {
      results.push({ name: job.name, ok: false, detail: String(e.message || e) });
    }
  }
  return { ok: true, results };
}

export function formatJobs(jobs) {
  if (!jobs?.length) return 'No cron jobs. /cron create <name> | hourly | health';
  return jobs
    .map(
      (j, i) =>
        i +
        1 +
        '. ' +
        j.name +
        ' · ' +
        j.schedule +
        ' · ' +
        j.action +
        (j.enabled ? '' : ' (off)') +
        (j.last_result ? '\n   last: ' + j.last_result : '')
    )
    .join('\n');
}

export default { listJobs, createJob, deleteJob, runDueJobs, formatJobs };
