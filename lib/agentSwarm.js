/**
 * agentSwarm.js — Agent-9 multi-worker fan-out (Hull B)
 * Skill ID: research
 * CRITICAL: pass query/topic in EVERY shape Hull B may read
 *   (query, topic, text, args, payload, meta)
 */
'use strict';

const SKILL_ALIASES = {
  researchdeep: 'research',
  deep_research: 'research',
  deepresearch: 'research',
  research: 'research',
  browse: 'browse',
  syntax_check: 'syntax_check',
  syntax: 'syntax_check',
};

function resolveSkill(name) {
  const k = String(name || 'research')
    .toLowerCase()
    .replace(/^\//, '')
    .trim();
  return SKILL_ALIASES[k] || k;
}

/** Build a job object every hull worker variant can parse */
function buildResearchJob(topic, skill, ctx) {
  const q = String(topic || '').trim();
  const cmd = '/' + skill + ' ' + q;
  return {
    kind: skill,
    skill: skill,
    type: skill,
    // primary fields workers often read
    query: q,
    topic: q,
    q: q,
    input: q,
    text: cmd,
    command: cmd,
    // nested shapes
    args: { query: q, topic: q, text: q },
    payload: { query: q, topic: q, text: q, skill: skill },
    meta: {
      query: q,
      topic: q,
      skill: skill,
      swarm: true,
      legacyKind: 'researchdeep',
    },
    chatId: ctx && ctx.chat ? ctx.chat.id : null,
    userId: ctx && ctx.from ? ctx.from.id : null,
    ownerId: ctx && ctx.from ? ctx.from.id : null,
  };
}

export async function swarmResearchTopics(topics, ctx) {
  const list = (topics || [])
    .map(function (t) {
      return String(t || '').trim();
    })
    .filter(Boolean)
    .slice(0, 5);

  if (!list.length) {
    return 'No topics. Example: swarm research pgvector | free embedding | supabase';
  }

  const skill = resolveSkill('research');
  const lines = [
    '🐝 Agent-9.1 SWARM · ' + list.length + ' jobs · skill=' + skill,
  ];
  let queued = 0;

  // Prefer Hull B job queue
  try {
    const hr = await import('./hullRouter.js');
    const enqueue =
      (typeof hr.enqueueJob === 'function' && hr.enqueueJob) ||
      (typeof hr.queueJob === 'function' && hr.queueJob) ||
      (typeof hr.createHullJob === 'function' && hr.createHullJob) ||
      null;

    if (enqueue) {
      for (let i = 0; i < list.length; i++) {
        const topic = list[i];
        if (!topic) {
          lines.push((i + 1) + '. FAIL empty topic');
          continue;
        }
        const jobBody = buildResearchJob(topic, skill, ctx);
        try {
          const job = await enqueue.call(hr, jobBody);
          queued++;
          lines.push(
            (i + 1) +
              '. queued "' +
              topic.slice(0, 50) +
              '" query=' +
              JSON.stringify(topic).slice(0, 60) +
              ' · id ' +
              String((job && (job.id || job)) || '?').slice(0, 8)
          );
        } catch (e) {
          // Legacy fallback: researchdeep with same full payload
          try {
            const legacy = buildResearchJob(topic, 'researchdeep', ctx);
            legacy.kind = 'researchdeep';
            legacy.skill = 'researchdeep';
            legacy.text = '/researchdeep ' + topic;
            legacy.command = legacy.text;
            legacy.meta.fallback = true;
            const job2 = await enqueue.call(hr, legacy);
            queued++;
            lines.push(
              (i + 1) +
                '. queued (legacy) "' +
                topic.slice(0, 40) +
                '" · id ' +
                String((job2 && (job2.id || job2)) || '?').slice(0, 8)
            );
          } catch (e2) {
            lines.push(
              (i + 1) +
                '. FAIL ' +
                topic.slice(0, 40) +
                ' · ' +
                (e2.message || e.message || e)
            );
          }
        }
      }
      lines.push('', 'Track: /hulljobs · swarm status');
      lines.push(
        'Payload: query+topic+text+args+payload+meta (non-empty topics: ' +
          queued +
          ')'
      );
      return lines.join('\n');
    }
  } catch (_) {}

  // Fallback: searchJobs createResearchJob
  try {
    const sj = await import('./searchJobs.js');
    const create =
      sj.createResearchJob || sj.createJob || sj.enqueueDeepResearch;
    if (typeof create === 'function') {
      for (let i = 0; i < list.length; i++) {
        const topic = list[i];
        try {
          const job = await create({
            topic: topic,
            query: topic,
            ownerId: ctx && ctx.from ? ctx.from.id : null,
            chatId: ctx && ctx.chat ? ctx.chat.id : null,
            type: 'deep',
          });
          queued++;
          lines.push(
            (i + 1) +
              '. research job "' +
              topic.slice(0, 50) +
              '" · ' +
              String(job && job.id ? job.id : job || 'ok').slice(0, 8)
          );
        } catch (e) {
          lines.push((i + 1) + '. FAIL ' + (e.message || e));
        }
      }
      lines.push('', 'Track: /researchlist');
      return lines.join('\n');
    }
  } catch (e) {
    return '❌ Swarm unavailable: ' + (e.message || e);
  }

  return '❌ No hull/research queue module available. Set HULL_MODE=queue or research jobs.';
}

export { resolveSkill, SKILL_ALIASES, buildResearchJob };
export default {
  swarmResearchTopics,
  resolveSkill,
  SKILL_ALIASES,
  buildResearchJob,
};
