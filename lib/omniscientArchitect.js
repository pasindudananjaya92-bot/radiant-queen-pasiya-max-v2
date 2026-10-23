/**
 * OMNISCIENT MASTER ARCHITECT
 * Upload radar · contract checks · multi-agent fix · internal re-test · lockdown · lessons
 */
import { powerChat, powerRadar, formatRadar } from './powerhouse.js';
import { getContract, evaluateOutput } from './commandContracts.js';
import { handleV2000 } from './v2000Routes.js';
import { echoCommand } from './echoX.js';

const ADMIN = () => String(process.env.ADMIN_ID || process.env.FOUNDER_ID || '').trim();
const MAX_ATTEMPTS = 3;
const PUSH_WINDOW_MS = 15 * 60 * 1000;
const MAX_PUSH = 2;
const pushLog = [];

function isFounder(ctx) {
  return String(ctx?.from?.id || '') === ADMIN();
}

function ghHeaders() {
  return {
    Authorization: 'Bearer ' + (process.env.GITHUB_TOKEN || process.env.GH_TOKEN || ''),
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'PasiyaOS-Omniscient',
  };
}
function repo() {
  const r = process.env.GITHUB_REPO || 'pasindudananjaya92-bot/radiant-queen-pasiya-max-v2';
  const [owner, name] = r.split('/');
  return { owner, name };
}

async function ghGet(path) {
  const { owner, name } = repo();
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${name}/contents/${path.replace(/^\//, '')}`,
    { headers: ghHeaders() }
  );
  if (!res.ok) throw new Error('GET ' + path + ' ' + res.status);
  const j = await res.json();
  return { content: Buffer.from(j.content, 'base64').toString('utf8'), sha: j.sha, path };
}

async function ghPut(path, content, sha, message) {
  const { owner, name } = repo();
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${name}/contents/${path.replace(/^\//, '')}`,
    {
      method: 'PUT',
      headers: { ...ghHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        content: Buffer.from(content, 'utf8').toString('base64'),
        branch: process.env.GITHUB_BRANCH || 'main',
        sha,
      }),
    }
  );
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.message || 'PUT ' + res.status);
  return j;
}

async function vercelLatestDeploy() {
  const token = process.env.VERCEL_TOKEN || '';
  const projectId = process.env.VERCEL_PROJECT_ID || '';
  if (!token || !projectId) return { ok: false, error: 'VERCEL_TOKEN or VERCEL_PROJECT_ID missing' };
  const res = await fetch(
    `https://api.vercel.com/v6/deployments?projectId=${encodeURIComponent(projectId)}&limit=1`,
    { headers: { Authorization: 'Bearer ' + token } }
  );
  const j = await res.json().catch(() => ({}));
  const d = j.deployments?.[0];
  if (!d) return { ok: false, error: 'no deployments' };
  return {
    ok: true,
    state: d.readyState || d.state,
    url: d.url,
    created: d.created,
  };
}

function canPush() {
  const now = Date.now();
  while (pushLog.length && now - pushLog[0] > PUSH_WINDOW_MS) pushLog.shift();
  return pushLog.length < MAX_PUSH;
}

async function loadJSON(supabase, path, fb) {
  if (!supabase) return fb;
  try {
    const { data } = await supabase.from('pasiya_fs').select('content').eq('path', path).maybeSingle();
    if (data?.content) return JSON.parse(data.content);
  } catch (_) {}
  return fb;
}
async function saveJSON(supabase, path, obj) {
  if (!supabase) return;
  const content = JSON.stringify(obj, null, 2);
  const { data: ex } = await supabase.from('pasiya_fs').select('id').eq('path', path).maybeSingle();
  if (ex?.id) await supabase.from('pasiya_fs').update({ content }).eq('path', path);
  else await supabase.from('pasiya_fs').insert({ path, type: 'file', content, size: content.length });
}

/** Lockdown registry */
async function isLocked(supabase, cmd) {
  const lock = await loadJSON(supabase, '/Documents/architect-lockdown.json', { cmds: {} });
  const row = lock.cmds?.[cmd];
  if (!row) return false;
  if (row.until && Date.now() > row.until) return false;
  return Boolean(row.locked);
}
async function setLock(supabase, cmd, locked, reason) {
  const lock = await loadJSON(supabase, '/Documents/architect-lockdown.json', { cmds: {} });
  lock.cmds = lock.cmds || {};
  lock.cmds[cmd] = {
    locked,
    reason: reason || '',
    until: locked ? Date.now() + 6 * 3600 * 1000 : 0,
    ts: Date.now(),
  };
  await saveJSON(supabase, '/Documents/architect-lockdown.json', lock);
}

