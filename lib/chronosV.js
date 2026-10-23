/**
 * Project Chronos-V — Autonomous Logic Watchdog (v1)
 *
 * Serverless reality:
 * - Cannot sleep 5s inside the same request reliably to detect "silence"
 * - Instead: explicit outcome ledger + founder /expect + AI surgical diagnose
 *
 * Flow:
 * 1) Middleware / commands record last founder command intent
 * 2) /expect <note> — mark last command as wrong (silent / wrong output)
 * 3) /chronosv fix — AI reads routing targets, proposes surgical patch, optional auto-push via Prometheus patterns
 * 4) Never infinite loop: max 2 auto-pushes / 15 min
 */
import { powerChat } from './powerhouse.js';

const ADMIN = () => String(process.env.ADMIN_ID || process.env.FOUNDER_ID || '').trim();
const MAX_AUTO = 2;
const WINDOW_MS = 15 * 60 * 1000;
const autoLog = []; // { t }

function isFounder(ctx) {
  return String(ctx?.from?.id || '') === ADMIN();
}

function ghHeaders() {
  return {
    Authorization: 'Bearer ' + (process.env.GITHUB_TOKEN || process.env.GH_TOKEN || ''),
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'PasiyaOS-ChronosV',
  };
}

function repoParts() {
  const r = process.env.GITHUB_REPO || 'pasindudananjaya92-bot/radiant-queen-pasiya-max-v2';
  const [owner, name] = r.split('/');
  return { owner, name };
}

async function githubGet(path) {
  const { owner, name } = repoParts();
  const url = `https://api.github.com/repos/${owner}/${name}/contents/${path.replace(/^\//, '')}`;
  const res = await fetch(url, { headers: ghHeaders() });
  if (!res.ok) throw new Error('GET ' + path + ' ' + res.status);
  const j = await res.json();
  return {
    content: Buffer.from(j.content || '', 'base64').toString('utf8'),
    sha: j.sha,
    path,
  };
}

async function githubPut(path, content, sha, message) {
  const { owner, name } = repoParts();
  const url = `https://api.github.com/repos/${owner}/${name}/contents/${path.replace(/^\//, '')}`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: { ...ghHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: message || 'chronos-v: logic fix',
      content: Buffer.from(content, 'utf8').toString('base64'),
      branch: process.env.GITHUB_BRANCH || 'main',
      sha,
    }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.message || 'PUT ' + res.status);
  return j;
}

/** In-memory last intent (process-local; good enough on warm lambda) */
const lastIntent = new Map(); // uid -> { cmd, text, ts }

export function recordIntent(ctx, cmd, text) {
  const uid = String(ctx?.from?.id || '');
  if (!uid) return;
  lastIntent.set(uid, { cmd, text: String(text || ''), ts: Date.now() });
}

async function loadExpect(supabase, uid) {
  if (!supabase) return null;
  try {
    const { data } = await supabase
      .from('pasiya_fs')
      .select('content')
      .eq('path', '/Documents/chronosv-last.json')
      .maybeSingle();
    if (data?.content) return JSON.parse(data.content);
  } catch (_) {}
  return null;
}

async function saveExpect(supabase, obj) {
  if (!supabase) return;
  const path = '/Documents/chronosv-last.json';
  const content = JSON.stringify(obj, null, 2);
  const { data: ex } = await supabase.from('pasiya_fs').select('id').eq('path', path).maybeSingle();
  if (ex?.id) {
    await supabase.from('pasiya_fs').update({ content }).eq('path', path);
  } else {
    await supabase.from('pasiya_fs').insert({ path, type: 'file', content, size: content.length });
  }
}

function canAutoPush() {
  const now = Date.now();
  while (autoLog.length && now - autoLog[0].t > WINDOW_MS) autoLog.shift();
  return autoLog.length < MAX_AUTO;
}

/** Map command → likely source files */
function filesForCommand(cmd) {
  const c = String(cmd || '').toLowerCase();
  if (c.includes('echo')) return ['lib/echoX.js', 'lib/v2000Routes.js', 'api/telegram.js'];
  if (c.includes('research') || c.includes('deepmind'))
    return ['lib/deepMindPro.js', 'lib/v2000Routes.js', 'api/telegram.js'];
  if (c.includes('radar') || c.includes('power')) return ['lib/powerhouse.js', 'lib/v2000Routes.js'];
  return ['lib/v2000Routes.js', 'api/telegram.js'];
}

