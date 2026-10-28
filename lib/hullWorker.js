/**
 * Hull worker — claim queue jobs + run V6000 skills
 */
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

export async function claimNextJob() {
  const rows = await rest(
    'rq_hull_jobs?status=eq.queued&order=priority.desc,created_at.asc&limit=1&select=*'
  );
  if (!Array.isArray(rows) || !rows[0]) return null;
  const job = rows[0];
  await rest('rq_hull_jobs?id=eq.' + encodeURIComponent(job.id), {
    method: 'PATCH',
    prefer: 'return=minimal',
    body: JSON.stringify({
      status: 'running',
      started_at: new Date().toISOString(),
    }),
  });
  return job;
}

export async function finishJob(id, { ok, result, error }) {
  await rest('rq_hull_jobs?id=eq.' + encodeURIComponent(id), {
    method: 'PATCH',
    prefer: 'return=minimal',
    body: JSON.stringify({
      status: ok ? 'done' : 'failed',
      result: result || null,
      error: error ? String(error).slice(0, 500) : null,
      finished_at: new Date().toISOString(),
    }),
  });
}

export async function processJob(job) {
  const kind = String(
    job.kind || job.type || job.skill || (job.payload && job.payload.skill) || 'research'
  ).toLowerCase();
  try {
    const skills = await import('./hullSkills.js');
    const result = await skills.processSkillJob({
      ...job,
      kind,
      payload: job.payload || job.input || { query: job.query },
    });
    await finishJob(job.id, { ok: true, result });
    return { ok: true, result };
  } catch (e) {
    await finishJob(job.id, { ok: false, error: e.message || String(e) });
    return { ok: false, error: e.message || String(e) };
  }
}

/** HTTP entry for Hull B /api/worker */
export async function handleWorkerRequest(body = {}) {
  const action = String(body.action || 'poll').toLowerCase();
  if (action === 'skills') {
    const { SKILL_NAMES } = await import('./hullSkills.js');
    return { ok: true, skills: SKILL_NAMES };
  }
  if (action === 'run') {
    const { runSkill } = await import('./hullSkills.js');
    const result = await runSkill(body.skill || body.kind, body.payload || body);
    return { ok: true, result };
  }
  // default poll
  const job = await claimNextJob();
  if (!job) return { ok: true, processed: 0, results: [] };
  const r = await processJob(job);
  return { ok: true, processed: 1, results: [r], id: job.id };
}

export default {
  claimNextJob,
  finishJob,
  processJob,
  handleWorkerRequest,
};
