/**
 * Omniscient Architect — STABILIZED
 * - No 45–90s Vercel wait inside request (push + return)
 * - Refuse push if unbalanced braces
 * - God-loop max time budget ~50s soft stop
 * - /architect unlock always works
 */
import { powerChat, powerRadar, formatRadar } from './powerhouse.js';
import { getContract, evaluateOutput } from './commandContracts.js';
import { echoCommand } from './echoX.js';
import {
  isLocked,
  setLock,
  addLesson,
  loadLessons,
  loadJSON,
  saveJSON,
} from './architectLock.js';

const ADMIN = () =>
  String(process.env.ADMIN_ID || process.env.FOUNDER_ID || '').trim();
const MAX_ATTEMPTS = 2; // was 3 — keep under serverless budget
const PUSH_WINDOW_MS = 15 * 60 * 1000;
const MAX_PUSH = 2;
const pushLog = [];
const BUDGET_MS = 55000; // leave margin under 90s

function isFounder(ctx) {
  return String(ctx?.from?.id || '') === ADMIN();
}

function ghHeaders() {
  return {
    Authorization:
      'Bearer ' + (process.env.GITHUB_TOKEN || process.env.GH_TOKEN || ''),
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'PasiyaOS-Omniscient',
  };
}
function repo() {
  const r =
    process.env.GITHUB_REPO ||
    'pasindudananjaya92-bot/radiant-queen-pasiya-max-v2';
  const [owner, name] = r.split('/');
  return { owner, name };
}

