/**
 * lib/prFix.js — Bulletproof AI file repair (founder-only path)
 *
 * NEVER use generateReply() here — it truncates to 3500 chars.
 * This module:
 *  1) Reads file from GitHub
 *  2) Asks AI for FULL file (high max_tokens)
 *  3) Validates syntax / size / structure
 *  4) Retries up to MAX_ATTEMPTS on failure
 *  5) Only then writes to GitHub
 */

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const GITHUB_REPO = process.env.GITHUB_REPO || 'pasindudananjaya92-bot/radiant-queen-pasiya-max-v2';
const GROQ_KEY = process.env.GROQ_API_KEY || '';
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY || '';
const GEMINI_KEY = process.env.GEMINI_API_KEY || process.env.GEMINI_KEY || '';

const MAX_ATTEMPTS = 3;
const MAX_OUT_CHARS = 220000; // hard ceiling for one write

function ownerRepo() {
  const p = String(GITHUB_REPO).split('/');
  return { owner: p[0] || '', repo: p[1] || '' };
}

/** Strip markdown fences AI sometimes wraps around code */
export function stripCodeFences(text) {
  let t = String(text || '').trim();
  // ```javascript ... ```
  const m = t.match(/^```(?:js|javascript|ts|typescript|json)?\s*\n([\s\S]*?)\n```\s*$/i);
  if (m) return m[1].trim();
  // leading fence only
  if (t.startsWith('```')) {
    t = t.replace(/^```[a-zA-Z0-9]*\s*\n?/, '').replace(/\n?```\s*$/, '');
  }
  return t.trim();
}

/** Balance check for {}, (), [] ignoring strings/comments (best-effort) */
export function balanceCheck(code) {
  const s = String(code || '');
  let brace = 0, paren = 0, bracket = 0;
  let inS = false, inD = false, inT = false, inLine = false, inBlock = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    const n = s[i + 1];
    if (inLine) {
      if (c === '\n') inLine = false;
      continue;
    }
    if (inBlock) {
      if (c === '*' && n === '/') {
        inBlock = false;
        i++;
      }
      continue;
    }
    if (inS) {
      if (c === '\\') {
        i++;
        continue;
      }
      if (c === "'") inS = false;
      continue;
    }
    if (inD) {
      if (c === '\\') {
        i++;
        continue;
      }
      if (c === '"') inD = false;
      continue;
    }
    if (inT) {
      if (c === '\\') {
        i++;
        continue;
      }
      if (c === '`') inT = false;
      continue;
    }
    if (c === '/' && n === '/') {
      inLine = true;
      i++;
      continue;
    }
    if (c === '/' && n === '*') {
      inBlock = true;
      i++;
      continue;
    }
    if (c === "'") {
      inS = true;
      continue;
    }
    if (c === '"') {
      inD = true;
      continue;
    }
    if (c === '`') {
      inT = true;
      continue;
    }
    if (c === '{') brace++;
    else if (c === '}') brace--;
    else if (c === '(') paren++;
    else if (c === ')') paren--;
    else if (c === '[') bracket++;
    else if (c === ']') bracket--;
    if (brace < 0 || paren < 0 || bracket < 0) {
      return { ok: false, reason: 'unbalanced closer before opener' };
    }
  }
  if (brace !== 0) return { ok: false, reason: 'unbalanced { } diff=' + brace };
  if (paren !== 0) return { ok: false, reason: 'unbalanced ( ) diff=' + paren };
  if (bracket !== 0) return { ok: false, reason: 'unbalanced [ ] diff=' + bracket };
  if (inS || inD || inT || inBlock) return { ok: false, reason: 'unclosed string or comment' };
  return { ok: true };
}

/**
 * Structural validation vs original
 */
