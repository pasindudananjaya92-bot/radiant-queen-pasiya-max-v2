/**
 * /debug — Code Bug God Mode
 *
 * /debug <paste error>
 * /debug file lib/expectCmd.js :: <error or what to fix>
 * /debug file lib/expectCmd.js :: fix list not persisting
 */
import { powerChat } from './powerhouse.js';

const ADMIN = () =>
  String(process.env.ADMIN_ID || process.env.FOUNDER_ID || '').trim();

function ghHeaders() {
  return {
    Authorization:
      'Bearer ' + (process.env.GITHUB_TOKEN || process.env.GH_TOKEN || ''),
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'PasiyaOS-Debug',
  };
}

function repoParts() {
  const r =
    process.env.GITHUB_REPO ||
    'pasindudananjaya92-bot/radiant-queen-pasiya-max-v2';
  const [owner, name] = r.split('/');
  return { owner, name };
}

async function ghGetFile(filePath) {
  const { owner, name } = repoParts();
  const clean = String(filePath || '')
    .replace(/^\/+/, '')
    .replace(/\.\./g, '');
  const res = await fetch(
    'https://api.github.com/repos/' +
      owner +
      '/' +
      name +
      '/contents/' +
      clean,
    { headers: ghHeaders() }
  );
  if (!res.ok) throw new Error('GitHub GET ' + clean + ' → ' + res.status);
  const j = await res.json();
  if (j.type !== 'file' || !j.content) throw new Error('Not a file: ' + clean);
  return {
    path: clean,
    content: Buffer.from(j.content, 'base64').toString('utf8'),
    sha: j.sha,
  };
}

async function ghPutFile(filePath, content, sha, message) {
  const { owner, name } = repoParts();
  const res = await fetch(
    'https://api.github.com/repos/' +
      owner +
      '/' +
      name +
      '/contents/' +
      filePath.replace(/^\//, ''),
    {
      method: 'PUT',
      headers: { ...ghHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: message || 'debug: surgical fix',
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

export async function handleDebug({ text, ctx }) {
  if (String(ctx?.from?.id || '') !== ADMIN()) return '👑 Founder-only.';
  const raw = String(text || '')
    .replace(/^\/debug(@\w+)?\s*/i, '')
    .trim();

  if (!raw || raw === 'help') {
    return (
      '🛠 DEBUG · Phase B\n\n' +
      '/debug <paste error>\n' +
      '/debug file lib/expectCmd.js :: <what is wrong>\n' +
      '/debug file lib/expectCmd.js :: apply :: <what is wrong>\n\n' +
      'apply = push to GitHub if braces balanced\n' +
      'Without apply = diagnosis + proposed patch only'
    );
  }

  // /debug file <path> :: [apply ::] <problem>
  const fileMatch = raw.match(
    /^file\s+(\S+)\s*::\s*(?:(apply)\s*::\s*)?([\s\S]+)$/i
  );
  if (fileMatch) {
    const filePath = fileMatch[1].replace(/^\//, '');
    const doApply = String(fileMatch[2] || '').toLowerCase() === 'apply';
    const problem = fileMatch[3].trim();

    let file;
    try {
      file = await ghGetFile(filePath);
    } catch (e) {
      return '❌ Fetch failed: ' + (e.message || e);
    }

    if (file.content.length > 40000) {
      return (
        '⚠️ File too large (' +
        file.content.length +
        ' chars) for one-shot Surgeon.\n' +
        'Use /ghHeal upload or split the change.'
      );
    }

    const r = await powerChat(
      'FILE: ' +
        filePath +
        '\nPROBLEM: ' +
        problem +
        '\n\nFULL SOURCE:\n' +
        file.content +
        '\n\n' +
        (doApply
          ? 'Output COMPLETE fixed file only. Balanced braces. No markdown.'
          : 'Reply with:\n1) Root cause (3 bullets)\n2) Minimal patch description\n3) Optional full fixed file in a single code block if short enough.'),
      {
        system: doApply
          ? 'Surgeon. Output only valid JS source for ' + filePath
          : 'Staff engineer. Concise diagnosis.',
        maxTokens: doApply ? 7000 : 2000,
        temperature: 0.05,
      }
    );

    if (!r.ok) return 'Debug AI fail: ' + (r.error || '');

    if (!doApply) {
      return (
        '🛠 DEBUG FILE · ' +
        filePath +
        ' · ' +
        r.engine +
        '\n\n' +
        r.text.slice(0, 3500) +
        '\n\nTo push a fix:\n/debug file ' +
        filePath +
        ' :: apply :: ' +
        problem.slice(0, 80)
      );
    }

    let body = String(r.text || '')
      .replace(/^```(?:js|javascript)?\n?/i, '')
      .replace(/\n?```$/i, '')
      .trim();

    if (body.length < 40) return '❌ Surgeon returned empty patch.';
    if (!balanceOk(body)) {
      return (
        '❌ Patch unbalanced braces — NOT pushed.\n' +
        'Try again or fix manually via gh.'
      );
    }

    try {
      await ghPutFile(
        filePath,
        body,
        file.sha,
        'debug: ' + problem.slice(0, 60)
      );
    } catch (e) {
      return '❌ Push failed: ' + (e.message || e);
    }

    return (
      '✅ Pushed fix → `' +
      filePath +
      '`\n' +
      '⏳ Vercel ~30–60s then re-test.\n' +
      'Engine: ' +
      r.engine
    );
  }

  // Generic error paste
  const r = await powerChat(
    'PasiyaOS: Telegraf + Vercel + Supabase + GitHub.\n' +
      'Diagnose. List likely lib/ or api/ files, root cause, surgical steps, test commands.\n\n' +
      raw.slice(0, 7000),
    {
      system: 'Staff engineer. Concise bullets.',
      maxTokens: 1400,
      temperature: 0.15,
    }
  );
  if (!r.ok) return 'Debug failed: ' + (r.error || 'AI');
  return (
    '🛠 DEBUG · ' +
    r.engine +
    '\n\n' +
    r.text +
    '\n\nTip: /debug file lib/foo.js :: <problem>'
  );
}

export default { handleDebug };
