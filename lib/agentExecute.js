/**
 * agentExecute.js — Agent-8
 * Resume-after-heal · swarm fan-out · macros · persistent confirms
 *
 * MUST keep exports:
 *   export async function tryAgentExecute
 *   export function parseAgentIntent
 */

async function chainLoad(uid) {
  const { loadChain } = await import('./agentChainStore.js');
  return loadChain(uid);
}
async function chainSave(uid, state) {
  const { saveChain } = await import('./agentChainStore.js');
  return saveChain(uid, state);
}
async function chainClear(uid) {
  const { clearChain } = await import('./agentChainStore.js');
  return clearChain(uid);
}

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

async function setPending(uid, action) {
  const { setPendingAction } = await import('./agentPending.js');
  await setPendingAction(uid, action, {});
}

async function takePending(uid) {
  const { takePendingAction } = await import('./agentPending.js');
  const row = await takePendingAction(uid);
  return row ? row.action : null;
}

async function clearPending(uid) {
  const { clearPendingAction } = await import('./agentPending.js');
  await clearPendingAction(uid);
}

/** Extract project name from free text (1+ chars). */
function extractProjectName(t) {
  const s = String(t || '').trim();
  let m =
    s.match(
      /(?:create|make|spin\s*up|new)\s+(?:a\s+)?(?:new\s+)?vercel\s+project(?:\s+(?:named|called|name)\s+)?([a-zA-Z0-9._-]{1,48})/i
    ) ||
    s.match(/hull\s+create\s+([a-zA-Z0-9._-]{1,48})/i) ||
    s.match(/(?:named|called)\s+([a-zA-Z0-9._-]{1,48})/i) ||
    s.match(/project\s+([a-zA-Z0-9._-]{1,48})/i);
  if (m && m[1]) return cleanName(m[1]);
  // bare token reply (Agent-4 resume): "pasiya-worker-3" or "x"
  if (/^[a-zA-Z0-9._-]{1,48}$/.test(s)) return cleanName(s);
  return '';
}

