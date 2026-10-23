/**
 * Omniscient Architect — cycle-free (dynamic import for retest only)
 */
import { powerChat, powerRadar, formatRadar } from './powerhouse.js';
import { getContract, evaluateOutput } from './commandContracts.js';
import { echoCommand } from './echoX.js';
import { isLocked, setLock, addLesson, loadLessons, loadJSON, saveJSON } from './architectLock.js';

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
  try {
    const res = await fetch(
      `https://api.vercel.com/v6/deployments?projectId=${encodeURIComponent(projectId)}&limit=1`,
      { headers: { Authorization: 'Bearer ' + token } }
    );
    const j = await res.json().catch(() => ({}));
    const d = j.deployments?.[0];
    if (!d) return { ok: false, error: 'no deployments' };
    return { ok: true, state: d.readyState || d.state, url: d.url, created: d.created };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
}

function canPush() {
  const now = Date.now();
  while (pushLog.length && now - pushLog[0] > PUSH_WINDOW_MS) pushLog.shift();
  return pushLog.length < MAX_PUSH;
}

function balanceOk(src) {
  let a = 0, b = 0, c = 0;
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

async function multiAgentFix(filePath, source, problem) {
  const det = await powerChat(
    'FILE: ' + filePath + '\nPROBLEM: ' + problem + '\n\nCODE:\n' + source.slice(0, 14000) +
      '\n\nDetective: ≤8 bullets root cause + function names.',
    { system: 'Detective agent.', maxTokens: 700 }
  );
  const detective = det.ok ? det.text : 'detective failed';

  const sur = await powerChat(
    'PROBLEM: ' + problem + '\nDETECTIVE:\n' + detective +
      '\n\nFULL FILE:\n' + source.slice(0, 22000) +
      '\n\nSurgeon: output COMPLETE fixed JS only. No fences.',
    { system: 'Surgeon. Output only source for ' + filePath, maxTokens: 8000, temperature: 0.1 }
  );
  if (!sur.ok) return { ok: false, stage: 'surgeon', error: sur.error, detective };

  let body = sur.text.replace(/^```(?:js|javascript)?\n?/i, '').replace(/\n?```$/i, '').trim();
  if (body.length < 80) return { ok: false, stage: 'surgeon', error: 'patch too short', detective };
  if (!balanceOk(body)) return { ok: false, stage: 'balance', error: 'unbalanced braces', detective, body };

  const qa = await powerChat(
    'Review JS. First line PASS or FAIL.\nFix goal: ' + problem + '\n\n' + body.slice(0, 10000),
    { system: 'QA agent.', maxTokens: 350 }
  );
  const qaText = qa.ok ? qa.text : 'FAIL qa unavailable';
  if (/^FAIL/i.test(qaText.trim())) {
    return { ok: false, stage: 'qa', error: qaText.slice(0, 300), detective, body };
  }
  return { ok: true, body, detective, qa: qaText, engine: sur.engine };
}

/** Internal retest — dynamic import to avoid cycles */
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
    } else if (cmd === '/radar' || cmd === '/power') {
      const r = await powerRadar();
      replies.push(formatRadar(r));
    } else {
      // lazy load routes only inside retest
      const { handleV2000 } = await import('./v2000Routes.js');
      const out = await handleV2000({ cmd, text, ctx: mockCtx, supabase, bot: null });
      if (out) replies.push(String(out));
    }
  } catch (e) {
    return { ok: false, output: String(e.message || e), reason: 'throw' };
  }
  const output = replies.join('\n');
  const ev = evaluateOutput(cmd, output);
  return { ok: ev.ok, output: output.slice(0, 1500), reason: ev.reason };
}