async function addLesson(supabase, text, meta = {}) {
  const lessons = await loadJSON(supabase, '/Documents/architect-lessons.json', { items: [] });
  lessons.items = lessons.items || [];
  lessons.items.push({ t: Date.now(), text, ...meta });
  if (lessons.items.length > 80) lessons.items = lessons.items.slice(-80);
  await saveJSON(supabase, '/Documents/architect-lessons.json', lessons);
  // best-effort neural memory if table exists
  try {
    if (supabase) {
      await supabase.from('rq_neural_memory').insert({
        content: '[architect-lesson] ' + text,
        kind: 'lesson',
        meta,
      });
    }
  } catch (_) {}
}

function balanceOk(src) {
  let a = 0,
    b = 0,
    c = 0;
  for (const ch of src) {
    if (ch === '(') a++;
    else if (ch === ')') a--;
    else if (ch === '[') b++;
    else if (ch === ']') b--;
    else if (ch === '{') c++;
    else if (ch === '}') c--;
    if (a < 0 || b < 0 || c < 0) return false;
  }
  return a === 0 && b === 0 && c === 0;
}

/** Multi-agent: Detective → Surgeon → QA */
async function multiAgentFix(filePath, source, problem) {
  const det = await powerChat(
    'FILE: ' +
      filePath +
      '\nPROBLEM: ' +
      problem +
      '\n\nCODE (may be truncated):\n' +
      source.slice(0, 14000) +
      '\n\nAs Detective: name exact function/lines and root cause in ≤8 bullets.',
    { system: 'Detective agent. Precise, no patch yet.', maxTokens: 800 }
  );
  const detective = det.ok ? det.text : 'detective failed';

  const sur = await powerChat(
    'PROBLEM: ' +
      problem +
      '\nDETECTIVE:\n' +
      detective +
      '\n\nFULL FILE:\n' +
      source.slice(0, 22000) +
      '\n\nAs Surgeon: output COMPLETE fixed file only. No markdown fences.',
    {
      system: 'Surgeon agent. Output only valid JS source for ' + filePath,
      maxTokens: 8000,
      temperature: 0.1,
    }
  );
  if (!sur.ok) return { ok: false, stage: 'surgeon', error: sur.error, detective };

  let body = sur.text.replace(/^```(?:js|javascript)?\n?/i, '').replace(/\n?```$/i, '').trim();
  if (body.length < 80) return { ok: false, stage: 'surgeon', error: 'patch too short', detective };

  const qa = await powerChat(
    'Review this JS for syntax risk and whether it fixes: ' +
      problem +
      '\nReply first line PASS or FAIL, then 3 bullets.\n\n' +
      body.slice(0, 12000),
    { system: 'QA agent. Strict.', maxTokens: 400 }
  );
  const qaText = qa.ok ? qa.text : 'FAIL qa unavailable';
  if (/^FAIL/i.test(qaText.trim()) || !balanceOk(body)) {
    return { ok: false, stage: 'qa', error: qaText.slice(0, 300), detective, body };
  }
  return { ok: true, body, detective, qa: qaText, engine: sur.engine };
}

/** Internal re-test without Telegram (mock ctx) */
async function internalRetest(cmd, supabase) {
  const contract = getContract(cmd);
  const text = contract?.test?.text || cmd;
  const replies = [];
  const mockCtx = {
    from: { id: Number(ADMIN()) || 0 },
    message: { text },
    reply: async (m) => {
      replies.push(String(m));
      return m;
    },
    replyWithDocument: async () => {},
  };
  try {
    if (cmd === '/echo') {
      const r = await echoCommand(mockCtx, supabase, text);
      if (r?.text) replies.push(r.text);
    } else {
      const out = await handleV2000({
        cmd,
        text,
        ctx: mockCtx,
        supabase,
        bot: null,
      });
      if (out) replies.push(String(out));
    }
  } catch (e) {
    return { ok: false, output: String(e.message || e), reason: 'throw' };
  }
  const output = replies.join('\n');
  const ev = evaluateOutput(cmd, output);
  return { ok: ev.ok, output: output.slice(0, 1500), reason: ev.reason };
}