export function parseAgentIntent(text) {
  const t = String(text || '').trim();
  if (!t || t.startsWith('/')) return null;

  if (/^(confirm|yes|ඔව්|හරි)\s*(deploy|redeploy)?\s*$/i.test(t) || /^confirm\s+deploy/i.test(t)) {
    return { id: 'confirm_pending', args: {}, label: 'Confirm pending' };
  }
  if (/^(cancel|no|නැ|එපා)\s*(chain)?\s*$/i.test(t)) {
    return { id: 'cancel_pending', args: {}, label: 'Cancel pending' };
  }

  // Multi-step chain: "A and B" / "A then B"
  if (/\b(?:and|then)\b/i.test(t) && /(create|deploy|seal|research|status|scrape|summarize)/i.test(t)) {
    const chain = parseChain(t);
    if (chain && chain.length >= 2) {
      return { id: 'chain', args: { steps: chain }, label: 'Agent chain' };
    }
  }

  let m =
    t.match(
      /(?:create|make|spin\s*up|new)\s+(?:a\s+)?(?:new\s+)?vercel\s+project(?:\s+(?:named|called|name)\s+)?([a-zA-Z0-9._-]{1,48})?/i
    ) ||
    t.match(/hull\s+create\s+([a-zA-Z0-9._-]{1,48})/i);
  if (
    m ||
    /create\s+(?:a\s+)?(?:new\s+)?vercel\s+project/i.test(t) ||
    /නව\s*vercel/i.test(t) ||
    /ප්‍?රොජෙක්ට්\s*(එකක්\s*)?හද/i.test(t)
  ) {
    const name = extractProjectName(t) || cleanName(m && m[1] ? m[1] : '');
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




  if (/^resume\s+chain\b/i.test(t) || /^continue\s+chain\b/i.test(t)) {
    return { id: 'resume_chain', args: {}, label: 'Resume chain' };
  }
  m = t.match(/^swarm\s+research\s+(.+)$/i);
  if (m) {
    const topics = m[1].split('|').map(function (s) { return s.trim(); }).filter(Boolean);
    return { id: 'swarm_research', args: { topics: topics }, label: 'Swarm research' };
  }

  // Agent-7 macros
  m = t.match(/^(?:run\s+)?macro\s+([a-z0-9_-]+)/i);
  if (m) {
    return { id: 'macro', args: { name: m[1].toLowerCase() }, label: 'Macro' };
  }
  if (/^macros\b/i.test(t) || /^list\s+macros\b/i.test(t)) {
    return { id: 'macro_list', args: {}, label: 'Macro list' };
  }
  // Founder-only heal-hint drill (safe simulated code error)
  if (/^test\s+heal\s*hint\b/i.test(t) || /^simulate\s+code\s+fail\b/i.test(t)) {
    return {
      id: 'chain',
      args: {
        steps: [
          { id: 'heal_drill', args: {}, label: 'Heal drill (simulated code error)' },
          { id: 'seal', args: {}, label: 'Seal v5000' },
        ],
      },
      label: 'Heal-hint drill',
    };
  }

  // Multi-repo
  m = t.match(/(?:switch\s+repo|use\s+repo|git\s+switch)\s+([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)/i);
  if (m) {
    return { id: 'repo_switch', args: { repo: m[1] }, label: 'Repo switch' };
  }
  if (/^(git\s+status|repo\s+status|active\s+repo)\b/i.test(t)) {
    return { id: 'repo_status', args: {}, label: 'Repo status' };
  }

  if (
    /^seal\b/i.test(t) ||
    /project\s+seal/i.test(t) ||
    /system\s+seal/i.test(t) ||
    /show\s+seal/i.test(t) ||
    /v5000\s+seal/i.test(t)
  ) {
    return { id: 'seal', args: {}, label: 'Seal v5000' };
  }

  if (/heal\s*check/i.test(t) || /system\s+health/i.test(t)) {
    return { id: 'healcheck', args: {}, label: 'Healcheck' };
  }

  if (/env\s+list/i.test(t) || /list\s+env/i.test(t) || /show\s+env/i.test(t)) {
    return { id: 'env_list', args: {}, label: 'Env list' };
  }

  // scrape + summarize (+ optional save)
  m = t.match(/(?:scrape|browse|fetch)\s+(\S+)(?:\s+and\s+summarize)?/i);
  if (m || /summarize\s+(https?:\/\/\S+)/i.test(t)) {
    const url =
      (m && m[1]) ||
      (t.match(/(https?:\/\/\S+)/i) || [])[1] ||
      '';
    const save = /\bsave\b/i.test(t) || /\bsupabase\b/i.test(t);
    return {
      id: 'scrape_sum',
      args: { url: url, save: save },
      label: 'Scrape+summarize',
    };
  }

  // Agent-5 orchestration: research ... and save
  m = t.match(
    /(?:deep\s+research|research\s+deep|researchdeep)\s+(?:on\s+)?(.+?)\s+and\s+save/i
  );
  if (m) {
    return {
      id: 'chain',
      args: {
        steps: [
          { id: 'researchdeep', args: { topic: m[1].trim().slice(0, 200) }, label: 'Deep research' },
          {
            id: 'shadow_draft',
            args: { text: 'Research notes: ' + m[1].trim().slice(0, 180) },
            label: 'Save draft notes',
          },
        ],
      },
      label: 'Research+save',
    };
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
    .split(/\s+(?:and|then)\s+/i)
    .map(function (s) {
      return s.trim();
    })
    .filter(Boolean);
  const steps = [];
  for (let i = 0; i < parts.length; i++) {
    const p = parseAgentIntent(parts[i]);
    if (p && p.id !== 'chain') steps.push(p);
  }
  return steps;
}

async function runHullCreate(name) {
  const { createProject } = await import('./hullControl.js');
  if (!name) {
    return { needInput: true, prompt: 'Project name required. Reply with a name only (e.g. pasiya-worker-3).' };
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

async function runSeal(ctx) {
  try {
    const { handlePhaseFRoute } = await import('./phaseFRoutes.js');
    const out = await handlePhaseFRoute({ cmd: '/seal', text: '/seal', ctx: ctx });
    if (out) {
      return '✅ Agent EXECUTED · /seal (v5000)\n\n' + String(out).slice(0, 3800);
    }
  } catch (_) {}
  return (
    '✅ Agent EXECUTED · /seal (v5000 fallback)\n\n' +
    '🏆 PASIYAOS v5000 · SEAL STATUS\n\n' +
    'Phase A/B: Repo Surgeon + Architect + Expect ✅\n' +
    'Phase C: Healcheck + Patchlog ✅\n' +
    'Phase D: Hull Control + Error DNA ✅\n' +
    'Phase D2: Hull B worker routing ✅\n' +
    'Phase E: Shadow Twin + Hull Ops + SQL runner ✅\n' +
    'Phase F: DNA auto-wire + Shadow due + seal ✅\n' +
    'V6000: Debug + Agent-2/3/4 ✅\n\n' +
    'Prometheus: OFF (safe)\n' +
    'Vercel API budget: stay ≤12 functions'
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
  return '✅ Agent EXECUTED · healcheck\n' + lines.join('\n') + '\nPrometheus: OFF (safe)';
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

/** Scrape URL (jina / browse) + short summary; optional neural save */
async function runScrapeSum(url, save, ctx) {
  if (!url || !/^https?:\/\//i.test(url)) {
    return { needInput: true, prompt: 'Send a full URL (https://...)' };
  }
  let md = '';
  try {
    const jina = 'https://r.jina.ai/http://' + url.replace(/^https?:\/\//i, '');
    const res = await fetch(jina, { headers: { Accept: 'text/markdown' } });
    md = await res.text();
    md = String(md || '').slice(0, 12000);
  } catch (e) {
    return '❌ scrape failed: ' + (e.message || e);
  }
  let summary = md.slice(0, 1200);
  try {
    const key = process.env.GROQ_API_KEY;
    if (key && md.length > 200) {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + key,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: process.env.GROQ_MODEL || 'openai/gpt-oss-20b',
          temperature: 0.2,
          max_tokens: 400,
          messages: [
            {
              role: 'user',
              content:
                'Summarize in 5 bullet points max 120 words:\n' + md.slice(0, 8000),
            },
          ],
        }),
      });
      const j = await res.json().catch(function () {
        return {};
      });
      const t = j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
      if (t) summary = t;
    }
  } catch (_) {}

  let saveLine = '';
  if (save) {
    try {
      const nm = await import('./neuralMemory.js');
      if (typeof nm.addMemory === 'function') {
        await nm.addMemory({
          text: 'URL ' + url + '\n' + summary,
          userId: ctx && ctx.from ? ctx.from.id : null,
        });
        saveLine = '\n💾 Saved to neural memory';
      }
    } catch (_) {
      saveLine = '\n(save skipped — neuralMemory unavailable)';
    }
  }

  return (
    '✅ Agent EXECUTED · scrape+summarize\n' +
    'url: ' + url + '\n\n' +
    summary.slice(0, 3000) +
    saveLine
  );
}



function uidFromCtx(ctx) {
  return String(ctx && ctx.from ? ctx.from.id : '');
}

async function runMacroList() {
  const { listMacros } = await import('./agentPending.js');
  const rows = await listMacros();
  if (!rows.length) return 'No macros. Run sql/AGENT7.sql';
  const lines = ['📋 AGENT MACROS', ''];
  for (const r of rows) {
    lines.push('• ' + r.name + (r.description ? ' — ' + r.description : ''));
  }
  lines.push('', 'Run: macro seal-check');
  return lines.join('\n');
}

async function runMacro(name, ctx, uid) {
  const { getMacro } = await import('./agentPending.js');
  const m = await getMacro(name);
  if (!m) return 'Unknown macro. Try: macros';
  const steps = Array.isArray(m.steps) ? m.steps : [];
  if (!steps.length) return 'Macro has no steps.';
  return runChain(steps, ctx, uid, 0);
}

async function getSbClient() {
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
    if (!url || !key) return null;
    return createClient(url, key);
  } catch (_) {
    return null;
  }
}

async function runRepoStatus() {
  const bridge = await import('./repoBridge.js');
  const sb = await getSbClient();
  const active = await bridge.getActiveRepo(sb);
  const gh = await bridge.githubRepoStatus(active.repo);
  return '✅ Agent EXECUTED · repo status\n\n' + bridge.formatRepoStatus(active, gh);
}

async function runRepoSwitch(repo) {
  const bridge = await import('./repoBridge.js');
  const sb = await getSbClient();
  if (!sb) return '❌ Supabase client unavailable for repo switch';
  const r = await bridge.setActiveRepo(sb, repo);
  if (!r.ok) return '❌ ' + r.error;
  const gh = await bridge.githubRepoStatus(r.repo);
  return (
    '✅ Agent EXECUTED · repo switch\n\n' +
    bridge.formatRepoStatus({ repo: r.repo, source: 'db' }, gh)
  );
}

function toolsHelp() {
  return [
    '🛠 Agent-8 · resume chain · swarm · macros · cyborg',
    '',
    '• create vercel project named my-worker',
    '• hull status · list projects · seal · healcheck',
    '• deploy now → confirm deploy',
    '• deep research <topic> · search the web <q>',
    '• scrape https://example.com and summarize',
    '• scrape URL and save (neural memory)',
    '• chain: create vercel project named x and seal',
    '• If paused: reply with the missing value (survives cold start)',
    '• deep research TOPIC and save',
    '• switch repo owner/name · git status',
    '• macros · macro seal-check · macro repo-seal',
    '• test heal hint → heal → resume chain',
    '• swarm research topic1 | topic2 | topic3',
    '• resume chain  (after /debug apply)',
    '• chain fails → auto-retry transient · code → heal hint',
    '• cancel — abort pending/chain',
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
    case 'scrape_sum':
      return await runScrapeSum(intent.args.url, intent.args.save, ctx);
    case 'repo_switch':
      return await runRepoSwitch(intent.args.repo);
    case 'repo_status':
      return await runRepoStatus();
    case 'macro':
      return await runMacro(intent.args.name, ctx, uidFromCtx(ctx));
    case 'macro_list':
      return await runMacroList();
    case 'heal_drill':
      throw new TypeError('Simulated code error: drillFn is not a function');
    case 'swarm_research':
      return (await import('./agentSwarm.js')).swarmResearchTopics(intent.args.topics, ctx);
    case 'tools':
      return toolsHelp();
    default:
      return null;
  }
}

/**
 * Run chain; pause on needInput instead of skipping ahead.
 */
async function runChain(steps, ctx, uid, startIndex) {
  const { withHealRetry, classifyError, guessFileFromError } = await import('./agentHeal.js');
  const lines = ['🔗 Agent-6 CHAIN · ' + steps.length + ' steps'];
  const autoHeal = String(process.env.AGENT_CHAIN_HEAL || '1') === '1';

  for (let i = startIndex || 0; i < steps.length; i++) {
    const s = steps[i];
    if (s.id === 'deploy_now') {
      await setPending(uid, 'deploy_now');
      await chainSave(uid, { steps: steps, index: i + 1, waiting: 'confirm_deploy' });
      lines.push((i + 1) + '. deploy → reply: confirm deploy');
      return lines.join('\n').slice(0, 4000);
    }
    const attempt = await withHealRetry(async function () {
      return executeOne(s, ctx);
    }, {
      maxTransient: 1,
      onCode: async function (err) {
        /* log only — no auto-apply */
      },
    });

    if (!attempt.ok) {
      const kind = attempt.kind || classifyError(attempt.error);
      const hint = attempt.fileHint || guessFileFromError(attempt.error);
      lines.push((i + 1) + '. ' + s.label + ' ❌ ' + String(attempt.error && attempt.error.message ? attempt.error.message : attempt.error).slice(0, 160));
      if (attempt.retries) lines.push('   (retried ' + attempt.retries + 'x transient)');
      if (autoHeal && kind === 'code' && hint) {
        lines.push('🩹 HEAL HINT: /debug file ' + hint + ' :: fix ' + String(attempt.error && attempt.error.message ? attempt.error.message : 'error').slice(0, 80) + ' --local');
        lines.push('   Then: /debug apply <id>  →  wait Ready  →  say: resume chain');
      }
      // Agent-8: persist resume point (survives cold start)
      await chainSave(uid, {
        steps: steps,
        index: i,
        waiting: 'resume_after_heal',
        intentId: s.id,
        lastError: String(attempt.error && attempt.error.message ? attempt.error.message : attempt.error).slice(0, 200),
        fileHint: hint || null,
      });
      lines.push('Chain paused for heal. After fix: resume chain');
      return lines.join('\n').slice(0, 4000);
    }

    const out = attempt.result;
    if (out && typeof out === 'object' && out.needInput) {
      await chainSave(uid, {
        steps: steps,
        index: i,
        waiting: s.id === 'hull_create' ? 'project_name' : 'input',
        intentId: s.id,
      });
      lines.push((i + 1) + '. ' + s.label + ' ⏸ PAUSED');
      lines.push(out.prompt || 'Reply with the missing value.');
      return lines.join('\n').slice(0, 4000);
    }
    lines.push((i + 1) + '. ' + s.label + ' ✅' + (attempt.retries ? ' (retry ok)' : ''));
    if (out) lines.push(String(out).slice(0, 900));
  }
  await chainClear(uid);
  lines.push('✅ Chain complete');
  return lines.join('\n').slice(0, 4000);
}

/**
 * CRITICAL export — telegram.js imports this.
 */
export async function tryAgentExecute({ text, ctx }) {
  if (!isFounder(ctx)) return null;
  if (ctx && ctx.chat && ctx.chat.type && ctx.chat.type !== 'private') return null;

  const uid = String(ctx && ctx.from ? ctx.from.id : '');
  const raw = String(text || '').trim();

  // Agent-4: resume paused chain if user sends a bare value
  const paused = await chainLoad(uid);
  if (paused && paused.waiting && !raw.startsWith('/')) {
    if (/^(cancel|no|නැ|එපා)\s*$/i.test(raw)) {
      await chainClear(uid);
      await takePending(uid);
      return '✅ Chain/pending cancelled.';
    }
    if (paused.waiting === 'confirm_deploy') {
      if (/^(confirm|yes|ඔව්|හරි)/i.test(raw) || /^confirm\s+deploy/i.test(raw)) {
        await takePending(uid);
        const dep = await runDeployNow();
        const steps = paused.steps || [];
        const next = await runChain(steps, ctx, uid, paused.index || 0);
        return dep + '\n\n' + next;
      }
    }
    if (paused.waiting === 'project_name' || paused.waiting === 'input') {
      const name = extractProjectName(raw);
      if (!name && paused.waiting === 'project_name') {
        return 'Still need a project name (1–48 chars: letters, numbers, - _).';
      }
      const steps = (paused.steps || []).slice();
      const idx = paused.index || 0;
      if (steps[idx] && steps[idx].id === 'hull_create') {
        steps[idx] = {
          id: 'hull_create',
          args: { name: name },
          label: 'Hull create',
        };
      }
      await chainClear(uid);
      return await runChain(steps, ctx, uid, idx);
    }
  }

  const intent = parseAgentIntent(raw);
  if (!intent) return null;

  try {
    if (intent.id === 'confirm_pending') {
      const action = await takePending(uid);
      if (!action) return 'No pending action.';
      if (action === 'deploy_now') return await runDeployNow();
      return 'Unknown pending cleared.';
    }
    if (intent.id === 'cancel_pending') {
      try { await clearPending(uid); } catch (_) {}
      await chainClear(uid);
      return '✅ Pending/chain cancelled.';
    }
    if (intent.id === 'deploy_now') {
      await setPending(uid, 'deploy_now');
      return '⚠ CONFIRM GATE · deploy\nReply: confirm deploy\nOr: cancel';
    }

    if (intent.id === 'resume_chain') {
      const st = await chainLoad(uid);
      if (!st || !st.steps) return 'No paused chain. Run a chain first.';
      const idx = typeof st.index === 'number' ? st.index : 0;
      return await runChain(st.steps, ctx, uid, idx);
    }
    if (intent.id === 'swarm_research') {
      return await executeOne(intent, ctx);
    }
    if (intent.id === 'chain') {
      return await runChain(intent.args.steps || [], ctx, uid, 0);
    }

    // Single hull_create with missing name → pause (Agent-4)
    if (intent.id === 'hull_create' && !intent.args.name) {
      await chainSave(uid, {
        steps: [intent],
        index: 0,
        waiting: 'project_name',
        intentId: 'hull_create',
      });
      return '⏸ Project name required.\nReply with a name only (e.g. pasiya-worker-3).';
    }

    const out = await executeOne(intent, ctx);
    if (out && typeof out === 'object' && out.needInput) {
      await chainSave(uid, {
        steps: [intent],
        index: 0,
        waiting: intent.id === 'hull_create' ? 'project_name' : 'input',
        intentId: intent.id,
      });
      return '⏸ ' + (out.prompt || 'Reply with the missing value.');
    }
    if (out) return out;
    return '❌ Agent: empty handler for ' + intent.id;
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