export function validateGenerated(original, generated, filePath) {
  const gen = stripCodeFences(generated);
  const orig = String(original || '');
  const path = String(filePath || '');

  if (!gen || gen.length < 40) {
    return { ok: false, reason: 'output too short (<40 chars)' };
  }
  if (gen.length > MAX_OUT_CHARS) {
    return { ok: false, reason: 'output exceeds hard ceiling' };
  }

  // Truncation fingerprints
  const badEnds = [
    /\*\s*Build founder self-im\s*$/i,
    /\.\.\.\s*$/,
    /self-im\s*$/i,
    /\/\*\*[^*]*$/i, // unclosed block comment at end
  ];
  for (const re of badEnds) {
    if (re.test(gen.slice(-120))) {
      return { ok: false, reason: 'looks truncated at end' };
    }
  }

  // Size ratio — never allow catastrophic shrink on critical files
  const critical =
    /^(api\/telegram\.js|lib\/errorRadar\.js|lib\/fortress\.js|lib\/pasiyaFs\.js|api\/cron\.js)$/i.test(
      path
    );
  if (orig.length > 500) {
    const ratio = gen.length / orig.length;
    const minRatio = critical ? 0.85 : 0.45;
    if (ratio < minRatio) {
      return {
        ok: false,
        reason:
          'too short vs original (' +
          gen.length +
          '/' +
          orig.length +
          ' < ' +
          minRatio +
          ')',
      };
    }
    // runaway expansion
    if (ratio > 2.5 && orig.length > 2000) {
      return { ok: false, reason: 'suspiciously larger than original (>' + Math.round(ratio * 100) + '%)' };
    }
  }

  // Must keep exports if original had them
  if (/\bexport\s+/.test(orig) && !/\bexport\s+/.test(gen)) {
    return { ok: false, reason: 'original has export, generated lost all exports' };
  }
  // JS/TS files: balance
  if (/\.(js|mjs|cjs|ts)$/i.test(path) || /^(api|lib)\//i.test(path)) {
    const bal = balanceCheck(gen);
    if (!bal.ok) return { ok: false, reason: bal.reason };
  }

  // node --check style: reject obvious syntax tokens
  if (/\bInvalid or unexpected token\b/i.test(gen)) {
    return { ok: false, reason: 'contains error text, not code' };
  }

  return { ok: true, code: gen };
}

async function githubGetFile(path) {
  const { owner, repo } = ownerRepo();
  if (!GITHUB_TOKEN || !owner || !repo) {
    return { ok: false, error: 'GITHUB_TOKEN or GITHUB_REPO missing' };
  }
  const url =
    'https://api.github.com/repos/' +
    owner +
    '/' +
    repo +
    '/contents/' +
    path.replace(/^\/+/, '');
  const res = await fetch(url, {
    headers: {
      Authorization: 'Bearer ' + GITHUB_TOKEN,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'pasiya-prfix',
    },
  });
  const text = await res.text();
  if (!res.ok) {
    return { ok: false, error: 'GitHub GET ' + res.status + ': ' + text.slice(0, 180) };
  }
  let j;
  try {
    j = JSON.parse(text);
  } catch {
    return { ok: false, error: 'GitHub JSON parse fail' };
  }
  if (!j.content || j.encoding !== 'base64') {
    return { ok: false, error: 'Not a file or empty' };
  }
  const content = Buffer.from(j.content.replace(/\n/g, ''), 'base64').toString('utf8');
  return { ok: true, content, sha: j.sha, path: j.path };
}

async function githubPutFile(path, content, message, sha) {
  const { owner, repo } = ownerRepo();
  const url =
    'https://api.github.com/repos/' +
    owner +
    '/' +
    repo +
    '/contents/' +
    path.replace(/^\/+/, '');
  const body = {
    message: message || 'prfix auto-heal',
    content: Buffer.from(content, 'utf8').toString('base64'),
    branch: 'main',
  };
  if (sha) body.sha = sha;
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: 'Bearer ' + GITHUB_TOKEN,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'User-Agent': 'pasiya-prfix',
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    return { ok: false, error: 'GitHub PUT ' + res.status + ': ' + text.slice(0, 220) };
  }
  let j = {};
  try {
    j = JSON.parse(text);
  } catch (_) {}
  return {
    ok: true,
    url: j.content?.html_url || j.commit?.html_url || '',
    path,
  };
}