export async function recordUploadEvent(supabase, { path, source }) {
  const row = {
    path,
    source: source || 'gh',
    ts: Date.now(),
  };
  const hist = await loadJSON(supabase, '/Documents/architect-uploads.json', { items: [] });
  hist.items = hist.items || [];
  hist.items.push(row);
  if (hist.items.length > 40) hist.items = hist.items.slice(-40);
  await saveJSON(supabase, '/Documents/architect-uploads.json', hist);
  return row;
}

export async function deploymentStatus() {
  return vercelLatestDeploy();
}

/**
 * Full god-mode loop for one command
 */
export async function runGodLoop({ cmd, problem, supabase, ctx }) {
  if (await isLocked(supabase, cmd)) {
    return {
      ok: false,
      message: '🔒 Command ' + cmd + ' is in lockdown. /architect unlock ' + cmd,
    };
  }
  const contract = getContract(cmd);
  const filePath = contract?.module || 'lib/v2000Routes.js';
  const attempts = [];

  for (let i = 1; i <= MAX_ATTEMPTS; i++) {
    let file;
    try {
      file = await ghGet(filePath);
    } catch (e) {
      return { ok: false, message: 'GitHub read fail: ' + (e.message || e) };
    }

    const agent = await multiAgentFix(
      filePath,
      file.content,
      problem || contract?.expect || 'logic failure on ' + cmd
    );
    attempts.push({ i, stage: agent.ok ? 'qa-pass' : agent.stage, err: agent.error });

    if (!agent.ok) {
      if (i === MAX_ATTEMPTS) break;
      continue;
    }
    if (!canPush()) {
      return {
        ok: false,
        message: 'Rate limit: max ' + MAX_PUSH + ' pushes / 15min. Attempts: ' + JSON.stringify(attempts),
      };
    }

    try {
      await ghPut(
        filePath,
        agent.body,
        file.sha,
        'omniscient: fix ' + cmd + ' attempt ' + i
      );
      pushLog.push(Date.now());
    } catch (e) {
      attempts.push({ i, stage: 'push', err: e.message });
      continue;
    }

    // Internal re-test (does not need Vercel for pure lib logic)
    const test = await internalRetest(cmd, supabase);
    if (test.ok) {
      await addLesson(
        supabase,
        'Fixed ' + cmd + ' — ' + (problem || test.reason),
        { filePath, cmd }
      );
      await setLock(supabase, cmd, false, '');
      return {
        ok: true,
        message:
          '✅ Omniscient Architect fixed `' +
          cmd +
          '`\nFile: ' +
          filePath +
          '\nAttempt: ' +
          i +
          '/' +
          MAX_ATTEMPTS +
          '\nInternal re-test: PASS (' +
          test.reason +
          ')\n\nDetective:\n' +
          String(agent.detective || '').slice(0, 400) +
          '\n\nPlease also re-run in Telegram after Vercel Ready:\n' +
          (contract?.test?.text || cmd),
        test,
      };
    }
    problem =
      (problem || '') +
      ' | retest still failing: ' +
      test.reason +
      ' output=' +
      String(test.output).slice(0, 200);
  }

  await setLock(supabase, cmd, true, 'failed ' + MAX_ATTEMPTS + ' god-loop attempts');
  return {
    ok: false,
    message:
      '❌ Could not fix `' +
      cmd +
      '` after ' +
      MAX_ATTEMPTS +
      ' attempts. Command LOCKED 6h.\n' +
      'Attempts: ' +
      JSON.stringify(attempts).slice(0, 800) +
      '\n/architect unlock ' +
      cmd +
      ' when ready.',
  };
}

