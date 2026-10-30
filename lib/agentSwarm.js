/**
 * agentSwarm.js — Agent-9.2
 * enqueueJob API: ONLY { kind, payload, priority, createdBy, hullTarget }
 */
'use strict';

const SKILL_ALIASES = {
  researchdeep: 'research',
  deep_research: 'research',
  deepresearch: 'research',
  research: 'research',
};

function resolveSkill(name) {
  const k = String(name || 'research')
    .toLowerCase()
    .replace(/^\//, '')
    .trim();
  return SKILL_ALIASES[k] || k;
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
    '🐝 Agent-9.2 SWARM · ' + list.length + ' jobs · skill=' + skill,
  ];
  let queued = 0;
  const uid = ctx && ctx.from ? String(ctx.from.id) : '';
  const chatId = ctx && ctx.chat ? ctx.chat.id : null;

  try {
    const hr = await import('./hullRouter.js');
    if (typeof hr.enqueueJob !== 'function') {
      throw new Error('enqueueJob missing');
    }

    for (let i = 0; i < list.length; i++) {
      const topic = list[i];
      const body = {
        kind: skill,
        payload: {
          query: topic,
          topic: topic,
          q: topic,
          text: topic,
          skill: skill,
          chatId: chatId,
          userId: uid,
          swarm: true,
        },
        priority: 5,
        createdBy: uid,
        hullTarget: 'b',
      };
      try {
        const job = await hr.enqueueJob(body);
        queued++;
        lines.push(
          (i + 1) +
            '. queued "' +
            topic.slice(0, 50) +
            '" · payload.query=' +
            JSON.stringify(topic).slice(0, 40) +
            ' · id ' +
            String((job && job.id) || '?').slice(0, 8)
        );
      } catch (e) {
        lines.push((i + 1) + '. FAIL ' + topic.slice(0, 40) + ' · ' + (e.message || e));
      }
    }
    lines.push('', 'Track: /hulljobs · swarm status');
    lines.push('enqueue shape: { kind, payload:{query,topic} } only');
    return lines.join('\n');
  } catch (e) {
    try {
      const sj = await import('./searchJobs.js');
      const create = sj.createResearchJob || sj.createJob || sj.enqueueDeepResearch;
      if (typeof create === 'function') {
        for (let i = 0; i < list.length; i++) {
          const topic = list[i];
          try {
            const job = await create({
              topic: topic,
              query: topic,
              ownerId: uid,
              chatId: chatId,
              type: 'deep',
            });
            queued++;
            lines.push(
              (i + 1) +
                '. research job "' +
                topic.slice(0, 50) +
                '" · ' +
                String((job && job.id) || 'ok').slice(0, 8)
            );
          } catch (e2) {
            lines.push((i + 1) + '. FAIL ' + (e2.message || e2));
          }
        }
        lines.push('', 'Track: /researchlist');
        return lines.join('\n');
      }
    } catch (e3) {
      return '❌ Swarm unavailable: ' + (e.message || e) + ' / ' + (e3.message || '');
    }
    return '❌ Swarm unavailable: ' + (e.message || e);
  }
}

export { resolveSkill, SKILL_ALIASES };
export default { swarmResearchTopics, resolveSkill, SKILL_ALIASES };

/** Agent-10 helpers re-export */
export async function swarmAggregate(opts) {
  const mod = await import('./swarmAggregate.js');
  return mod.aggregateRecent(opts || {});
}

export async function swarmSchedule(opts) {
  const mod = await import('./swarmAggregate.js');
  return mod.scheduleSwarm(opts || {});
}

export async function swarmSchedulesList() {
  const mod = await import('./swarmAggregate.js');
  return mod.listSchedules();
}