/** High-token completion — does NOT use generateReply (no 3500 cut) */
async function completeFull(system, user) {
  const errors = [];

  // 1) Groq
  if (GROQ_KEY) {
    try {
      const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + GROQ_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          temperature: 0.15,
          max_tokens: 16000,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
        }),
      });
      const j = await r.json();
      const text = j.choices?.[0]?.message?.content || '';
      if (r.ok && text.trim().length > 40) {
        return { ok: true, text, provider: 'groq' };
      }
      errors.push('groq: ' + (j.error?.message || r.status));
    } catch (e) {
      errors.push('groq: ' + String(e.message || e));
    }
  }

  // 2) OpenRouter
  if (OPENROUTER_KEY) {
    try {
      const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + OPENROUTER_KEY,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://radiant-queen-pasiya-max-v2.vercel.app',
          'X-Title': 'Pasiya prFix',
        },
        body: JSON.stringify({
          model: 'openai/gpt-4o-mini',
          temperature: 0.15,
          max_tokens: 16000,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
        }),
      });
      const j = await r.json();
      const text = j.choices?.[0]?.message?.content || '';
      if (r.ok && text.trim().length > 40) {
        return { ok: true, text, provider: 'openrouter' };
      }
      errors.push('openrouter: ' + (j.error?.message || r.status));
    } catch (e) {
      errors.push('openrouter: ' + String(e.message || e));
    }
  }

  // 3) Gemini REST
  if (GEMINI_KEY) {
    const models = ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-flash-latest'];
    for (const model of models) {
      try {
        const url =
          'https://generativelanguage.googleapis.com/v1beta/models/' +
          model +
          ':generateContent?key=' +
          encodeURIComponent(GEMINI_KEY);
        const r = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: system }] },
            contents: [{ role: 'user', parts: [{ text: user }] }],
            generationConfig: { temperature: 0.15, maxOutputTokens: 8192 },
          }),
        });
        const j = await r.json();
        const text =
          j.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
        if (r.ok && text.trim().length > 40) {
          return { ok: true, text, provider: 'gemini:' + model };
        }
        errors.push('gemini ' + model + ': ' + (j.error?.message || r.status));
      } catch (e) {
        errors.push('gemini: ' + String(e.message || e));
      }
    }
  }

  return { ok: false, error: errors.join(' | ') || 'no AI keys' };
}

function buildPrompt(path, original, goal, attempt, lastFail) {
  const system = `You are a senior staff engineer performing surgical file repair.
RULES (absolute):
1. Output the COMPLETE file contents only.
2. No markdown fences. No commentary before or after.
3. Do not truncate. Do not write "..." for omitted code.
4. Preserve all exports, imports, and public function names unless the goal requires changing them.
5. Valid JavaScript/TypeScript syntax only.`;

  let user =
    'FILE PATH: ' +
    path +
    '\nGOAL: ' +
    goal +
    '\nATTEMPT: ' +
    attempt +
    '/' +
    MAX_ATTEMPTS +
    '\n';

  if (lastFail) {
    user +=
      '\nPREVIOUS ATTEMPT FAILED VALIDATION: ' +
      lastFail +
      '\nRegenerate the ENTIRE file correctly. Do not truncate.\n';
  }

  // Keep original in prompt; if huge, still send (Groq 16k out, context may clip — warn)
  const maxIn = 100000;
  const body = original.length > maxIn ? original.slice(0, maxIn) + '\n/* TRUNCATED_INPUT_TAIL */\n' : original;
  user += '\n---CURRENT FILE START---\n' + body + '\n---CURRENT FILE END---\n';
  user += '\nReturn the full corrected file now.';
  return { system, user };
}

/**
 * Main entry: read → AI loop → validate → write
 */
export async function runPrFix(filePath, goal, onProgress) {
  const path = String(filePath || '')
    .replace(/^\/+/, '')
    .replace(/\\/g, '/')
    .trim();
  if (!path) return { ok: false, error: 'empty path' };
  if (!goal || !String(goal).trim()) return { ok: false, error: 'empty goal' };

  const log = async (m) => {
    try {
      if (onProgress) await onProgress(m);
    } catch (_) {}
  };

  await log('Reading ' + path + ' from GitHub…');
  const got = await githubGetFile(path);
  if (!got.ok) return { ok: false, error: got.error };

  let lastFail = '';
  let lastProvider = '';
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    await log('AI attempt ' + attempt + '/' + MAX_ATTEMPTS + '…');
    const { system, user } = buildPrompt(path, got.content, goal, attempt, lastFail);
    const ai = await completeFull(system, user);
    if (!ai.ok) {
      lastFail = ai.error || 'AI failed';
      await log('AI fail: ' + lastFail.slice(0, 120));
      continue;
    }
    lastProvider = ai.provider || '';
    const v = validateGenerated(got.content, ai.text, path);
    if (!v.ok) {
      lastFail = v.reason;
      await log('Validate fail: ' + v.reason);
      continue;
    }
    await log('Validation OK (' + v.code.length + ' chars, ' + lastProvider + '). Writing…');
    const put = await githubPutFile(
      path,
      v.code,
      'prfix: ' + String(goal).slice(0, 72),
      got.sha
    );
    if (!put.ok) return { ok: false, error: put.error, provider: lastProvider };
    return {
      ok: true,
      path,
      bytes: v.code.length,
      provider: lastProvider,
      attempts: attempt,
      url: put.url,
    };
  }
  return {
    ok: false,
    error: 'All ' + MAX_ATTEMPTS + ' attempts failed. Last: ' + lastFail,
    provider: lastProvider,
  };
}

export default { runPrFix, validateGenerated, stripCodeFences, balanceCheck };
