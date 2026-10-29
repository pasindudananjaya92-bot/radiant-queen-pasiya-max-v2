/**
 * agentExecute.js — Agent-1 + Agent-2
 * Natural language → EXECUTE founder tools (private chat + ADMIN only).
 *
 * Agent-2 adds:
 * - Correct ctx pass-through (fixes Founder-only on hull status)
 * - Confirm gates for destructive actions (deploy)
 * - More tools: seal, projects list, healcheck, env list (masked)
 * - Unified founder id (ADMIN_ID | FOUNDER_ID)
 */

const PENDING = globalThis.__pasiyaAgentPending || (globalThis.__pasiyaAgentPending = new Map());

function adminId() {
  return String(
    process.env.ADMIN_ID || process.env.FOUNDER_ID || ''
  ).trim();
}

function isFounder(ctx) {
  const uid = String(ctx?.from?.id || '').trim();
  const a = adminId();
  if (!a || !uid) return false;
  return uid === a;
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

function setPending(uid, action) {
  PENDING.set(String(uid), { action, at: Date.now() });
}

function takePending(uid) {
  const k = String(uid);
  const p = PENDING.get(k);
  if (!p) return null;
  if (Date.now() - p.at > 5 * 60 * 1000) {
    PENDING.delete(k);
    return null;
  }
  PENDING.delete(k);
  return p.action;
}

export function parseAgentIntent(text) {
  const t = String(text || '').trim();
  if (!t || t.startsWith('/')) return null;

  if (/^(confirm|yes|ඔව්|හරි)\s*(deploy|redeploy)?\s*$/i.test(t) || /^confirm\s+deploy/i.test(t)) {
    return { id: 'confirm_pending', args: {}, label: 'Confirm pending' };
  }
  if (/^(cancel|no|නැ|එපා)\s*$/i.test(t)) {
    return { id: 'cancel_pending', args: {}, label: 'Cancel pending' };
  }

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

  if (
    /hull\s+status/i.test(t) ||
    /vercel\s+(project\s+)?status/i.test(t) ||
    /හල්\s*status/i.test(t)
  ) {
    return { id: 'hull_status', args: {}, label: 'Hull status' };
  }

  if (/list\s+(?:hulls?|projects)/i.test(t) || /hull\s+list/i.test(t)) {
    return { id: 'hull_list', args: {}, label: 'Hull list' };
  }

  if (
    /(?:trigger\s+)?(?:re)?deploy\s+now/i.test(t) ||
    /redeploy\s+(?:please|now)?/i.test(t) ||
    /deploy\s+the\s+bot/i.test(t)
  ) {
    return { id: 'deploy_now', args: {}, label: 'Deploy now' };
  }

  if (
    /^seal\b/i.test(t) ||
    /project\s+seal/i.test(t) ||
    /system\s+seal/i.test(t) ||
    /show\s+seal/i.test(t)
  ) {
    return { id: 'seal', args: {}, label: 'Seal checklist' };
  }

  if (/heal\s*check/i.test(t) || /system\s+health/i.test(t)) {
    return { id: 'healcheck', args: {}, label: 'Healcheck' };
  }

  if (/env\s+list/i.test(t) || /list\s+env/i.test(t) || /show\s+env/i.test(t)) {
    return { id: 'env_list', args: {}, label: 'Env list (masked)' };
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
      '🤖 Agent-2 · hull create\n' +
      'Name required. Example:\n' +
      '• create vercel project named pasiya-worker-3\n' +
      '• /hull create pasiya-worker-3'
    );
  }
  const created = await createProject({ name, gitRepo: '' });
  const id = created.id || created.project?.id || '?';
  const n = created.name || name;
  return (
    '✅ Agent-2 EXECUTED · /hull create\n' +
    'name: ' + n + '\n' +
    'projectId: ' + id + '\n' +
    'Next: link GitHub in Vercel + set worker env.'
  );
}

/** MUST pass real ctx so handleHullCmd founder check sees from.id */
async function runHullStatus(ctx) {
  const { handleHullCmd } = await import('./hullControl.js');
  const out = await handleHullCmd('/hull status', ctx);
  return '✅ Agent-2 EXECUTED · /hull status\n\n' + String(out || 'ok').slice(0, 3500);
}

