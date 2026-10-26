/**
 * v4000 C4 — Deep research queue
 * /researchdeep <topic> → queue → multi-search → long report → DM
 * Cron: processPendingResearchJobs()
 */
import { vaneSearch, formatSources } from './vaneSearch.js';

const ADMIN = () =>
  String(process.env.ADMIN_ID || process.env.FOUNDER_ID || '').trim();

function sb() {
  const url = process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
  if (!url || !key) return null;
  return { url: url.replace(/\/$/, ''), key };
}

async function sbFetch(path, opts = {}) {
  const c = sb();
  if (!c) throw new Error('Supabase not configured');
  const res = await fetch(c.url + '/rest/v1/' + path, {
    ...opts,
    headers: {
      apikey: c.key,
      Authorization: 'Bearer ' + c.key,
      'Content-Type': 'application/json',
      Prefer: opts.prefer || 'return=representation',
      ...(opts.headers || {}),
    },
  });
  const text = await res.text();
  let j = null;
  try {
    j = text ? JSON.parse(text) : null;
  } catch (_) {
    j = { raw: text };
  }
  if (!res.ok) {
    throw new Error(
      (j && (j.message || j.error || j.hint || j.raw)) || 'SB ' + res.status
    );
  }
  return j;
}

async function powerChatSafe(prompt, opts) {
  try {
    const mod = await import('./powerhouse.js');
    const fn = mod.powerChat || mod.default?.powerChat;
    if (!fn) return { ok: false, error: 'powerChat missing' };
    return await fn(prompt, opts || {});
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

export async function createResearchJob({ topic, ownerId, chatId }) {
  const row = {
    topic: String(topic || '').slice(0, 500),
    owner_id: String(ownerId || ADMIN()),
    chat_id: chatId ? String(chatId) : null,
    status: 'pending',
    progress: 'queued',
  };
  const inserted = await sbFetch('rq_search_jobs', {
    method: 'POST',
    body: JSON.stringify(row),
  });
  const job = Array.isArray(inserted) ? inserted[0] : inserted;
  if (!job?.id) throw new Error('Failed to create job');
  return job;
}

export async function getJob(id) {
  const raw = String(id || '').trim();
  if (!raw) return null;

  // Full UUID
  if (/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/i.test(raw)) {
    const rows = await sbFetch(
      'rq_search_jobs?id=eq.' + encodeURIComponent(raw) + '&limit=1'
    );
    return Array.isArray(rows) ? rows[0] : null;
  }

  // Prefix match: PostgREST cannot LIKE on uuid type → fetch recent + filter in JS
  if (raw.length >= 8) {
    const rows = await sbFetch(
      'rq_search_jobs?select=*&order=created_at.desc&limit=30'
    );
    const list = Array.isArray(rows) ? rows : [];
    const hits = list.filter(function (r) {
      return String(r.id || '').toLowerCase().startsWith(raw.toLowerCase());
    });
    if (hits.length === 1) return hits[0];
    if (hits.length > 1) return hits[0]; // most recent
    return null;
  }
  return null;
}


export async function listJobs(ownerId, limit = 10) {
  const rows = await sbFetch(
    'rq_search_jobs?owner_id=eq.' +
      encodeURIComponent(String(ownerId || ADMIN())) +
      '&order=created_at.desc&limit=' +
      limit +
      '&select=id,topic,status,progress,created_at,finished_at'
  );
  return Array.isArray(rows) ? rows : [];
}

async function setJob(id, patch) {
  await sbFetch('rq_search_jobs?id=eq.' + encodeURIComponent(id), {
    method: 'PATCH',
    body: JSON.stringify(patch),
    prefer: 'return=minimal',
  });
}

/**
 * Multi-angle search + long synthesis
 */
export async function processResearchJob(jobId) {
  const job = await getJob(jobId);
  if (!job) return { ok: false, error: 'job not found' };
  if (job.status === 'done') return { ok: true, skipped: true };

  await setJob(jobId, { status: 'running', progress: 'searching' });

  const topic = job.topic;
  const angles = [
    { focus: 'web', q: topic },
    { focus: 'academic', q: topic + ' survey review' },
    { focus: 'news', q: topic },
    { focus: 'reddit', q: topic + ' discussion' },
  ];

  const allSources = [];
  const tried = [];
  for (const a of angles) {
    try {
      const r = await vaneSearch(a.q, { focus: a.focus, max: 4 });
      tried.push(a.focus + ':' + (r.ok ? r.results.length : r.error));
      if (r.ok && r.results) {
        for (const s of r.results) {
          allSources.push({
            ...s,
            focus: a.focus,
            i: allSources.length + 1,
          });
        }
      }
    } catch (e) {
      tried.push(a.focus + ':err');
    }
  }

  // dedupe by url
  const seen = new Set();
  const unique = [];
  for (const s of allSources) {
    const u = String(s.url || '');
    if (!u || seen.has(u)) continue;
    seen.add(u);
    unique.push({ ...s, i: unique.length + 1 });
  }

  if (!unique.length) {
    await setJob(jobId, {
      status: 'failed',
      progress: 'no_sources',
      error: 'No sources. Tried: ' + tried.join(', '),
      finished_at: new Date().toISOString(),
    });
    return { ok: false, error: 'no sources', tried };
  }

  await setJob(jobId, {
    progress: 'writing',
    sources_json: unique.slice(0, 20),
  });

  const sourcesBlock = unique
    .slice(0, 16)
    .map(function (r) {
      return (
        '[' +
        r.i +
        '] (' +
        (r.focus || 'web') +
        ') ' +
        r.title +
        '\n' +
        r.url +
        '\n' +
        (r.snippet || '').slice(0, 400)
      );
    })
    .join('\n\n');

  const r = await powerChatSafe(
    'TOPIC: ' +
      topic +
      '\n\nSOURCES:\n' +
      sourcesBlock +
      '\n\nWrite a structured research brief:\n' +
      '1) Executive summary (5-8 lines)\n' +
      '2) Key findings (bullets with [n] citations)\n' +
      '3) Controversies / unknowns\n' +
      '4) Practical recommendations\n' +
      '5) Source list\n' +
      'Use ONLY the sources. Sinhala if topic is Sinhala, else English.',
    {
      system:
        'PasiyaOS Deep Research. Cite [n]. Thorough but under 3500 chars.',
      maxTokens: 2800,
      temperature: 0.2,
    }
  );

  if (!r.ok) {
    await setJob(jobId, {
      status: 'failed',
      progress: 'llm_fail',
      error: r.error || 'LLM failed',
      finished_at: new Date().toISOString(),
    });
    return { ok: false, error: r.error, tried };
  }

  const report =
    String(r.text || '').trim() +
    '\n\n——\n🔬 deep-research · sources=' +
    unique.length +
    ' · llm=' +
    (r.engine || '') +
    '\nTried: ' +
    tried.join(' | ');

  await setJob(jobId, {
    status: 'done',
    progress: 'done',
    report: report.slice(0, 12000),
    finished_at: new Date().toISOString(),
    error: null,
  });

  return { ok: true, report, jobId, sourceCount: unique.length };
}

/** Cron: process up to N pending jobs */
export async function processPendingResearchJobs(limit = 2) {
  const rows = await sbFetch(
    'rq_search_jobs?status=eq.pending&order=created_at.asc&limit=' + limit
  );
  const list = Array.isArray(rows) ? rows : [];
  const results = [];
  for (const job of list) {
    try {
      const r = await processResearchJob(job.id);
      results.push({ id: job.id, ...r });
    } catch (e) {
      results.push({ id: job.id, ok: false, error: e.message || String(e) });
      try {
        await setJob(job.id, {
          status: 'failed',
          error: String(e.message || e).slice(0, 500),
          finished_at: new Date().toISOString(),
        });
      } catch (_) {}
    }
  }
  return results;
}

export async function handleResearchCommand({ text, ctx, bot }) {
  if (String(ctx?.from?.id || '') !== ADMIN()) return '👑 Founder-only.';
  const raw = String(text || '').trim();
  const uid = String(ctx.from.id);
  const chatId = ctx.chat?.id;

  if (/^\/research(deep)?(?:@\w+)?(?:\s+help)?$/i.test(raw)) {
    return (
      '🔬 DEEP RESEARCH · v4000 C4\n\n' +
      '/researchdeep <topic>\n' +
      '/researchstatus <job-id>\n' +
      '/researchlist\n\n' +
      'Queues multi-focus search (web+academic+news+reddit),\n' +
      'writes a cited brief, stores in DB.\n' +
      'Cron job=research processes pending jobs.\n' +
      'Same request also tries to process immediately.'
    );
  }

  const deep = raw.match(
    /^\/researchdeep(?:@\w+)?\s+([\s\S]+)/i
  );
  if (deep) {
    const topic = deep[1].trim();
    if (topic.length < 3) return 'Topic too short.';
    const job = await createResearchJob({
      topic,
      ownerId: uid,
      chatId,
    });
    // try immediate process (same invocation)
    let extra = '';
    try {
      const r = await processResearchJob(job.id);
      if (r.ok && r.report) {
        return (
          '✅ Research DONE · `' +
          String(job.id).slice(0, 8) +
          '`\n\n' +
          r.report.slice(0, 3800)
        );
      }
      if (!r.ok) {
        extra = '\n⚠ Immediate run: ' + (r.error || 'pending for cron');
      }
    } catch (e) {
      extra = '\n⚠ Will retry via cron: ' + String(e.message || e).slice(0, 120);
    }
    return (
      '⏳ Queued research `' +
      String(job.id).slice(0, 8) +
      '`\nTopic: ' +
      topic.slice(0, 200) +
      '\n/researchstatus ' +
      job.id +
      extra
    );
  }

  const st = raw.match(/^\/researchstatus(?:@\w+)?\s+(\S+)/i);
  if (st) {
    const job = await getJob(st[1]);
    if (!job) return 'Job not found.';
    if (job.status === 'done' && job.report) {
      return (
        '✅ `' +
        String(job.id).slice(0, 8) +
        '` DONE\n\n' +
        String(job.report).slice(0, 3800)
      );
    }
    return (
      '🔬 Job `' +
      String(job.id).slice(0, 8) +
      '`\nStatus: ' +
      job.status +
      ' · ' +
      (job.progress || '') +
      (job.error ? '\nError: ' + job.error : '') +
      '\nTopic: ' +
      (job.topic || '')
    );
  }

  if (/^\/researchlist(?:@\w+)?$/i.test(raw)) {
    const rows = await listJobs(uid, 12);
    if (!rows.length) return 'No research jobs yet.';
    return (
      '🔬 RESEARCH JOBS\n' +
      '(copy full id for /researchstatus)\n' +
      rows
        .map(
          (r, i) =>
            i +
            1 +
            '. ' +
            String(r.id) +
            '\n   · ' +
            r.status +
            ' · ' +
            String(r.topic || '').slice(0, 50)
        )
        .join('\n')
    );
  }

  return null;
}

export default {
  createResearchJob,
  processResearchJob,
  processPendingResearchJobs,
  handleResearchCommand,
  listJobs,
  getJob,
};
