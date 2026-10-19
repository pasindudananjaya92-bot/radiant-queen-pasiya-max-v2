/**
 * lib/prFix.js v2 — Surgical-first self-heal (timeout-safe)
 *
 * Why v1 failed on 12KB files:
 *  - Full-file rewrite → slow (90s Vercel timeout) + easy unbalanced ()
 * Strategy:
 *  1) SURGICAL (default): AI returns JSON find/replace patches only
 *  2) Apply patches in-process → validate → GitHub write
 *  3) Local heuristics for known one-line fixes (SENTRY) — no AI
 *  4) Fast models first, AbortController 22s timeouts
 */

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const GITHUB_REPO = process.env.GITHUB_REPO || 'pasindudananjaya92-bot/radiant-queen-pasiya-max-v2';
const GROQ_KEY = process.env.GROQ_API_KEY || '';
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY || '';
const GEMINI_KEY = process.env.GEMINI_API_KEY || process.env.GEMINI_KEY || '';

const MAX_ATTEMPTS = 4;
const PROVIDER_TIMEOUT_MS = 22000;
const MAX_OUT_CHARS = 220000;

function ownerRepo() {
  const p = String(GITHUB_REPO).split('/');
  return { owner: p[0] || '', repo: p[1] || '' };
}

export function stripCodeFences(text) {
  let t = String(text || '').trim();
  const m = t.match(/^```(?:json|js|javascript|ts|typescript)?\s*\n([\s\S]*?)\n```\s*$/i);
  if (m) return m[1].trim();
  if (t.startsWith('```')) {
    t = t.replace(/^```[a-zA-Z0-9]*\s*\n?/, '').replace(/\n?```\s*$/, '');
  }
  return t.trim();
}

export function balanceCheck(code) {
  const s = String(code || '');
  let brace = 0,
    paren = 0,
    bracket = 0;
  let inS = false,
    inD = false,
    inT = false,
    inLine = false,
    inBlock = false;
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

export function validateGenerated(original, generated, filePath) {
  const gen = stripCodeFences(generated);
  const orig = String(original || '');
  const path = String(filePath || '');

  if (!gen || gen.length < 40) return { ok: false, reason: 'output too short (<40 chars)' };
  if (gen.length > MAX_OUT_CHARS) return { ok: false, reason: 'output exceeds hard ceiling' };

  const badEnds = [/\*\s*Build founder self-im\s*$/i, /\.\.\.\s*$/, /self-im\s*$/i, /\/\*\*[^*]*$/i];
  for (const re of badEnds) {
    if (re.test(gen.slice(-120))) return { ok: false, reason: 'looks truncated at end' };
  }

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
        reason: 'too short vs original (' + gen.length + '/' + orig.length + ' < ' + minRatio + ')',
      };
    }
    if (ratio > 2.5 && orig.length > 2000) {
      return { ok: false, reason: 'suspiciously larger than original' };
    }
  }

  if (/\bexport\s+/.test(orig) && !/\bexport\s+/.test(gen)) {
    return { ok: false, reason: 'original has export, generated lost all exports' };
  }
  if (/\.(js|mjs|cjs|ts)$/i.test(path) || /^(api|lib)\//i.test(path)) {
    const bal = balanceCheck(gen);
    if (!bal.ok) return { ok: false, reason: bal.reason };
  }
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
    'https://api.github.com/repos/' + owner + '/' + repo + '/contents/' + path.replace(/^\/+/, '');
  const res = await fetch(url, {
    headers: {
      Authorization: 'Bearer ' + GITHUB_TOKEN,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'pasiya-prfix',
    },
  });
  const text = await res.text();
  if (!res.ok) return { ok: false, error: 'GitHub GET ' + res.status + ': ' + text.slice(0, 180) };
  let j;
  try {
    j = JSON.parse(text);
  } catch {
    return { ok: false, error: 'GitHub JSON parse fail' };
  }
  if (!j.content || j.encoding !== 'base64') return { ok: false, error: 'Not a file or empty' };
  const content = Buffer.from(j.content.replace(/\n/g, ''), 'base64').toString('utf8');
  return { ok: true, content, sha: j.sha, path: j.path };
}

async function githubPutFile(path, content, message, sha) {
  const { owner, repo } = ownerRepo();
  const url =
    'https://api.github.com/repos/' + owner + '/' + repo + '/contents/' + path.replace(/^\/+/, '');
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
  if (!res.ok) return { ok: false, error: 'GitHub PUT ' + res.status + ': ' + text.slice(0, 220) };
  let j = {};
  try {
    j = JSON.parse(text);
  } catch (_) {}
  return { ok: true, url: j.content?.html_url || j.commit?.html_url || '', path };
}

async function fetchWithTimeout(url, options, ms) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