async function runHullList(ctx) {
  const { handleHullCmd } = await import('./hullControl.js');
  const out = await handleHullCmd('/hull list', ctx);
  return '✅ Agent-2 EXECUTED · /hull list\n\n' + String(out || 'ok').slice(0, 3500);
}

async function runDeployNow() {
  try {
    const g = await import('./galaxyGod.js');
    if (typeof g.triggerRedeploy === 'function') {
      const r = await g.triggerRedeploy();
      return '✅ Agent-2 EXECUTED · deploy\n' + JSON.stringify(r).slice(0, 1500);
    }
  } catch (_) {}
  const hook = process.env.VERCEL_DEPLOY_HOOK || process.env.DEPLOY_HOOK_URL;
  if (hook) {
    const res = await fetch(hook, { method: 'POST' });
    return '✅ Agent-2 EXECUTED · deploy hook HTTP ' + res.status;
  }
  return '❌ No deploy hook — set VERCEL_DEPLOY_HOOK or use /deploy now';
}

async function runSeal(ctx) {
  try {
    const se = await import('./projectSeal.js');
    if (typeof se.buildSeal === 'function') {
      const r = await se.buildSeal(null);
      if (typeof se.formatSeal === 'function') {
        return '✅ Agent-2 EXECUTED · /seal\n\n' + String(se.formatSeal(r)).slice(0, 3800);
      }
      return '✅ Agent-2 EXECUTED · /seal\n\n' + JSON.stringify(r).slice(0, 3800);
    }
  } catch (_) {}
  try {
    const { handlePhaseFRoute } = await import('./phaseFRoutes.js');
    const out = await handlePhaseFRoute({ cmd: '/seal', text: '/seal', ctx });
    if (out) return '✅ Agent-2 EXECUTED · /seal\n\n' + String(out).slice(0, 3800);
  } catch (_) {}
  return '✅ Agent-2 · run /seal (formatter module not loaded in this path)';
}

async function runHealcheck(ctx) {
  const keys = [
    'BOT_TOKEN',
    'ADMIN_ID',
    'GROQ_API_KEY',
    'GEMINI_API_KEY',
    'GITHUB_TOKEN',
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'VERCEL_TOKEN',
    'TAVILY_API_KEY',
  ];
  const lines = keys.map(function (k) {
    const ok = Boolean(String(process.env[k] || '').trim());
    return (ok ? '✅' : '❌') + ' ' + k;
  });
  return (
    '✅ Agent-2 EXECUTED · healcheck (lite)\n' +
    lines.join('\n') +
    '\nPrometheus: OFF (safe)\nTip: /healcheck for full formatter if wired.'
  );
}

async function runEnvList(ctx) {
  try {
    const { handleHullCmd } = await import('./hullControl.js');
    const out = await handleHullCmd('/hull env', ctx);
    return '✅ Agent-2 EXECUTED · env list\n\n' + String(out || 'ok').slice(0, 3500);
  } catch (e) {
    try {
      const g = await import('./galaxyGod.js');
      if (typeof g.listEnv === 'function') {
        const r = await g.listEnv(true);
        return '✅ Agent-2 EXECUTED · env list\n\n' + JSON.stringify(r).slice(0, 3500);
      }
    } catch (_) {}
    return '❌ env list failed: ' + (e.message || e);
  }
}

async function runResearchDeep(topic, ctx) {
  try {
    const sj = await import('./searchJobs.js');
    if (typeof sj.enqueueDeepResearch === 'function') {
      const job = await sj.enqueueDeepResearch({
        topic: topic,
        chatId: ctx && ctx.chat ? ctx.chat.id : null,
        userId: ctx && ctx.from ? ctx.from.id : null,
      });
      return (
        '✅ Agent-2 EXECUTED · /researchdeep\n' +
        'topic: ' + topic + '\n' +
        'job: ' + (job && job.id ? job.id : job || 'queued')
      );
    }
    if (typeof sj.createJob === 'function') {
      const job = await sj.createJob({
        type: 'deep',
        query: topic,
        chat_id: ctx && ctx.chat ? ctx.chat.id : null,
      });
      return (
        '✅ Agent-2 EXECUTED · /researchdeep\n' +
        'topic: ' + topic + '\n' +
        'job: ' + (job && job.id ? job.id : 'queued')
      );
    }
  } catch (e) {
    return (
      '⚠ Agent-2 could not queue research: ' +
      (e.message || e) +
      '\nRun: /researchdeep ' + topic
    );
  }
  return 'Run: /researchdeep ' + topic;
}

