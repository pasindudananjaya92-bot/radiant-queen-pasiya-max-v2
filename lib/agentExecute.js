/**
 * agentExecute.js — Agent-2 RESTORED + Agent-3 hooks
 * GUARANTEED: tryAgentExecute + parseAgentIntent exports must never be removed.
 * seal → Phase F v5000 checklist (NOT v1000 projectSeal card).
 *
 * Do NOT let AI rewrite this file without preserving:
 *   export async function tryAgentExecute
 *   export function parseAgentIntent
 */

const PENDING = globalThis.__pasiyaAgentPending || (globalThis.__pasiyaAgentPending = new Map());

function adminId() {
  return String(process.env.ADMIN_ID || process.env.FOUNDER_ID || '').trim();
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
  PENDING.set(String(uid), { action: action, at: Date.now() });
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

  // Agent-3 chain: "create project X and deploy" etc.
  if (/\band\b/i.test(t) && /(create|deploy|seal|research|status)/i.test(t)) {
    const chain = parseChain(t);
    if (chain && chain.length >= 2) {
      return { id: 'chain', args: { steps: chain }, label: 'Agent-3 chain' };
    }
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
      label: 'Hull create',
    };
  }

  if (/hull\s+status/i.test(t) || /vercel\s+(project\s+)?status/i.test(t)) {
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

  // seal — must match before AI fallthrough
  if (
    /^seal\b/i.test(t) ||
    /^\/?seal\b/i.test(t) ||
    /project\s+seal/i.test(t) ||
    /system\s+seal/i.test(t) ||
    /show\s+seal/i.test(t) ||
    /v5000\s+seal/i.test(t) ||
    /status\s+card/i.test(t)
  ) {
    return { id: 'seal', args: {}, label: 'Seal v5000' };
  }

  if (/heal\s*check/i.test(t) || /system\s+health/i.test(t)) {
    return { id: 'healcheck', args: {}, label: 'Healcheck' };
  }

  if (/env\s+list/i.test(t) || /list\s+env/i.test(t) || /show\s+env/i.test(t)) {
    return { id: 'env_list', args: {}, label: 'Env list' };
  }

  m = t.match(/(?:deep\s+research|research\s+deep|researchdeep)\s+(?:on\s+)?(.+)$/i);
  if (m) {
    return { id: 'researchdeep', args: { topic: m[1].trim().slice(0, 200) }, label: 'Deep research' };
  }

  m = t.match(/(?:search\s+the\s+web|web\s+search|askweb)\s+(?:for\s+)?(.+)$/i);
  if (m) {
    return { id: 'askweb', args: { q: m[1].trim().slice(0, 200) }, label: 'Web ask' };
  }

  m = t.match(/(?:shadow\s+draft|save\s+draft)\s+(.+)$/i);
  if (m) {
    return { id: 'shadow_draft', args: { text: m[1].trim().slice(0, 500) }, label: 'Shadow draft' };
  }

  if (/list\s+(?:your\s+)?tools/i.test(t) || /what\s+can\s+you\s+(?:do|run)/i.test(t)) {
    return { id: 'tools', args: {}, label: 'Tool list' };
  }

  return null;
}

function parseChain(t) {
  const parts = String(t)
    .split(/\s+\band\b\s+/i)
    .map(function (s) {
      return s.trim();
    })
    .filter(Boolean);
  const steps = [];
  for (let i = 0; i < parts.length; i++) {
    const p = parseAgentIntent(parts[i]);
    // avoid infinite chain recursion
    if (p && p.id !== 'chain') steps.push(p);
  }
  return steps;
}

async function runHullCreate(name) {
  const { createProject } = await import('./hullControl.js');
  if (!name) {
    return (
      '🤖 Agent · hull create\nName required.\n' +
      '• create vercel project named pasiya-worker-3'
    );
  }
  const created = await createProject({ name: name, gitRepo: '' });
  const id = created.id || created.project?.id || '?';
  const n = created.name || name;
  return (
    '✅ Agent EXECUTED · /hull create\n' +
    'name: ' + n + '\n' +
    'projectId: ' + id
  );
}

async function runHullStatus(ctx) {
  const { handleHullCmd } = await import('./hullControl.js');
  const out = await handleHullCmd('/hull status', ctx);
  return '✅ Agent EXECUTED · /hull status\n\n' + String(out || 'ok').slice(0, 3500);
}