export async function runGodLoop({ cmd, problem, supabase }) {
  if (await isLocked(supabase, cmd)) {
    return { ok: false, message: '🔒 ' + cmd + ' locked. /architect unlock ' + cmd };
  }
  const contract = getContract(cmd);
  const filePath = contract?.module || 'lib/echoX.js';
  const attempts = [];
  let lastProblem = problem || contract?.expect || 'logic failure';

  for (let i = 1; i <= MAX_ATTEMPTS; i++) {
    let file;
    try {
      file = await ghGet(filePath);
    } catch (e) {
      return { ok: false, message: 'GitHub read: ' + (e.message || e) };
    }
    const agent = await multiAgentFix(filePath, file.content, lastProblem);
    attempts.push({ i, stage: agent.ok ? 'qa-pass' : agent.stage, err: agent.error });
    if (!agent.ok) continue;
    if (!canPush()) {
      return { ok: false, message: 'Push rate limit. ' + JSON.stringify(attempts) };
    }
    try {
      await ghPut(filePath, agent.body, file.sha, 'omniscient: fix ' + cmd + ' #' + i);
      pushLog.push(Date.now());
    } catch (e) {
      attempts.push({ i, stage: 'push', err: e.message });
      continue;
    }
    const test = await internalRetest(cmd, supabase);
    if (test.ok) {
      await addLesson(supabase, 'Fixed ' + cmd + ' — ' + test.reason, { filePath, cmd });
      await setLock(supabase, cmd, false, '');
      return {
        ok: true,
        message:
          '✅ Fixed `' +
          cmd +
          '` · attempt ' +
          i +
          '\nFile: ' +
          filePath +
          '\nRetest: PASS\n\n' +
          String(agent.detective || '').slice(0, 400) +
          '\n\nRe-run in Telegram after Vercel Ready:\n' +
          (contract?.test?.text || cmd),
      };
    }
    lastProblem += ' | retest fail: ' + test.reason + ' ' + String(test.output).slice(0, 120);
  }
  await setLock(supabase, cmd, true, 'failed ' + MAX_ATTEMPTS);
  return {
    ok: false,
    message:
      '❌ Could not fix `' +
      cmd +
      '` after ' +
      MAX_ATTEMPTS +
      '. LOCKED 6h.\n' +
      JSON.stringify(attempts).slice(0, 600) +
      '\n/architect unlock ' +
      cmd,
  };
}

export async function handleOmniscient({ cmd, text, ctx, supabase, bot }) {
  if (!isFounder(ctx)) return '👑 Founder-only.';
  const raw = String(text || '')
    .replace(/^\/(architect|omniscient|master)(@\w+)?\s*/i, '')
    .trim();

  if (!raw || raw === 'help') {
    return (
      '🏛 OMNISCIENT ARCHITECT\n' +
      '/architect status · deploy · lessons\n' +
      '/architect retest /echo\n' +
      '/architect fix /echo\n' +
      '/architect failed /echo <note>\n' +
      '/architect unlock /echo'
    );
  }

  if (raw === 'status') {
    const radar = await powerRadar();
    const dep = await vercelLatestDeploy();
    const lock = await loadJSON(supabase, '/Documents/architect-lockdown.json', { cmds: {} });
    const locked = Object.entries(lock.cmds || {})
      .filter(([, v]) => v.locked)
      .map(([k]) => k);
    return (
      formatRadar(radar) +
      '\n\nVercel: ' +
      (dep.ok ? dep.state + ' · ' + (dep.url || '') : dep.error) +
      '\nLockdown: ' +
      (locked.length ? locked.join(', ') : 'none')
    );
  }

  if (raw.startsWith('deploy')) {
    const dep = await vercelLatestDeploy();
    return dep.ok ? '🚀 ' + dep.state + '\nhttps://' + (dep.url || '') : 'Deploy: ' + dep.error;
  }

  if (raw.startsWith('unlock ')) {
    const c = raw.split(/\s+/)[1];
    await setLock(supabase, c, false, '');
    return '🔓 Unlocked ' + c;
  }

  if (raw === 'lessons') {
    const lessons = await loadLessons(supabase);
    if (!lessons.items?.length) return 'No lessons yet.';
    return '📚 ' + lessons.items.slice(-12).map((x, i) => i + 1 + '. ' + x.text).join('\n');
  }

  if (raw.startsWith('retest ')) {
    const c = raw.split(/\s+/)[1];
    const t = await internalRetest(c, supabase);
    return '🧪 ' + c + ' · ' + (t.ok ? 'PASS' : 'FAIL') + ' · ' + t.reason + '\n\n' + String(t.output).slice(0, 1200);
  }

  if (raw.startsWith('fix ')) {
    const parts = raw.split(/\s+/);
    const c = parts[1];
    const problem = parts.slice(2).join(' ') || getContract(c)?.expect || 'logic failure';
    try {
      await ctx.reply('🏛 God-loop ' + c + '…');
    } catch (_) {}
    const r = await runGodLoop({ cmd: c, problem, supabase });
    return r.message;
  }

  if (raw.startsWith('failed')) {
    const rest = raw.replace(/^failed\s*/i, '').trim();
    const parts = rest.split(/\s+/);
    let c = parts[0] || '/echo';
    if (!c.startsWith('/')) c = '/' + c;
    const problem = parts.slice(1).join(' ') || 'founder reported failure';
    try {
      await ctx.reply('🏛 Failure logged → god-loop ' + c);
    } catch (_) {}
    const r = await runGodLoop({ cmd: c, problem, supabase });
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

export { isLocked };
export default { handleOmniscient, runGodLoop, isLocked };