async function runAskWeb(q) {
  try {
    const { answerWeb } = await import('./vaneAnswer.js');
    if (typeof answerWeb === 'function') {
      const r = await answerWeb({ query: q, focus: 'web' });
      return '✅ Agent-2 EXECUTED · /askweb\n\n' + String(r && r.text ? r.text : r || '').slice(0, 3500);
    }
  } catch (_) {}
  try {
    const { searchWeb } = await import('./vaneSearch.js');
    if (typeof searchWeb === 'function') {
      const r = await searchWeb(q, { focus: 'web' });
      return '✅ Agent-2 EXECUTED · /askweb\n\n' + String(r || '').slice(0, 3500);
    }
  } catch (e) {
    return '⚠ askweb failed: ' + (e.message || e) + '\nRun: /askweb ' + q;
  }
  return 'Run: /askweb ' + q;
}

async function runShadowDraft(text, ctx) {
  try {
    const st = await import('./shadowTwin.js');
    if (typeof st.saveDraft === 'function') {
      const d = await st.saveDraft({ text: text, userId: ctx && ctx.from ? ctx.from.id : null });
      return '✅ Agent-2 EXECUTED · /shadow draft\n' + JSON.stringify(d).slice(0, 1000);
    }
    if (typeof st.handleShadow === 'function') {
      const out = await st.handleShadow('/shadow draft ' + text, ctx);
      return '✅ Agent-2 EXECUTED · /shadow draft\n' + String(out || 'saved').slice(0, 1500);
    }
  } catch (e) {
    return '⚠ shadow failed: ' + (e.message || e) + '\nRun: /shadow draft ' + text;
  }
  return 'Run: /shadow draft ' + text;
}

function toolsHelp() {
  return [
    '🛠 Agent-2 · NL → EXECUTE (founder private chat)',
    '',
    'Safe (run now):',
    '• create vercel project named my-worker',
    '• hull status  ·  list projects',
    '• seal  ·  healcheck  ·  env list',
    '• deep research <topic>  ·  search the web <q>',
    '• shadow draft <text>',
    '',
    'Confirm gate:',
    '• deploy now  →  reply: confirm deploy',
    '• cancel',
    '',
    'Slash still works: /hull /seal /deploy /researchdeep',
  ].join('\n');
}

export async function tryAgentExecute({ text, ctx }) {
  if (!isFounder(ctx)) return null;
  if (ctx && ctx.chat && ctx.chat.type && ctx.chat.type !== 'private') return null;

  const intent = parseAgentIntent(text);
  if (!intent) return null;

  const uid = String(ctx && ctx.from ? ctx.from.id : '');

  try {
    switch (intent.id) {
      case 'confirm_pending': {
        const action = takePending(uid);
        if (!action) return 'No pending action. (e.g. say deploy now first)';
        if (action === 'deploy_now') return await runDeployNow();
        return 'Unknown pending action cleared.';
      }
      case 'cancel_pending': {
        takePending(uid);
        return '✅ Pending action cancelled.';
      }
      case 'hull_create':
        return await runHullCreate(intent.args.name);
      case 'hull_status':
        return await runHullStatus(ctx);
      case 'hull_list':
        return await runHullList(ctx);
      case 'deploy_now':
        setPending(uid, 'deploy_now');
        return (
          '⚠ CONFIRM GATE · deploy\n' +
          'This triggers a production redeploy.\n' +
          'Reply: confirm deploy\n' +
          'Or: cancel'
        );
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
        return await runSeal(ctx);
      case 'healcheck':
        return await runHealcheck(ctx);
      case 'env_list':
        return await runEnvList(ctx);
      case 'tools':
        return toolsHelp();
      default:
        return null;
    }
  } catch (e) {
    return '❌ Agent-2 failed (' + intent.label + '): ' + (e.message || e);
  }
}

export default { tryAgentExecute, parseAgentIntent, toolsHelp, isFounder };
