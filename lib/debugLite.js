/**
 * /debug — Phase B fix
 * - Diagnosis: send TRIMMED source (not full 40k) to avoid All engines failed
 * - apply: still full file if < 25k, else refuse
 * - Surface per-engine errors from powerChat
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

/** Trim for diagnosis — head + exports + tail */
function trimForDiagnosis(source, maxChars) {
  const src = String(source || '');
  const limit = maxChars || 9000;
  if (src.length <= limit) return src;
  const head = src.slice(0, Math.floor(limit * 0.55));
  const tail = src.slice(-Math.floor(limit * 0.25));
  const lines = src.split('\n');
  const exportLines = lines
    .filter(function (l) {
      return /^\s*export\s+/m.test(l) || /function\s+\w+/.test(l);
    })
    .slice(0, 40)
    .join('\n');
  return (
    head +
    '\n\n/* … trimmed middle ' +
    (src.length - limit) +
    ' chars … */\n\n' +
    (exportLines ? '/* symbols */\n' + exportLines + '\n\n' : '') +
    tail
  );
}

function formatAiError(r) {
  if (!r) return 'unknown';
  const parts = [];
  if (r.error) parts.push(String(r.error));
  if (r.tried && r.tried.length) parts.push(r.tried.join(' | '));
  if (r.engines) parts.push(JSON.stringify(r.engines).slice(0, 400));
  return parts.join(' · ').slice(0, 800) || 'All engines failed';
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
      '/debug file lib/expectCmd.js :: explain persistence\n' +
      '/debug file lib/expectCmd.js :: apply :: <fix>\n\n' +
      'Diagnosis uses trimmed source (avoids AI timeout).\n' +
      'apply pushes only if braces balance.'
    );
  }

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

    // --- APPLY path (full rewrite, size-capped) ---
    if (doApply) {
      if (file.content.length > 25000) {
        return (
          '⚠️ File too large for apply (' +
          file.content.length +
          ' chars).\n' +
          'Upload surgically via gh or split the change.'
        );
      }
      const r = await powerChat(
        'FILE: ' +
          filePath +
          '\nPROBLEM: ' +
          problem +
          '\n\nFULL SOURCE:\n' +
          file.content +
          '\n\nOutput COMPLETE fixed JS only. Balanced braces. No markdown fences.',
        {
          system: 'Surgeon. Output only valid JS for ' + filePath,
          maxTokens: 6000,
          temperature: 0.05,
        }
      );
      if (!r.ok) {
        return '❌ Apply AI fail: ' + formatAiError(r);
      }
      let body = String(r.text || '')
        .replace(/^```(?:js|javascript)?\n?/i, '')
        .replace(/\n?```$/i, '')
        .trim();
      if (body.length < 40) return '❌ Empty patch.';
      if (!balanceOk(body)) return '❌ Unbalanced braces — not pushed.';
      try {
        await ghPutFile(
          filePath,
          body,
          file.sha,
          'debug apply: ' + problem.slice(0, 50)
        );
      } catch (e) {
        return '❌ Push failed: ' + (e.message || e);
      }
      return (
        '✅ Pushed `' +
        filePath +
        '`\n⏳ Vercel 30–60s then re-test.\nEngine: ' +
        (r.engine || '')
      );
    }

    // --- DIAGNOSIS path (trimmed — key fix for All engines failed) ---
    const snippet = trimForDiagnosis(file.content, 8500);
    const r = await powerChat(
      'FILE: ' +
        filePath +
        ' (' +
        file.content.length +
        ' chars total, snippet below)\n' +
        'PROBLEM: ' +
        problem +
        '\n\nSOURCE SNIPPET:\n' +
        snippet +
        '\n\nReply in short bullets:\n' +
        '1) Root cause\n2) Where in file (function names)\n3) Exact fix steps\n4) Test commands\n' +
        'Do NOT reprint the whole file.',
      {
        system:
          'Staff engineer. Max 12 short bullets. No full code dumps.',
        maxTokens: 900,
        temperature: 0.15,
      }
    );

    if (!r.ok) {
      // Fallback: diagnosis WITHOUT source (still useful)
      const r2 = await powerChat(
        'PasiyaOS file `' +
          filePath +
          '` problem: ' +
          problem +
          '\nFile size: ' +
          file.content.length +
          ' chars.\n' +
          'Known context: expect rules use Supabase rq_expect_rules + pasiya_fs backup; list/add/doctor commands.\n' +
          'Give root cause hypotheses and fix steps without source.',
        {
          system: 'Staff engineer. Concise.',
          maxTokens: 700,
          temperature: 0.2,
        }
      );
      if (!r2.ok) {
        return (
          '❌ Debug AI fail\n' +
          formatAiError(r) +
          '\nFallback: ' +
          formatAiError(r2) +
          '\n\nTry shorter problem text or /radar to check AI keys.'
        );
      }
      return (
        '🛠 DEBUG FILE · ' +
        filePath +
        ' · ' +
        (r2.engine || '') +
        ' (no-source fallback)\n\n' +
        r2.text.slice(0, 3500) +
        '\n\nApply: /debug file ' +
        filePath +
        ' :: apply :: ' +
        problem.slice(0, 60)
      );
    }

    return (
      '🛠 DEBUG FILE · ' +
      filePath +
      ' · ' +
      (r.engine || '') +
      '\n\n' +
      r.text.slice(0, 3500) +
      '\n\nApply: /debug file ' +
      filePath +
      ' :: apply :: ' +
      problem.slice(0, 60)
    );
  }

  // Generic paste
  const r = await powerChat(
    'PasiyaOS (Telegraf/Vercel/Supabase/GitHub). Diagnose:\n\n' +
      raw.slice(0, 5000) +
      '\n\nBullets: files, cause, fix steps, tests.',
    {
      system: 'Staff engineer. Concise.',
      maxTokens: 1000,
      temperature: 0.15,
    }
  );
  if (!r.ok) {
    return '❌ Debug failed: ' + formatAiError(r) + '\nCheck /radar AI keys.';
  }
  return (
    '🛠 DEBUG · ' +
    (r.engine || '') +
    '\n\n' +
    r.text +
    '\n\nTip: /debug file lib/foo.js :: <problem>'
  );
}

export default { handleDebug };