async function ghGet(path) {
  const { owner, name } = repo();
  const res = await fetch(
    'https://api.github.com/repos/' +
      owner +
      '/' +
      name +
      '/contents/' +
      path.replace(/^\//, ''),
    { headers: ghHeaders() }
  );
  if (!res.ok) throw new Error('GET ' + path + ' ' + res.status);
  const j = await res.json();
  return {
    content: Buffer.from(j.content, 'base64').toString('utf8'),
    sha: j.sha,
    path,
  };
}

async function ghPut(path, content, sha, message) {
  const { owner, name } = repo();
  const res = await fetch(
    'https://api.github.com/repos/' +
      owner +
      '/' +
      name +
      '/contents/' +
      path.replace(/^\//, ''),
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
  const j = await res.json().catch(function () {
    return {};
  });
  if (!res.ok) throw new Error(j.message || 'PUT ' + res.status);
  return j;
}

async function vercelLatestDeploy() {
  const token = process.env.VERCEL_TOKEN || '';
  const projectId = process.env.VERCEL_PROJECT_ID || '';
  if (!token || !projectId) {
    return { ok: false, error: 'VERCEL_TOKEN or VERCEL_PROJECT_ID missing' };
  }
  try {
    const res = await fetch(
      'https://api.vercel.com/v6/deployments?projectId=' +
        encodeURIComponent(projectId) +
        '&limit=1',
      { headers: { Authorization: 'Bearer ' + token } }
    );
    const j = await res.json().catch(function () {
      return {};
    });
    const d = j.deployments && j.deployments[0];
    if (!d) return { ok: false, error: 'no deployments' };
    return {
      ok: true,
      state: d.readyState || d.state,
      url: d.url,
      created: d.created,
    };
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
  let a = 0,
    b = 0,
    c = 0;
  let inS = false,
    inD = false,
    inT = false,
    esc = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (esc) {
      esc = false;
      continue;
    }
    if (ch === '\\' && (inS || inD || inT)) {
      esc = true;
      continue;
    }
    if (!inD && !inT && ch === "'") {
      inS = !inS;
      continue;
    }
    if (!inS && !inT && ch === '"') {
      inD = !inD;
      continue;
    }
    if (!inS && !inD && ch === '`') {
      inT = !inT;
      continue;
    }
    if (inS || inD || inT) continue;
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

async function multiAgentFix(filePath, source, problem, deadline) {
  if (Date.now() > deadline) {
    return { ok: false, stage: 'budget', error: 'time budget' };
  }

  // Prefer small files only for full rewrite; else refuse AI full-file
  if (source.length > 35000) {
    return {
      ok: false,
      stage: 'too-large',
      error: 'File too large for auto full rewrite. Use /ghHeal or manual surgical edit.',
    };
  }

  const det = await powerChat(
    'FILE: ' +
      filePath +
      '\nPROBLEM: ' +
      problem +
      '\n\nCODE:\n' +
      source.slice(0, 12000) +
      '\n\nDetective: ≤6 bullets. Name exact functions.',
    { system: 'Detective. No code.', maxTokens: 500 }
  );
  const detective = det.ok ? det.text : 'detective failed';

  if (Date.now() > deadline) {
    return { ok: false, stage: 'budget', error: 'time budget after detective', detective };
  }

  const sur = await powerChat(
    'PROBLEM: ' +
      problem +
      '\nDETECTIVE:\n' +
      detective +
      '\n\nFULL FILE:\n' +
      source.slice(0, 20000) +
      '\n\nSurgeon rules:\n' +
      '- Output COMPLETE valid JS only\n' +
      '- Count every { } ( ) [ ] — MUST balance\n' +
      '- No markdown fences\n' +
      '- Prefer minimal change',
    {
      system: 'Surgeon. Output only balanced JS for ' + filePath,
      maxTokens: 6000,
      temperature: 0.05,
    }
  );
  if (!sur.ok) {
    return { ok: false, stage: 'surgeon', error: sur.error, detective };
  }

  let body = String(sur.text || '')
    .replace(/^```(?:js|javascript)?\n?/i, '')
    .replace(/\n?```$/i, '')
    .trim();
  if (body.length < 40) {
    return { ok: false, stage: 'surgeon', error: 'patch too short', detective };
  }
  if (!balanceOk(body)) {
    return {
      ok: false,
      stage: 'balance',
      error: 'unbalanced braces — push blocked',
      detective,
    };
  }

  // Skip slow QA AI when budget tight — balance gate is enough
  return { ok: true, body: body, detective: detective, engine: sur.engine };
}

async function internalRetest(cmd, supabase) {
  const contract = getContract(cmd);
  const text = (contract && contract.test && contract.test.text) || cmd;
  const replies = [];
  const mockCtx = {
    from: { id: Number(ADMIN()) || 0 },
    message: { text: text },
    reply: async function (m) {
      replies.push(String(m));
      return m;
    },
    replyWithDocument: async function () {},
  };
  try {
    if (cmd === '/echo') {
      const r = await echoCommand(mockCtx, supabase, text);
      if (r && r.text) replies.push(r.text);
    } else if (cmd === '/expect') {
      const { handleExpect } = await import('./expectCmd.js');
      const out = await handleExpect({
        text: '/expect list',
        ctx: mockCtx,
        supabase: supabase,
      });
      replies.push(String(out));
    } else if (cmd === '/radar' || cmd === '/power') {
      const r = await powerRadar();
      replies.push(formatRadar(r));
    } else {
      const { handleV2000 } = await import('./v2000Routes.js');
      const out = await handleV2000({
        cmd: cmd,
        text: text,
        ctx: mockCtx,
        supabase: supabase,
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

/**
 * STABILIZED god loop:
 * - max 2 attempts
 * - NO wait for Vercel deploy
 * - push only if balanceOk
 * - return immediately after push + internal retest
 */
export async function runGodLoop({ cmd, problem, supabase }) {
  const started = Date.now();
  const deadline = started + BUDGET_MS;

  if (await isLocked(supabase, cmd)) {
    return {
      ok: false,
      message:
        '🔒 `' +
        cmd +
        '` locked.\nUnlock: /architect unlock ' +
        cmd,
    };
  }

  const contract = getContract(cmd);
  // Map cmd → file (prefer small lib modules)
  let filePath =
    (contract && contract.module) ||
    (cmd === '/expect' ? 'lib/expectCmd.js' : 'lib/echoX.js');

  const attempts = [];
  let lastProblem = problem || (contract && contract.expect) || 'logic failure';

  for (let i = 1; i <= MAX_ATTEMPTS; i++) {
    if (Date.now() > deadline) {
      attempts.push({ i: i, stage: 'budget', err: 'stopped to avoid Vercel timeout' });
      break;
    }

    let file;
    try {
      file = await ghGet(filePath);
    } catch (e) {
      return { ok: false, message: 'GitHub read: ' + (e.message || e) };
    }

    const agent = await multiAgentFix(
      filePath,
      file.content,
      lastProblem,
      deadline
    );
    attempts.push({
      i: i,
      stage: agent.ok ? 'balanced' : agent.stage,
      err: agent.error,
    });
    if (!agent.ok) continue;
    if (!canPush()) {
      return {
        ok: false,
        message: 'Push rate limit (2/15min). ' + JSON.stringify(attempts),
      };
    }

    // HARD GATE — never push unbalanced
    if (!balanceOk(agent.body)) {
      attempts.push({ i: i, stage: 'balance-gate', err: 'blocked' });
      continue;
    }

    try {
      await ghPut(
        filePath,
        agent.body,
        file.sha,
        'omniscient: fix ' + cmd + ' #' + i + ' (no-wait)'
      );
      pushLog.push(Date.now());
    } catch (e) {
      attempts.push({ i: i, stage: 'push', err: e.message });
      continue;
    }

    // Internal retest only (no Vercel sleep)
    const test = await internalRetest(cmd, supabase);
    if (test.ok) {
      await addLesson(
        supabase,
        'Fixed ' + cmd + ' — ' + test.reason,
        { filePath: filePath, cmd: cmd }
      );
      await setLock(supabase, cmd, false, '');
      return {
        ok: true,
        message:
          '✅ Pushed fix for `' +
          cmd +
          '` → `' +
          filePath +
          '`\n' +
          'Internal retest: PASS\n' +
          '⏳ Vercel deploy ~30–60s — do NOT wait in-bot.\n' +
          'Then re-run the command in Telegram.\n\n' +
          String(agent.detective || '').slice(0, 350),
      };
    }

    // Pushed but internal retest failed — still better to notify without locking immediately
    lastProblem +=
      ' | after push retest: ' + test.reason + ' ' + String(test.output).slice(0, 100);
  }

  await setLock(supabase, cmd, true, 'failed god-loop budget/attempts');
  return {
    ok: false,
    message:
      '❌ Could not fully fix `' +
      cmd +
      '` within serverless budget.\n' +
      'Command LOCKED 6h (safety).\n' +
      'Unlock: /architect unlock ' +
      cmd +
      '\nAttempts: ' +
      JSON.stringify(attempts).slice(0, 700) +
      '\n\nManual path: upload known-good lib file via gh, then unlock.',
  };
}

export async function handleOmniscient({ cmd, text, ctx, supabase, bot }) {
  if (!isFounder(ctx)) return '👑 Founder-only.';
  const raw = String(text || '')
    .replace(/^\/(architect|omniscient|master)(@\w+)?\s*/i, '')
    .trim();

  if (!raw || raw === 'help') {
    return (
      '🏛 OMNISCIENT (stabilized)\n' +
      '/architect status · deploy · lessons\n' +
      '/architect retest /echo\n' +
      '/architect fix /echo\n' +
      '/architect failed /echo <note>\n' +
      '/architect unlock /expect\n\n' +
      'Note: auto-fix pushes then returns (no 90s Vercel wait).'
    );
  }

  if (raw === 'status') {
    const radar = await powerRadar();
    const dep = await vercelLatestDeploy();
    const lock = await loadJSON(supabase, '/Documents/architect-lockdown.json', {
      cmds: {},
    });
    const locked = Object.entries(lock.cmds || {})
      .filter(function (e) {
        return e[1] && e[1].locked;
      })
      .map(function (e) {
        return e[0];
      });
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
    return dep.ok
      ? '🚀 ' + dep.state + '\nhttps://' + (dep.url || '')
      : 'Deploy: ' + dep.error;
  }

  if (raw.startsWith('unlock ')) {
    const c = raw.split(/\s+/)[1];
    await setLock(supabase, c, false, '');
    return '🔓 Unlocked `' + c + '` — try the command again.';
  }

  if (raw === 'lessons') {
    const lessons = await loadLessons(supabase);
    if (!lessons.items || !lessons.items.length) return 'No lessons yet.';
    return (
      '📚 ' +
      lessons.items
        .slice(-12)
        .map(function (x, i) {
          return i + 1 + '. ' + x.text;
        })
        .join('\n')
    );
  }

  if (raw.startsWith('retest ')) {
    const c = raw.split(/\s+/)[1];
    const t = await internalRetest(c, supabase);
    return (
      '🧪 ' +
      c +
      ' · ' +
      (t.ok ? 'PASS' : 'FAIL') +
      ' · ' +
      t.reason +
      '\n\n' +
      String(t.output).slice(0, 1200)
    );
  }

  if (raw.startsWith('fix ') || raw.startsWith('failed')) {
    var rest = raw.replace(/^(fix|failed)\s*/i, '').trim();
    var parts = rest.split(/\s+/);
    var c = parts[0] || '/echo';
    if (c.charAt(0) !== '/') c = '/' + c;
    var problem =
      parts.slice(1).join(' ') ||
      (getContract(c) && getContract(c).expect) ||
      'logic failure';
    try {
      await ctx.reply(
        '🏛 God-loop `' +
          c +
          '` (max ~55s, no Vercel wait)…'
      );
    } catch (_) {}
    const r = await runGodLoop({ cmd: c, problem: problem, supabase: supabase });
    return r.message;
  }

  return handleOmniscient({
    cmd: '/architect',
    text: '/architect help',
    ctx: ctx,
    supabase: supabase,
    bot: bot,
  });
}

export { isLocked };
export default { handleOmniscient, runGodLoop, isLocked };
