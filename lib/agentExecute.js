/**
 * agentExecute.js — Agent-1
 * Natural language → EXECUTE real founder tools (not manuals).
 * Private chat + ADMIN_ID only.
 */

function adminId() {
  return String(process.env.ADMIN_ID || '').trim();
}

function isFounder(ctx) {
  const uid = String(ctx?.from?.id || '');
  const a = adminId();
  return Boolean(a && uid && uid === a);
}

function cleanName(s) {
  return String(s || '')
    .trim()
    .replace(/^["'`]+|["'`]+$/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .toLowerCase();
}

/**
 * @returns {null | { id: string, args: object, label: string }}
 */
export function parseAgentIntent(text) {
  const t = String(text || '').trim();
  if (!t || t.startsWith('/')) return null;

  // /hull create
  let m =
    t.match(
      /(?:create|make|spin\s*up|new)\s+(?:a\s+)?(?:new\s+)?vercel\s+project(?:\s+(?:named|called|name)?\s*)?([a-zA-Z0-9._-]{2,48})?/i
    ) ||
    t.match(/hull\s+create\s+([a-zA-Z0-9._-]{2,48})/i) ||
    t.match(/(?:vercel|hull)\s+project\s+(?:named|called)\s+([a-zA-Z0-9._-]{2,48})/i);
  if (
    m ||
    /create\s+(?:a\s+)?(?:new\s+)?vercel\s+project/i.test(t) ||
    /නව\s*vercel/i.test(t) ||
    /ප්‍?රොජෙක්ට්\s*(එකක්\s*)?හද/i.test(t)
  ) {
    const name = cleanName(m && m[1] ? m[1] : '');
    return {
      id: 'hull_create',
      args: { name: name || '' },
      label: 'Hull create (Vercel project)',
    };
  }

  if (/hull\s+status/i.test(t) || /vercel\s+(project\s+)?status/i.test(t)) {
    return { id: 'hull_status', args: {}, label: 'Hull status' };
  }

  if (
    /(?:trigger\s+)?(?:re)?deploy\s+now/i.test(t) ||
    /redeploy\s+(?:please|now)?/i.test(t) ||
    /deploy\s+the\s+bot/i.test(t)
  ) {
    return { id: 'deploy_now', args: {}, label: 'Deploy now' };
  }

  if (/^seal\b/i.test(t) || /project\s+seal/i.test(t) || /system\s+seal/i.test(t)) {
    return { id: 'seal', args: {}, label: 'Seal checklist' };
  }

  m = t.match(/(?:deep\s+research|research\s+deep|researchdeep)\s+(?:on\s+)?(.+)$/i);
  if (m) {
    return {
      id: 'researchdeep',
      args: { topic: m[1].trim().slice(0, 200) },
      label: 'Deep research',
    };
  }

  m = t.match(/(?:search\s+the\s+web|web\s+search|askweb)\s+(?:for\s+)?(.+)$/i);
  if (m) {
    return { id: 'askweb', args: { q: m[1].trim().slice(0, 200) }, label: 'Web ask' };
  }

  m = t.match(/(?:shadow\s+draft|save\s+draft)\s+(.+)$/i);
  if (m) {
    return {
      id: 'shadow_draft',
      args: { text: m[1].trim().slice(0, 500) },
      label: 'Shadow draft',
    };
  }

  if (/list\s+(?:your\s+)?tools/i.test(t) || /what\s+can\s+you\s+(?:do|run)/i.test(t)) {
    return { id: 'tools', args: {}, label: 'Tool list' };
  }

  return null;
}

async function runHullCreate(name) {
  const { createProject } = await import('./hullControl.js');
  if (!name) {
    return (
      '🤖 Agent-1 · hull create\n' +
      'I can create it now. Send a name, e.g.\n' +
      '• create vercel project named pasiya-worker-3\n' +
      '• /hull create pasiya-worker-3'
    );
  }
  const created = await createProject({ name, gitRepo: '' });
  const id = created.id || created.project?.id || '?';
  const n = created.name || name;
  return (
    '✅ Agent-1 EXECUTED · /hull create\n' +
    `name: ${n}\n` +
    `projectId: ${id}\n` +
    'Next: link GitHub in Vercel + set env (HULL_ROLE=worker, secrets).'
  );
}

async function runHullStatus() {
  const { handleHullCmd } = await import('./hullControl.js');
  const out = await handleHullCmd('/hull status', null);
  return '✅ Agent-1 EXECUTED · /hull status\n\n' + String(out || 'ok').slice(0, 3500);
}

async function runDeployNow() {
  try {
    const g = await import('./galaxyGod.js');
    if (typeof g.triggerRedeploy === 'function') {
      const r = await g.triggerRedeploy();
      return '✅ Agent-1 EXECUTED · /deploy now\n' + JSON.stringify(r).slice(0, 1500);
    }
  } catch (_) {}
  const hook = process.env.VERCEL_DEPLOY_HOOK || process.env.DEPLOY_HOOK_URL;
  if (hook) {
    const res = await fetch(hook, { method: 'POST' });
    return `✅ Agent-1 EXECUTED · deploy hook HTTP ${res.status}`;
  }
  return '❌ No deploy hook / galaxyGod.triggerRedeploy — set VERCEL_DEPLOY_HOOK or use /deploy now';
}

async function runResearchDeep(topic, ctx) {
  // Prefer routing through existing v4000 search jobs if present
  try {
    const sj = await import('./searchJobs.js');
    if (typeof sj.enqueueDeepResearch === 'function') {
      const job = await sj.enqueueDeepResearch({
        topic,
        chatId: ctx?.chat?.id,
        userId: ctx?.from?.id,
      });
      return (
        '✅ Agent-1 EXECUTED · /researchdeep\n' +
        `topic: ${topic}\n` +
        `job: ${job?.id || job || 'queued'}`
      );
    }
    if (typeof sj.createJob === 'function') {
      const job = await sj.createJob({
        type: 'deep',
        query: topic,
        chat_id: ctx?.chat?.id,
      });
      return (
        '✅ Agent-1 EXECUTED · /researchdeep\n' +
        `topic: ${topic}\n` +
        `job: ${job?.id || 'queued'}`
      );
    }
  } catch (e) {
    return (
      '⚠ Agent-1 could not queue research directly: ' +
      (e.message || e) +
      `\nRun manually: /researchdeep ${topic}`
    );
  }
  return `Run manually: /researchdeep ${topic}`;
}

async function runAskWeb(q) {
  try {
    const { answerWeb } = await import('./vaneAnswer.js');
    if (typeof answerWeb === 'function') {
      const r = await answerWeb({ query: q, focus: 'web' });
      return '✅ Agent-1 EXECUTED · /askweb\n\n' + String(r?.text || r || '').slice(0, 3500);
    }
  } catch (_) {}
  try {
    const { searchWeb } = await import('./vaneSearch.js');
    if (typeof searchWeb === 'function') {
      const r = await searchWeb(q, { focus: 'web' });
      return '✅ Agent-1 EXECUTED · /askweb (search)\n\n' + String(r || '').slice(0, 3500);
    }
  } catch (e) {
    return `⚠ askweb failed: ${e.message || e}\nRun: /askweb ${q}`;
  }
  return `Run: /askweb ${q}`;
}

async function runShadowDraft(text, ctx) {
  try {
    const st = await import('./shadowTwin.js');
    if (typeof st.saveDraft === 'function') {
      const d = await st.saveDraft({ text, userId: ctx?.from?.id });
      return '✅ Agent-1 EXECUTED · /shadow draft\n' + JSON.stringify(d).slice(0, 1000);
    }
    if (typeof st.handleShadow === 'function') {
      const out = await st.handleShadow(`/shadow draft ${text}`, ctx);
      return '✅ Agent-1 EXECUTED · /shadow draft\n' + String(out || 'saved').slice(0, 1500);
    }
  } catch (e) {
    return `⚠ shadow failed: ${e.message || e}\nRun: /shadow draft ${text}`;
  }
  return `Run: /shadow draft ${text}`;
}

function toolsHelp() {
  return [
    '🛠 Agent-1 · executable tools (founder private chat)',
    '',
    'Say in natural language:',
    '• create vercel project named my-worker',
    '• hull status',
    '• deploy now',
    '• deep research free vector db 2026',
    '• search the web what is pgvector',
    '• shadow draft meeting notes',
    '• seal',
    '',
    'Or slash: /hull create · /researchdeep · /askweb · /deploy now · /seal',
  ].join('\n');
}

/**
 * Main entry — returns reply string if handled, else null.
 */
export async function tryAgentExecute({ text, ctx }) {
  if (!isFounder(ctx)) return null;
  if (ctx?.chat?.type && ctx.chat.type !== 'private') return null;

  const intent = parseAgentIntent(text);
  if (!intent) return null;

  try {
    switch (intent.id) {
      case 'hull_create':
        return await runHullCreate(intent.args.name);
      case 'hull_status':
        return await runHullStatus();
      case 'deploy_now':
        return await runDeployNow();
      case 'researchdeep':
        if (!intent.args.topic) return 'What topic? e.g. deep research pgvector free tier';
        return await runResearchDeep(intent.args.topic, ctx);
      case 'askweb':
        if (!intent.args.q) return 'What should I search?';
        return await runAskWeb(intent.args.q);
      case 'shadow_draft':
        if (!intent.args.text) return 'Draft text missing.';
        return await runShadowDraft(intent.args.text, ctx);
      case 'seal':
        return (
          '✅ Agent-1 · seal\n' +
          'Run /seal for the full checklist (keeps existing seal formatter).'
        );
      case 'tools':
        return toolsHelp();
      default:
        return null;
    }
  } catch (e) {
    return `❌ Agent-1 failed (${intent.label}): ${e.message || e}`;
  }
}

export default { tryAgentExecute, parseAgentIntent, toolsHelp };