export async function handleChronosV({ cmd, text, ctx, supabase, bot }) {
  if (!isFounder(ctx)) return '👑 Founder-only.';
  const raw = String(text || '').replace(/^\/(chronosv|expect)(@\w+)?\s*/i, '').trim();
  const uid = String(ctx.from.id);

  if (cmd === '/expect') {
    const note = raw || 'silent or wrong output';
    const intent = lastIntent.get(uid) || { cmd: 'unknown', text: '', ts: Date.now() };
    const row = {
      intent,
      note,
      ts: Date.now(),
    };
    await saveExpect(supabase, row);
    return (
      '⏱ Chronos-V logged expectation failure\n' +
      'Last cmd: ' +
      (intent.cmd || '?') +
      '\nNote: ' +
      note +
      '\nRun: /chronosv diagnose   or   /chronosv fix'
    );
  }

  if (!raw || raw === 'help' || raw === 'status') {
    return (
      '⏱ CHRONOS-V · Logic Watchdog\n' +
      '1) Run a command (e.g. /echo on)\n' +
      '2) If wrong/silent: /expect silent\n' +
      '3) /chronosv diagnose — AI explains mismatch\n' +
      '4) /chronosv fix — surgical patch + GitHub PUT (max 2/15min)\n' +
      '5) Re-test the command after Vercel Ready\n\n' +
      'Why not auto 5s silence detect? Serverless request ends when handler returns — use /expect.'
    );
  }

  if (raw === 'diagnose' || raw.startsWith('diagnose')) {
    const exp = (await loadExpect(supabase, uid)) || {
      intent: lastIntent.get(uid),
      note: 'no /expect saved',
    };
    const files = filesForCommand(exp?.intent?.cmd || '');
    let snippets = '';
    for (const f of files.slice(0, 2)) {
      try {
        const g = await githubGet(f);
        // keep routing-related lines
        const lines = g.content.split('\n');
        const hit = [];
        lines.forEach((ln, i) => {
          if (/echo|research|handleV2000|founderCmds|isV2000|deepMind|wikipedia/i.test(ln)) {
            hit.push(String(i + 1) + ': ' + ln.slice(0, 120));
          }
        });
        snippets +=
          '\n--- ' + f + ' ---\n' + (hit.slice(0, 40).join('\n') || lines.slice(0, 30).join('\n'));
      } catch (e) {
        snippets += '\n--- ' + f + ' ERR ' + (e.message || e);
      }
    }
    const r = await powerChat(
      'Founder command failed logically (not necessarily crash).\n' +
        'Intent: ' +
        JSON.stringify(exp?.intent || {}) +
        '\nFailure note: ' +
        (exp?.note || '') +
        '\nRouting snippets:\n' +
        snippets.slice(0, 12000) +
        '\n\nExplain root cause in 5 bullets. Name exact file + what to change. No full file dump.',
      { system: 'You are Chronos-V logic surgeon for PasiyaOS.', maxTokens: 1000 }
    );
    if (!r.ok) return 'diagnose fail: ' + (r.error || '') + '\n' + (r.tried || []).join('\n');
    return '⏱ DIAGNOSE · ' + r.engine + '\n\n' + r.text;
  }

  if (raw === 'fix' || raw.startsWith('fix')) {
    if (!canAutoPush()) {
      return '⏱ Auto-fix rate limit (max ' + MAX_AUTO + ' / 15 min). Run /chronosv diagnose and patch manually.';
    }
    const exp = (await loadExpect(supabase, uid)) || {
      intent: lastIntent.get(uid),
      note: 'logic error',
    };
    // Prefer small routing file
    const target = 'lib/v2000Routes.js';
    let file;
    try {
      file = await githubGet(target);
    } catch (e) {
      return 'Cannot fetch ' + target + ': ' + (e.message || e);
    }

    const r = await powerChat(
      'Fix this routing module so commands /echo and /research use Echo X and DeepMind Pro, not wikipedia or silence.\n' +
        'Failure: ' +
        JSON.stringify(exp) +
        '\n\nFULL FILE:\n' +
        file.content.slice(0, 20000) +
        '\n\nReturn COMPLETE fixed file only. No markdown.',
      {
        system:
          'You are Chronos-V. Output only valid JS for lib/v2000Routes.js. Keep exports handleV2000 isV2000Command.',
        maxTokens: 8000,
        temperature: 0.1,
      }
    );
    if (!r.ok) return 'fix AI fail: ' + (r.error || '');
    let body = r.text.replace(/^```(?:js|javascript)?\n?/i, '').replace(/\n?```$/i, '').trim();
    if (body.length < 200 || !body.includes('handleV2000')) {
      return 'fix rejected: model did not return a full v2000Routes.js';
    }
    // brace balance
    let c = 0;
    for (const ch of body) {
      if (ch === '{') c++;
      else if (ch === '}') c--;
      if (c < 0) return 'fix rejected: unbalanced braces';
    }
    if (c !== 0) return 'fix rejected: unbalanced braces diff=' + c;

    try {
      await githubPut(target, body, file.sha, 'chronos-v: fix routing ' + (exp?.intent?.cmd || ''));
      autoLog.push({ t: Date.now() });
      return (
        '⏱ Chronos-V pushed `' +
        target +
        '`\nWait Vercel Ready, then re-run:\n' +
        (exp?.intent?.cmd || '/echo on') +
        '\n\nIf still wrong: /expect <note> then /chronosv diagnose'
      );
    } catch (e) {
      return 'GitHub PUT fail: ' + (e.message || e);
    }
  }

  return handleChronosV({
    cmd: '/chronosv',
    text: '/chronosv help',
    ctx,
    supabase,
    bot,
  });
}

export default { handleChronosV, recordIntent };