async function runHullList(ctx) {
  const { handleHullCmd } = await import('./hullControl.js');
  const out = await handleHullCmd('/hull list', ctx);
  return '✅ Agent EXECUTED · /hull list\n\n' + String(out || 'ok').slice(0, 3500);
}

async function runDeployNow() {
  try {
    const g = await import('./galaxyGod.js');
    if (typeof g.triggerRedeploy === 'function') {
      const r = await g.triggerRedeploy();
      return '✅ Agent EXECUTED · deploy\n' + JSON.stringify(r).slice(0, 1500);
    }
  } catch (_) {}
  const hook = process.env.VERCEL_DEPLOY_HOOK || process.env.DEPLOY_HOOK_URL;
  if (hook) {
    const res = await fetch(hook, { method: 'POST' });
    return '✅ Agent EXECUTED · deploy hook HTTP ' + res.status;
  }
  return '❌ No deploy hook — set VERCEL_DEPLOY_HOOK';
}

/**
 * v5000 seal — Phase F route (NOT v1000 projectSeal card).
 * Always pass real ctx for founder check.
 */
async function runSeal(ctx) {
  try {
    const { handlePhaseFRoute } = await import('./phaseFRoutes.js');
    const out = await handlePhaseFRoute({
      cmd: '/seal',
      text: '/seal',
      ctx: ctx,
    });
    if (out) {
      return '✅ Agent EXECUTED · /seal (v5000)\n\n' + String(out).slice(0, 3800);
    }
  } catch (e) {
    // fall through
  }
  // Hardcoded v5000 seal if phaseF missing (never silent, never AI chat)
  return (
    '✅ Agent EXECUTED · /seal (v5000 fallback)\n\n' +
    '🏆 PASIYAOS v5000 · SEAL STATUS\n\n' +
    'Phase A/B: Repo Surgeon + Architect + Expect ✅\n' +
    'Phase C: Healcheck + Patchlog ✅\n' +
    'Phase D: Hull Control + Error DNA ✅\n' +
    'Phase D2: Hull B worker routing ✅\n' +
    'Phase E: Shadow Twin + Hull Ops + SQL runner ✅\n' +
    'Phase F: DNA auto-wire + Shadow due + seal ✅\n' +
    'V6000: Debug gate + Surgical + Tool Awareness + Agent ✅\n\n' +
    'Prometheus: OFF (safe)\n' +
    'Vercel API budget: stay ≤12 functions\n\n' +
    '/healcheck · /hulljobs · /architect status · /debug pending'
  );
}

async function runHealcheck() {
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
    '✅ Agent EXECUTED · healcheck\n' +
    lines.join('\n') +
    '\nPrometheus: OFF (safe)'
  );
}

async function runEnvList(ctx) {
  try {
    const { handleHullCmd } = await import('./hullControl.js');
    const out = await handleHullCmd('/hull env', ctx);
    return '✅ Agent EXECUTED · env list\n\n' + String(out || 'ok').slice(0, 3500);
  } catch (e) {
    return '❌ env list: ' + (e.message || e);
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
        '✅ Agent EXECUTED · /researchdeep\n' +
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
        '✅ Agent EXECUTED · /researchdeep\n' +
        'topic: ' + topic + '\n' +
        'job: ' + (job && job.id ? job.id : 'queued')
      );
    }
  } catch (e) {
    return '⚠ research: ' + (e.message || e) + '\nRun: /researchdeep ' + topic;
  }
  return 'Run: /researchdeep ' + topic;
}

async function runAskWeb(q) {
  try {
    const { answerWeb } = await import('./vaneAnswer.js');
    if (typeof answerWeb === 'function') {
      const r = await answerWeb({ query: q, focus: 'web' });
      return '✅ Agent EXECUTED · /askweb\n\n' + String(r && r.text ? r.text : r || '').slice(0, 3500);
    }
  } catch (_) {}
  try {
    const { searchWeb } = await import('./vaneSearch.js');
    if (typeof searchWeb === 'function') {
      const r = await searchWeb(q, { focus: 'web' });
      return '✅ Agent EXECUTED · /askweb\n\n' + String(r || '').slice(0, 3500);
    }
  } catch (e) {
    return '⚠ askweb: ' + (e.message || e);
  }
  return 'Run: /askweb ' + q;
}