export async function handleOmniscient({ cmd, text, ctx, supabase, bot }) {
  if (!isFounder(ctx)) return '👑 Founder-only.';
  const raw = String(text || '')
    .replace(/^\/(architect|omniscient|master)(@\w+)?\s*/i, '')
    .trim();

  if (!raw || raw === 'help') {
    return (
      '🏛 OMNISCIENT MASTER ARCHITECT\n' +
      '1) /architect status — radar + last deploy + lockdowns\n' +
      '2) /architect failed /echo ignored draft — log + god loop\n' +
      '3) /architect fix /echo — run god loop on command\n' +
      '4) /architect retest /echo — internal contract test\n' +
      '5) /architect deploy — Vercel latest state\n' +
      '6) /architect unlock /echo — clear lockdown\n' +
      '7) /architect lessons — learned fixes\n\n' +
      'Upload awareness: after gh upload, /architect deploy shows Ready state.\n' +
      'Silent/wrong: /architect failed <cmd> <note> → auto multi-agent fix + internal retest.'
    );
  }

  if (raw === 'status') {
    const radar = await powerRadar();
    const dep = await vercelLatestDeploy();
    const lock = await loadJSON(supabase, '/Documents/architect-lockdown.json', { cmds: {} });
    const ups = await loadJSON(supabase, '/Documents/architect-uploads.json', { items: [] });
    const locked = Object.entries(lock.cmds || {})
      .filter(([, v]) => v.locked)
      .map(([k]) => k);
    return (
      formatRadar(radar) +
      '\n\nVercel: ' +
      (dep.ok ? dep.state + ' · ' + (dep.url || '') : dep.error) +
      '\nLockdown: ' +
      (locked.length ? locked.join(', ') : 'none') +
      '\nRecent uploads: ' +
      (ups.items || []).slice(-3).map((x) => x.path).join(', ')
    );
  }

  if (raw === 'deploy' || raw.startsWith('deploy')) {
    const dep = await vercelLatestDeploy();
    if (!dep.ok) return 'Deploy radar: ' + dep.error;
    return '🚀 Vercel latest: ' + dep.state + '\n' + (dep.url ? 'https://' + dep.url : '');
  }

  if (raw.startsWith('unlock ')) {
    const c = raw.split(/\s+/)[1];
    await setLock(supabase, c, false, '');
    return '🔓 Unlocked ' + c;
  }

  if (raw === 'lessons') {
    const lessons = await loadJSON(supabase, '/Documents/architect-lessons.json', { items: [] });
    if (!lessons.items?.length) return 'No lessons yet.';
    return (
      '📚 LESSONS\n' +
      lessons.items
        .slice(-12)
        .map((x, i) => i + 1 + '. ' + x.text)
        .join('\n')
    );
  }

  if (raw.startsWith('retest ')) {
    const c = raw.split(/\s+/)[1];
    const t = await internalRetest(c, supabase);
    return (
      '🧪 INTERNAL RETEST ' +
      c +
      '\n' +
      (t.ok ? 'PASS' : 'FAIL') +
      ' · ' +
      t.reason +
      '\n\n' +
      String(t.output).slice(0, 1500)
    );
  }

  if (raw.startsWith('fix ')) {
    const parts = raw.split(/\s+/);
    const c = parts[1];
    const problem = parts.slice(2).join(' ') || getContract(c)?.expect || 'logic failure';
    if (ctx.reply) await ctx.reply('🏛 God-loop starting for ' + c + '…').catch(() => {});
    const r = await runGodLoop({ cmd: c, problem, supabase, ctx });
    return r.message;
  }

  if (raw.startsWith('failed')) {
    // /architect failed /echo draft ignored prompt
    const rest = raw.replace(/^failed\s*/i, '').trim();
    const parts = rest.split(/\s+/);
    let c = parts[0] || '/echo';
    if (!c.startsWith('/')) c = '/' + c;
    const problem = parts.slice(1).join(' ') || 'founder reported failure';
    if (ctx.reply) await ctx.reply('🏛 Failure logged. Running god-loop on ' + c + '…').catch(() => {});
    const r = await runGodLoop({ cmd: c, problem, supabase, ctx });
    return r.message;
  }

  return handleOmniscient({
    cmd: '/architect',
    text: '/architect help',
    ctx,
    supabase,
    bot,
  });
}

/** Middleware helper: after founder cmd, optional auto-evaluate (soft) */
export async function postCommandGuard(cmd, output, supabase) {
  const ev = evaluateOutput(cmd, output);
  if (ev.ok) return null;
  return {
    warning:
      '⚠️ Contract soft-fail for ' +
      cmd +
      ' (' +
      ev.reason +
      '). Run:\n/architect failed ' +
      cmd +
      ' ' +
      ev.reason,
  };
}

export default {
  handleOmniscient,
  runGodLoop,
  recordUploadEvent,
  deploymentStatus,
  postCommandGuard,
  isLocked,
};
