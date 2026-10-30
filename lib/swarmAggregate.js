/**
 * swarmAggregate.js — Agent-10
 * Aggregate Hull B research job results → one digest
 * Optional AI synthesis (Groq) + save to Supabase rq_swarm_digests
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

function pickText(result) {
  if (!result) return '';
  if (typeof result === 'string') return result;
  if (result.text) return String(result.text);
  if (result.markdown) return String(result.markdown);
  if (result.answer) return String(result.answer);
  if (result.summary) return String(result.summary);
  try {
    return JSON.stringify(result);
  } catch (_) {
    return String(result);
  }
}

function pickQuery(job) {
  const p = job.payload || {};
  return (
    p.query ||
    p.topic ||
    p.q ||
    job.topic ||
    job.query ||
    (job.kind || 'research')
  );
}

/** Fetch recent done research-like jobs */
export async function fetchDoneResearchJobs({ limit = 10, ids = [] } = {}) {
  if (ids && ids.length) {
    // fetch by id prefixes or full uuids
    const rows = await rest(
      'rq_hull_jobs?select=id,kind,status,payload,result,error,created_at,finished_at&order=created_at.desc&limit=40'
    );
    const list = Array.isArray(rows) ? rows : [];
    return list.filter((j) => {
      const id = String(j.id || '');
      return ids.some((x) => id.startsWith(String(x)) || id === String(x));
    });
  }
  const rows = await rest(
    'rq_hull_jobs?status=eq.done&select=id,kind,status,payload,result,error,created_at,finished_at&order=created_at.desc&limit=' +
      Math.min(30, limit)
  );
  const list = Array.isArray(rows) ? rows : [];
  return list.filter((j) => {
    const k = String(j.kind || '').toLowerCase();
    return k === 'research' || k === 'researchdeep' || k === 'telegram_cmd';
  });
}

async function maybeSynthesize(sections) {
  const key = process.env.GROQ_API_KEY;
  if (!key) return null;
  const models = [
    process.env.GROQ_MODEL,
    'llama-3.3-70b-versatile',
    'llama-3.1-8b-instant',
  ].filter(Boolean);
  const prompt =
    'Synthesize these research snippets into ONE concise briefing (max 12 bullets, English or Sinhala mix ok). Cite topics.\n\n' +
    sections.map((s, i) => '[' + (i + 1) + '] ' + s.topic + ':\n' + s.text.slice(0, 1200)).join('\n\n');
  for (const model of models) {
    try {
      const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + key,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          temperature: 0.2,
          max_tokens: 900,
          messages: [
            { role: 'system', content: 'You are a research analyst. Be factual and brief.' },
            { role: 'user', content: prompt.slice(0, 12000) },
          ],
        }),
        signal: AbortSignal.timeout(25000),
      });
      const j = await r.json();
      const out =
        j &&
        j.choices &&
        j.choices[0] &&
        j.choices[0].message &&
        j.choices[0].message.content;
      if (out && String(out).trim()) return { model, text: String(out).trim() };
    } catch (_) {}
  }
  return null;
}

export async function aggregateRecent({ limit = 5, ids = [], ownerId = '' } = {}) {
  const jobs = await fetchDoneResearchJobs({ limit: Math.max(limit, ids.length || 0), ids });
  if (!jobs.length) {
    return 'No done research jobs to aggregate.\nRun: swarm research topic1 | topic2\nThen: swarm aggregate';
  }

  const sections = jobs.slice(0, limit).map((j) => {
    const topic = String(pickQuery(j)).slice(0, 120);
    const text = pickText(j.result).slice(0, 2500);
    return {
      id: String(j.id || '').slice(0, 8),
      topic,
      text: text || '(empty result)',
      error: j.error || null,
    };
  });

  const lines = [
    '🐝 SWARM AGGREGATE · ' + sections.length + ' jobs',
    '',
  ];
  sections.forEach((s, i) => {
    lines.push((i + 1) + '. [' + s.id + '] ' + s.topic);
    lines.push(s.text.slice(0, 500).replace(/\s+/g, ' ').trim());
    if (s.error) lines.push('   ⚠ ' + String(s.error).slice(0, 80));
    lines.push('');
  });

  const synth = await maybeSynthesize(sections);
  if (synth) {
    lines.push('── AI BRIEF (' + synth.model + ') ──');
    lines.push(synth.text.slice(0, 2800));
  } else {
    lines.push('(No AI brief — GROQ_API_KEY missing or failed; raw snippets above)');
  }

  // Persist digest (best-effort)
  try {
    await rest('rq_swarm_digests', {
      method: 'POST',
      prefer: 'return=minimal',
      body: JSON.stringify({
        owner_id: ownerId || null,
        job_ids: sections.map((s) => s.id),
        topics: sections.map((s) => s.topic),
        body: lines.join('\n').slice(0, 20000),
        meta: { count: sections.length, ai: !!synth },
      }),
    });
    lines.push('', '💾 Saved → rq_swarm_digests');
  } catch (e) {
    lines.push('', '💾 Digest table skip: ' + (e.message || e));
  }

  return lines.join('\n').slice(0, 4000);
}