async function completeShort(system, user) {
  const errors = [];

  if (GROQ_KEY) {
    for (const model of ['llama-3.1-8b-instant', 'llama-3.3-70b-versatile']) {
      try {
        const r = await fetchWithTimeout(
          'https://api.groq.com/openai/v1/chat/completions',
          {
            method: 'POST',
            headers: {
              Authorization: 'Bearer ' + GROQ_KEY,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model,
              temperature: 0.05,
              max_tokens: 2500,
              messages: [
                { role: 'system', content: system },
                { role: 'user', content: user },
              ],
            }),
          },
          PROVIDER_TIMEOUT_MS
        );
        const j = await r.json();
        const text = j.choices?.[0]?.message?.content || '';
        if (r.ok && text.trim().length > 10) {
          return { ok: true, text, provider: 'groq:' + model };
        }
        errors.push('groq ' + model + ': ' + (j.error?.message || r.status));
      } catch (e) {
        errors.push('groq ' + model + ': ' + String(e.message || e));
      }
    }
  }

  if (OPENROUTER_KEY) {
    try {
      const r = await fetchWithTimeout(
        'https://openrouter.ai/api/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            Authorization: 'Bearer ' + OPENROUTER_KEY,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://radiant-queen-pasiya-max-v2.vercel.app',
            'X-Title': 'Pasiya prFix',
          },
          body: JSON.stringify({
            model: 'openai/gpt-4o-mini',
            temperature: 0.05,
            max_tokens: 2500,
            messages: [
              { role: 'system', content: system },
              { role: 'user', content: user },
            ],
          }),
        },
        PROVIDER_TIMEOUT_MS
      );
      const j = await r.json();
      const text = j.choices?.[0]?.message?.content || '';
      if (r.ok && text.trim().length > 10) {
        return { ok: true, text, provider: 'openrouter' };
      }
      errors.push('openrouter: ' + (j.error?.message || r.status));
    } catch (e) {
      errors.push('openrouter: ' + String(e.message || e));
    }
  }

  if (GEMINI_KEY) {
    for (const model of ['gemini-2.0-flash', 'gemini-1.5-flash']) {
      try {
        const url =
          'https://generativelanguage.googleapis.com/v1beta/models/' +
          model +
          ':generateContent?key=' +
          encodeURIComponent(GEMINI_KEY);
        const r = await fetchWithTimeout(
          url,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              system_instruction: { parts: [{ text: system }] },
              contents: [{ role: 'user', parts: [{ text: user }] }],
              generationConfig: { temperature: 0.05, maxOutputTokens: 2048 },
            }),
          },
          PROVIDER_TIMEOUT_MS
        );
        const j = await r.json();
        const text =
          j.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
        if (r.ok && text.trim().length > 10) {
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

function parsePatches(text) {
  let t = stripCodeFences(text);
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start < 0 || end <= start) return { ok: false, error: 'no JSON object in AI output' };
  t = t.slice(start, end + 1);
  let j;
  try {
    j = JSON.parse(t);
  } catch (e) {
    return { ok: false, error: 'JSON parse: ' + String(e.message || e) };
  }
  const reps = j.replacements || j.patches || j.edits;
  if (!Array.isArray(reps)) return { ok: false, error: 'JSON missing replacements array' };
  if (!reps.length) return { ok: true, replacements: [] };
  const cleaned = [];
  for (const r of reps) {
    const oldS = String(r.old ?? r.find ?? r.from ?? '');
    const newS = String(r.new ?? r.replace ?? r.to ?? '');
    if (!oldS) return { ok: false, error: 'empty old string in patch' };
    cleaned.push({ old: oldS, new: newS });
  }
  return { ok: true, replacements: cleaned };
}

function applyPatches(content, replacements) {
  let out = content;
  for (const { old, new: neo } of replacements) {
    if (!out.includes(old)) {
      return {
        ok: false,
        error: 'patch old-string not found in file:\n' + old.slice(0, 120),
      };
    }
    out = out.replace(old, neo);
  }
  return { ok: true, content: out };
}