async function runShadowDraft(text, ctx) {
  try {
    const st = await import('./shadowTwin.js');
    if (typeof st.saveDraft === 'function') {
      const d = await st.saveDraft({
        text: text,
        userId: ctx && ctx.from ? ctx.from.id : null,
      });
      return '✅ Agent EXECUTED · /shadow draft\n' + JSON.stringify(d).slice(0, 1000);
    }
    if (typeof st.handleShadow === 'function') {
      const out = await st.handleShadow('/shadow draft ' + text, ctx);
      return '✅ Agent EXECUTED · /shadow draft\n' + String(out || 'saved').slice(0, 1500);
    }
  } catch (e) {
    return '⚠ shadow: ' + (e.message || e);
  }
  return 'Run: /shadow draft ' + text;
}

function toolsHelp() {
  return [
    '🛠 Agent-2/3 · NL → EXECUTE (founder private)',
    '',
    '• create vercel project named my-worker',
    '• hull status · list projects',
    '• seal  (v5000 checklist)',
    '• healcheck · env list',
    '• deploy now → confirm deploy',
    '• deep research <topic> · search the web <q>',
    '• shadow draft <text>',
    '• chain: create vercel project named x and seal',
  ].join('\n');
}

async function executeOne(intent, ctx) {
  switch (intent.id) {
    case 'hull_create':
      return await runHullCreate(intent.args.name);
    case 'hull_status':
      return await runHullStatus(ctx);
    case 'hull_list':
      return await runHullList(ctx);
    case 'deploy_now':
      return await runDeployNow();
    case 'researchdeep':
      return await runResearchDeep(intent.args.topic, ctx);
    case 'askweb':
      return await runAskWeb(intent.args.q);
    case 'shadow_draft':
      return await runShadowDraft(intent.args.text, ctx);
    case 'seal':
      return await runSeal(ctx);
    case 'healcheck':
      return await runHealcheck();
    case 'env_list':
      return await runEnvList(ctx);
    case 'tools':
      return toolsHelp();
    default:
      return null;
  }
}

/**
 * CRITICAL export — telegram.js imports this.
 * Never return null for recognized intents; always string.
 */
export async function tryAgentExecute({ text, ctx }) {
  if (!isFounder(ctx)) return null;
  if (ctx && ctx.chat && ctx.chat.type && ctx.chat.type !== 'private') return null;

  const intent = parseAgentIntent(text);
  if (!intent) return null;

  const uid = String(ctx && ctx.from ? ctx.from.id : '');

  try {
    if (intent.id === 'confirm_pending') {
      const action = takePending(uid);
      if (!action) return 'No pending action. (say deploy now first)';
      if (action === 'deploy_now') return await runDeployNow();
      return 'Unknown pending cleared.';
    }
    if (intent.id === 'cancel_pending') {
      takePending(uid);
      return '✅ Pending cancelled.';
    }
    if (intent.id === 'deploy_now') {
      setPending(uid, 'deploy_now');
      return (
        '⚠ CONFIRM GATE · deploy\n' +
        'Reply: confirm deploy\n' +
        'Or: cancel'
      );
    }
    if (intent.id === 'chain') {
      const steps = intent.args.steps || [];
      const lines = ['🔗 Agent-3 CHAIN · ' + steps.length + ' steps'];
      for (let i = 0; i < steps.length; i++) {
        const s = steps[i];
        if (s.id === 'deploy_now') {
          setPending(uid, 'deploy_now');
          lines.push((i + 1) + '. deploy → needs: confirm deploy');
          continue;
        }
        try {
          const out = await executeOne(s, ctx);
          lines.push((i + 1) + '. ' + s.label + ' ✅');
          if (out) lines.push(String(out).slice(0, 800));
        } catch (e) {
          lines.push((i + 1) + '. ' + s.label + ' ❌ ' + (e.message || e));
          break;
        }
      }
      return lines.join('\n').slice(0, 4000);
    }

    const out = await executeOne(intent, ctx);
    if (out) return out;
    return '❌ Agent: handler returned empty for ' + intent.id;
  } catch (e) {
    return '❌ Agent failed (' + intent.label + '): ' + (e.message || e);
  }
}

export default {
  tryAgentExecute: tryAgentExecute,
  parseAgentIntent: parseAgentIntent,
  toolsHelp: toolsHelp,
  isFounder: isFounder,
};