/** Cron entry: aggregate last N and optionally DM founder */
export async function jobSwarmDigest() {
  const admin = String(process.env.ADMIN_ID || process.env.FOUNDER_ID || '').trim();
  const text = await aggregateRecent({ limit: 5, ownerId: admin });
  if (admin && process.env.BOT_TOKEN) {
    try {
      await fetch('https://api.telegram.org/bot' + process.env.BOT_TOKEN + '/sendMessage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: admin,
          text: '⏰ Scheduled Swarm Digest\n\n' + String(text).slice(0, 3900),
        }),
      });
    } catch (_) {}
  }
  return { ok: true, job: 'swarmdigest', chars: String(text).length };
}

/** Save / list simple schedules in rq_swarm_schedules */
export async function scheduleSwarm({ topics, cronExpr = '0 1 * * *', ownerId = '' }) {
  const list = (topics || []).map((t) => String(t).trim()).filter(Boolean).slice(0, 5);
  if (!list.length) return 'Need topics. Example: swarm schedule daily | pgvector | supabase | vercel free';
  try {
    const row = await rest('rq_swarm_schedules', {
      method: 'POST',
      prefer: 'return=representation',
      body: JSON.stringify({
        owner_id: ownerId || null,
        topics: list,
        cron: cronExpr,
        active: true,
      }),
    });
    const id = Array.isArray(row) && row[0] ? row[0].id : '?';
    return (
      '✅ Swarm schedule saved\n' +
      'id: ' +
      String(id).slice(0, 8) +
      '\ntopics: ' +
      list.join(' | ') +
      '\ncron: ' +
      cronExpr +
      '\n\nWire cron-job.org → /api/cron?job=swarmdigest&secret=CRON_SECRET (daily)\n' +
      'Manual: swarm aggregate'
    );
  } catch (e) {
    return (
      'Schedule save failed: ' +
      (e.message || e) +
      '\nRun sql/V6000_AGENT10_SWARM.sql then retry.\nYou can still: swarm research ... && swarm aggregate'
    );
  }
}

export async function listSchedules() {
  try {
    const rows = await rest(
      'rq_swarm_schedules?select=id,topics,cron,active,created_at&order=created_at.desc&limit=10'
    );
    const list = Array.isArray(rows) ? rows : [];
    if (!list.length) return 'No swarm schedules. Example: swarm schedule daily | ai news | supabase';
    return list
      .map((r, i) => {
        const topics = Array.isArray(r.topics) ? r.topics.join(' | ') : String(r.topics || '');
        return (
          i +
          1 +
          '. `' +
          String(r.id || '').slice(0, 8) +
          '` · ' +
          (r.active ? 'ON' : 'off') +
          ' · ' +
          (r.cron || '?') +
          '\n   ' +
          topics.slice(0, 120)
        );
      })
      .join('\n');
  } catch (e) {
    return 'list schedules: ' + (e.message || e);
  }
}

export default {
  aggregateRecent,
  jobSwarmDigest,
  scheduleSwarm,
  listSchedules,
  fetchDoneResearchJobs,
};