function localHeuristicFix(content, goal, filePath) {
  if (!/errorRadar\.js$/i.test(filePath)) return null;
  const g = String(goal || '').toLowerCase();
  if (!/sentry/.test(g)) return null;

  let next = content;
  let changed = false;

  const patterns = [
    [
      "ok('SENTRY_DSN', Boolean(process.env.SENTRY_DSN), process.env.SENTRY_DSN ? 'set' : 'optional');",
      "ok('SENTRY_DSN', true, process.env.SENTRY_DSN ? 'set' : 'optional — not required');",
    ],
    [
      'ok("SENTRY_DSN", Boolean(process.env.SENTRY_DSN), process.env.SENTRY_DSN ? "set" : "optional");',
      'ok("SENTRY_DSN", true, process.env.SENTRY_DSN ? "set" : "optional — not required");',
    ],
    [
      "ok('SENTRY_DSN', Boolean(process.env.SENTRY_DSN), process.env.SENTRY_DSN ? 'set' : 'optional — not required');",
      "ok('SENTRY_DSN', true, process.env.SENTRY_DSN ? 'set' : 'optional — not required');",
    ],
  ];
  for (const [a, b] of patterns) {
    if (next.includes(a)) {
      next = next.replace(a, b);
      changed = true;
    }
  }
  if (
    /ok\(\s*['"]SENTRY_DSN['"]\s*,\s*true\s*,/.test(next) &&
    !/ok\(\s*['"]SENTRY_DSN['"]\s*,\s*Boolean\(/.test(next)
  ) {
    return {
      ok: true,
      content: next,
      note: changed ? 'local SENTRY patch applied' : 'already correct',
    };
  }
  if (changed) return { ok: true, content: next, note: 'local SENTRY patch applied' };
  return null;
}

function surgicalPrompt(path, original, goal, attempt, lastFail) {
  const system = `You are a precise code surgeon.
Return ONLY valid JSON (no markdown, no prose):
{"replacements":[{"old":"exact substring from file","new":"replacement"}]}

Rules:
- old must be an EXACT copy of text from the file (enough context to be unique).
- Prefer 1-3 small replacements. Never rewrite the whole file.
- Keep parentheses (), braces {}, brackets [] balanced inside every "new" string.
- Count ( and ) in each "new" value — they must be equal.
- Do not escape incorrectly. Use normal JSON string escaping.
- If goal is already satisfied, return {"replacements":[]}.`;

  let excerpt = original;
  const g = goal.toLowerCase();
  if (/sentry|optional|diagnose/.test(g) && original.length > 4000) {
    const idx = original.indexOf('SENTRY');
    if (idx >= 0) {
      excerpt = original.slice(Math.max(0, idx - 500), Math.min(original.length, idx + 800));
    } else {
      excerpt = original.slice(0, 3500);
    }
  } else if (original.length > 12000) {
    excerpt = original.slice(0, 12000) + '\n/* ...file continues... */';
  }

  let user =
    'FILE: ' + path + '\nGOAL: ' + goal + '\nATTEMPT: ' + attempt + '/' + MAX_ATTEMPTS + '\n';
  if (lastFail) {
    user +=
      'PREVIOUS ERROR: ' +
      lastFail +
      '\nFix that exact issue. If unbalanced (), ensure every ( has a matching ).\n';
  }
  user += '\n---FILE EXCERPT---\n' + excerpt + '\n---END---\nJSON only:';
  return { system, user };
}

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

  await log('Reading ' + path + '…');
  const got = await githubGetFile(path);
  if (!got.ok) return { ok: false, error: got.error };

  // Chronos: keep pre-change snapshot for /rollback
  try {
    const chronos = await import('../lib/chronos.js');
    await chronos.snapshotFile(path, { goal: String(goal || '') });
    await log('Chronos snapshot saved');
  } catch (_) {}

  const local = localHeuristicFix(got.content, goal, path);
  if (local && local.ok) {
    if (local.note === 'already correct') {
      await log('Already correct — no write needed');
      return {
        ok: true,
        path,
        bytes: got.content.length,
        provider: 'local-heuristic',
        attempts: 0,
        url: '',
        note: local.note,
      };
    }
    const v = validateGenerated(got.content, local.content, path);
    if (v.ok) {
      await log(local.note + ' — writing…');
      const put = await githubPutFile(
        path,
        v.code,
        'prfix local: ' + String(goal).slice(0, 60),
        got.sha
      );
      if (!put.ok) return { ok: false, error: put.error };
      return {
        ok: true,
        path,
        bytes: v.code.length,
        provider: 'local-heuristic',
        attempts: 0,
        url: put.url,
      };
    }
  }

  let lastFail = '';
  let lastProvider = '';

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    await log('Surgical AI ' + attempt + '/' + MAX_ATTEMPTS + '…');
    const { system, user } = surgicalPrompt(path, got.content, goal, attempt, lastFail);
    const ai = await completeShort(system, user);
    if (!ai.ok) {
      lastFail = ai.error || 'AI failed';
      await log('AI fail: ' + String(lastFail).slice(0, 140));
      continue;
    }
    lastProvider = ai.provider || '';
    const parsed = parsePatches(ai.text);
    if (!parsed.ok) {
      lastFail = parsed.error;
      await log('Patch parse fail: ' + lastFail);
      continue;
    }
    if (!parsed.replacements.length) {
      await log('AI says no changes needed');
      return {
        ok: true,
        path,
        bytes: got.content.length,
        provider: lastProvider,
        attempts: attempt,
        url: '',
        note: 'no-op',
      };
    }
    const applied = applyPatches(got.content, parsed.replacements);
    if (!applied.ok) {
      lastFail = applied.error;
      await log('Apply fail: ' + String(lastFail).slice(0, 140));
      continue;
    }
    const v = validateGenerated(got.content, applied.content, path);
    if (!v.ok) {
      lastFail = v.reason + ' — balance ( ) { } [ ] inside each replacement';
      await log('Validate fail: ' + v.reason);
      continue;
    }
    await log('Validation OK — writing…');
    const put = await githubPutFile(
      path,
      v.code,
      'prfix surgical: ' + String(goal).slice(0, 60),
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
    error:
      'Surgical prfix failed after retries. Last: ' +
      lastFail +
      ' — Tip: one-line env checks use local heuristics; avoid full-file rewrite.',
    provider: lastProvider,
  };
}

export default { runPrFix, validateGenerated, stripCodeFences, balanceCheck };
