/**
 * Project DeepMind Pro — Autonomous Research Swarm
 * Agents: Scout → Reader → Critic → Writer
 * Non-blocking: job row in Supabase; process in-request with tight budgets
 * or via /research run <id>. Deliver markdown report as Telegram document.
 */
import { powerChat, powerBrowse } from './powerhouse.js';

const ADMIN = () => String(process.env.ADMIN_ID || process.env.FOUNDER_ID || '').trim();

function isFounder(ctx) {
  return String(ctx?.from?.id || '') === ADMIN();
}

async function ensureJob(supabase, topic, founderId) {
  const row = {
    topic,
    status: 'queued',
    founder_id: String(founderId),
    scout: null,
    reader: null,
    critic: null,
    report: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase.from('rq_research_jobs').insert(row).select('id').single();
  if (error) throw new Error(error.message);
  return data.id;
}

/** Scout: propose 3 URLs via AI + optional known sources */
async function agentScout(topic) {
  const r = await powerChat(
    'Topic: ' + topic + '\nList 3 high-quality source URLs (full https) to research this. One line each, URL only.',
    { system: 'You are Scout. Output only URLs, one per line.', maxTokens: 300 }
  );
  const urls = (r.text || '')
    .split(/\n/)
    .map((l) => (l.match(/https?:\/\/[^\s]+/) || [])[0])
    .filter(Boolean)
    .slice(0, 3);
  // fallback search pages
  if (!urls.length) {
    urls.push('https://en.wikipedia.org/wiki/Special:Search?search=' + encodeURIComponent(topic));
  }
  return { urls, engine: r.engine };
}

async function agentReader(urls) {
  const pages = [];
  for (const url of urls.slice(0, 3)) {
    const b = await powerBrowse(url);
    if (b.ok) {
      pages.push({ url, excerpt: b.markdown.slice(0, 8000) });
    } else {
      pages.push({ url, excerpt: '(fetch failed: ' + b.error + ')' });
    }
  }
  return pages;
}

async function agentCritic(topic, pages) {
  const blob = pages
    .map((p, i) => 'SOURCE ' + (i + 1) + ' ' + p.url + '\n' + p.excerpt.slice(0, 3000))
    .join('\n\n');
  const r = await powerChat(
    'Topic: ' + topic + '\n\n' + blob + '\n\nList factual claims, conflicts, and confidence (high/med/low).',
    { system: 'You are Critic. Cross-check sources. Bullet points.', maxTokens: 1200 }
  );
  return r.ok ? r.text : 'Critic failed: ' + (r.error || '');
}

async function agentWriter(topic, pages, critique) {
  const blob = pages.map((p, i) => '[' + (i + 1) + '] ' + p.url + '\n' + p.excerpt.slice(0, 2500)).join('\n\n');
  const r = await powerChat(
    'Write a professional research brief on: ' +
      topic +
      '\n\nSources:\n' +
      blob +
      '\n\nCritic notes:\n' +
      critique +
      '\n\nStructure: Executive summary, Key findings, Risks/unknowns, Sources. Markdown.',
    { system: 'You are Writer. Formal, cited by [n]. No fluff.', maxTokens: 2500 }
  );
  return r.ok ? r.text : 'Writer failed: ' + (r.error || '');
}

export async function researchStart(ctx, supabase, topic) {
  if (!isFounder(ctx)) return { text: '👑 Founder-only.' };
  topic = String(topic || '').trim();
  if (!topic) return { text: 'Usage: /research <topic>' };
  if (!supabase) return { text: 'Supabase required for DeepMind jobs.' };

  let id;
  try {
    id = await ensureJob(supabase, topic, ctx.from.id);
  } catch (e) {
    return {
      text:
        '❌ Job table missing. Run sql/V2000_POWERHOUSE.sql in Supabase.\n' + (e.message || e),
    };
  }

  // Run pipeline inline (budget ~1 serverless invocation)
  try {
    await supabase
      .from('rq_research_jobs')
      .update({ status: 'running', updated_at: new Date().toISOString() })
      .eq('id', id);

    const scout = await agentScout(topic);
    const pages = await agentReader(scout.urls);
    const critique = await agentCritic(topic, pages);
    const report = await agentWriter(topic, pages, critique);

    await supabase
      .from('rq_research_jobs')
      .update({
        status: 'done',
        scout: JSON.stringify(scout),
        reader: JSON.stringify(pages.map((p) => ({ url: p.url, len: p.excerpt.length }))),
        critic: critique.slice(0, 8000),
        report: report.slice(0, 50000),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    const md =
      '# DeepMind Pro Report\n\n**Topic:** ' +
      topic +
      '\n**Job:** ' +
      id +
      '\n\n' +
      report +
      '\n\n---\nSources:\n' +
      (scout.urls || []).map((u, i) => (i + 1) + '. ' + u).join('\n');

    return {
      text: '🧠 DeepMind Pro · job ' + id + ' · DONE\nSources: ' + (scout.urls || []).length,
      document: {
        filename: 'research-' + id + '.md',
        content: md,
      },
    };
  } catch (e) {
    await supabase
      .from('rq_research_jobs')
      .update({ status: 'error', report: String(e.message || e), updated_at: new Date().toISOString() })
      .eq('id', id);
    return { text: '❌ Research failed: ' + (e.message || e) };
  }
}

export async function researchStatus(ctx, supabase, id) {
  if (!isFounder(ctx)) return { text: '👑 Founder-only.' };
  if (!supabase) return { text: 'No Supabase' };
  const { data, error } = await supabase.from('rq_research_jobs').select('*').eq('id', id).maybeSingle();
  if (error || !data) return { text: 'Job not found' };
  return {
    text:
      '🧠 Job ' +
      data.id +
      '\nstatus: ' +
      data.status +
      '\ntopic: ' +
      data.topic +
      '\nupdated: ' +
      data.updated_at,
  };
}

export default { researchStart, researchStatus };
