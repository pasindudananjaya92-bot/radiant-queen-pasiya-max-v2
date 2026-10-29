/**
 * agentSwarm.js — Agent-8/9 multi-worker fan-out (Hull B)
 * Skill ID: research (NOT researchdeep — Hull B worker skill name)
 */
'use strict';

/** Map friendly / legacy names → Hull B skill kind */
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
  const k = String(name || 'research').toLowerCase().replace(/^\//, '').trim();
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
    '🐝 Agent-9 SWARM · ' + list.length + ' jobs · skill=' + skill,
  ];
  let queued = 0;

  // Prefer Hull B job queue
  try {
    const hr = await import('./hullRouter.js');
    if (typeof hr.enqueueJob === 'function') {
      for (let i = 0; i < list.length; i++) {
        const topic = list[i];
        try {
          const job = await hr.enqueueJob({
            kind: skill,
            text: '/' + skill + ' ' + topic,
            chatId: ctx && ctx.chat ? ctx.chat.id : null,
            userId: ctx && ctx.from ? ctx.from.id : null,
            meta: {
              topic: topic,
              swarm: true,
              skill: skill,
              legacyKind: 'researchdeep',
            },
          });
          queued++;
          lines.push(
            (i + 1) +
              '. queued ' +
              topic.slice(0, 60) +
              ' · id ' +
              String((job && (job.id || job)) || '?').slice(0, 8)
          );
        } catch (e) {
          // Fallback once: try researchdeep if research rejected
          try {
            const job2 = await hr.enqueueJob({
              kind: 'researchdeep',
              text: '/researchdeep ' + topic,
              chatId: ctx && ctx.chat ? ctx.chat.id : null,
              userId: ctx && ctx.from ? ctx.from.id : null,
              meta: { topic: topic, swarm: true, fallback: true },
            });
            queued++;
            lines.push(
              (i + 1) +
                '. queued (legacy) ' +
                topic.slice(0, 50) +
                ' · id ' +
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
      lines.push('Skill: ' + skill + ' (alias map: researchdeep→research)');
      return lines.join('\n');
    }
  } catch (_) {}

  // Fallback: searchJobs createResearchJob
  try {
    const sj = await import('./searchJobs.js');
    const create = sj.createResearchJob || sj.createJob || sj.enqueueDeepResearch;
    if (typeof create === 'function') {
      for (let i = 0; i < list.length; i++) {
        const topic = list[i];
        try {
          const job = await create({
            topic: topic,
            ownerId: ctx && ctx.from ? ctx.from.id : null,
            chatId: ctx && ctx.chat ? ctx.chat.id : null,
            query: topic,
            type: 'deep',
          });
          queued++;
          lines.push(
            (i + 1) +
              '. research job ' +
              topic.slice(0, 60) +
              ' · ' +
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

export { resolveSkill, SKILL_ALIASES };
export default { swarmResearchTopics, resolveSkill, SKILL_ALIASES };
