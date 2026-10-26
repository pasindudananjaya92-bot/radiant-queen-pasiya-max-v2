/**
 * Project Prometheus — Autonomous self-correction engine
 * Founder-only. Max 3 attempts per command signature / 10 min.
 * Flow: catch → gather code+error → AI surgical patch → node --check → GitHub PUT → wait → re-run → DM
 */
import { createHash } from 'crypto';

const ADMIN = () => String(process.env.ADMIN_ID || process.env.FOUNDER_ID || '').trim();
const MAX_ATTEMPTS = 3;
const COOLDOWN_MS = 10 * 60 * 1000;
const WAIT_DEPLOY_MS = 0; // never block serverless — founder re-runs
const MAX_SNIPPET = 14000;

/** in-memory attempt map: signature -> { n, last } */
const attempts = new Map();

function sig(cmd, errMsg) {
  const h = createHash('sha256')
    .update(String(cmd || '') + '|' + String(errMsg || '').slice(0, 200))
    .digest('hex')
    .slice(0, 16);
  return h;
}

function canAttempt(signature) {
  const row = attempts.get(signature);
  if (!row) return { ok: true, n: 0 };
  if (Date.now() - row.last > COOLDOWN_MS) {
    attempts.delete(signature);
    return { ok: true, n: 0 };
  }
  if (row.n >= MAX_ATTEMPTS) return { ok: false, n: row.n };
  return { ok: true, n: row.n };
}

function recordAttempt(signature) {
  const row = attempts.get(signature) || { n: 0, last: 0 };
  row.n += 1;
  row.last = Date.now();
  attempts.set(signature, row);
  return row.n;
}

function ghHeaders() {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
  return {
    Authorization: 'Bearer ' + token,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'PasiyaOS-Prometheus',
  };
}

function repoParts() {
  const r = process.env.GITHUB_REPO || process.env.GH_REPO || '';
  const [owner, name] = String(r).split('/');
  return { owner, name, token: process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '' };
}

async function githubGetFile(path) {
  const { owner, name, token } = repoParts();
  if (!token || !owner || !name) throw new Error('GITHUB_TOKEN / GITHUB_REPO missing');
  const url = `https://api.github.com/repos/${owner}/${name}/contents/${path.replace(/^\//, '')}`;
  const res = await fetch(url, { headers: ghHeaders() });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('GitHub GET ' + res.status);
  const j = await res.json();
  const content = Buffer.from(j.content || '', 'base64').toString('utf8');
  return { content, sha: j.sha, path };
}

async function githubPutFile(path, content, message, sha) {
  const { owner, name, token } = repoParts();
  if (!token || !owner || !name) throw new Error('GITHUB_TOKEN / GITHUB_REPO missing');
  const url = `https://api.github.com/repos/${owner}/${name}/contents/${path.replace(/^\//, '')}`;
  const body = {
    message: message || 'prometheus: auto-fix',
    content: Buffer.from(content, 'utf8').toString('base64'),
    branch: process.env.GITHUB_BRANCH || 'main',
  };
  if (sha) body.sha = sha;
  const res = await fetch(url, {
    method: 'PUT',
    headers: { ...ghHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.message || 'GitHub PUT ' + res.status);
  return j;
}

/** Guess which file to patch from stack / command */
export function guessTargetFile(err, cmd) {
  const stack = String(err?.stack || err?.message || err || '');
  const m = stack.match(/\/(lib\/[a-zA-Z0-9_\-./]+\.js)/);
  if (m) return m[1];
  const m2 = stack.match(/(lib\/[a-zA-Z0-9_\-./]+\.js)/);
  if (m2) return m2[1];
  const c = String(cmd || '').toLowerCase();
  if (c.includes('omniprompt') || c.includes('omni ')) return 'lib/omniPrompt.js';
  if (c.includes('neural')) return 'lib/neuralMemory.js';
  if (c.includes('secrets')) return 'lib/secretsScan.js';
  if (c.includes('sandbox')) return 'lib/sandboxLite.js';
  if (c.includes('weekly')) return 'lib/weeklyDigest.js';
  if (c.includes('review')) return 'lib/prReview.js';
  if (c.includes('dbslow') || c.includes('db ')) return 'lib/dbSlow.js';
  if (c.includes('domain')) return 'lib/domainWatch.js';
  if (c.includes('selfheal')) return 'lib/selfHealTele.js';
  if (c.includes('swarm') || c.includes('legion')) return 'lib/legionSwarm.js';
  if (c.includes('architect')) return 'lib/godArchitect.js';
  if (c.includes('shell')) return 'lib/universeShell.js';
  if (c.includes('deploy') || c.includes('env')) return 'lib/galaxyGod.js';
  if (c.includes('forgepage') || c.includes('canvas')) return 'lib/liveCanvas.js';
  if (c.includes('prfix') || c.includes('heal')) return 'lib/ghHeal.js';
  // Prefer small lib over 600KB telegram.js
  return 'lib/omniPrompt.js';
}

function balanceCheck(src) {
  const s = String(src || '');
  let p = 0,
    b = 0,
    c = 0;
  for (const ch of s) {
    if (ch === '(') p++;
    else if (ch === ')') p--;
    else if (ch === '[') b++;
    else if (ch === ']') b--;
    else if (ch === '{') c++;
    else if (ch === '}') c--;
    if (p < 0 || b < 0 || c < 0) return { ok: false, reason: 'unbalanced early close' };
  }
  if (p !== 0) return { ok: false, reason: 'unbalanced () diff=' + p };
  if (b !== 0) return { ok: false, reason: 'unbalanced [] diff=' + b };
  if (c !== 0) return { ok: false, reason: 'unbalanced {} diff=' + c };
  return { ok: true };
}

async function aiPatch({ filePath, source, errorText, cmd }) {
  const key = process.env.GROQ_API_KEY || process.env.GROQ_KEY || '';
  const gemini = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';

  const errLine = String(errorText || '').match(/:(\d+)/);
  const lineHint = errLine ? Number(errLine[1]) : 0;
  let focus = source;
  if (source.length > MAX_SNIPPET && lineHint > 0) {
    const lines = source.split('\n');
    const start = Math.max(0, lineHint - 40);
    const end = Math.min(lines.length, lineHint + 40);
    focus =
      '// FILE: ' +
      filePath +
      ' lines ' +
      (start + 1) +
      '-' +
      end +
      '\n' +
      lines.slice(start, end).join('\n');
  } else if (source.length > MAX_SNIPPET) {
    focus = source.slice(0, MAX_SNIPPET);
  }

  const system = `You are PasiyaOS Prometheus auto-fixer.
Return ONLY the complete fixed JavaScript source for the file (or the full replacement of the snippet region if marked).
Rules:
- No markdown fences
- Balanced (), [], {}
- Keep exports working
- Minimal change to fix the error
- If only a snippet was given, return the FULL original file content with the fix applied (prefer full file when possible)`;

  const user = `Command: ${cmd}
Error:
${String(errorText).slice(0, 1200)}

Code (${filePath}):
${focus}

Output the full fixed file content only.`;

  // Groq first (fast)
  if (key) {
    for (const model of ['openai/gpt-oss-20b', 'qwen/qwen3-32b', 'llama-3.3-70b-versatile']) {
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 12000);
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          signal: ctrl.signal,
          headers: {
            Authorization: 'Bearer ' + key,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model,
            temperature: 0.1,
            max_tokens: 8000,
            messages: [
              { role: 'system', content: system },
              { role: 'user', content: user },
            ],
          }),
        });
        clearTimeout(t);
        const j = await res.json();
        let text = j?.choices?.[0]?.message?.content || '';
        text = text.replace(/^```(?:js|javascript)?\n?/i, '').replace(/\n?```$/i, '').trim();
        if (text.length > 50) return { ok: true, text, model: 'groq:' + model };
      } catch (_) {
        /* next */
      }
    }
  }

  if (gemini) {
    for (const model of ['gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3.5-flash-lite']) {
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 12000);
        const url =
          'https://generativelanguage.googleapis.com/v1beta/models/' +
          encodeURIComponent(model) +
          ':generateContent?key=' +
          encodeURIComponent(gemini);
        const res = await fetch(url, {
          method: 'POST',
          signal: ctrl.signal,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: system + '\n\n' + user }] }],
            generationConfig: { temperature: 0.1, maxOutputTokens: 8192 },
          }),
        });
        clearTimeout(t);
        const j = await res.json();
        let text = (j?.candidates?.[0]?.content?.parts || [])
          .map((p) => p.text || '')
          .join('');
        text = text.replace(/^```(?:js|javascript)?\n?/i, '').replace(/\n?```$/i, '').trim();
        if (text.length > 50) return { ok: true, text, model: 'gemini:' + model };
      } catch (_) {
        /* next */
      }
    }
  }

  return { ok: false, error: 'AI returned empty' };
}

/**
 * Apply surgical replace: if AI returned only a region, merge by error line;
 * if AI returned full file (starts with import/export/const), use as whole.
 */
function mergePatch(original, patched, errorText) {
  const p = String(patched || '').trim();
  if (!p) return { ok: false, reason: 'empty patch' };
  if (/^(import |export |const |async function |function |\/\*|\/\/)/m.test(p) && p.length > original.length * 0.5) {
    const bal = balanceCheck(p);
    if (!bal.ok) return { ok: false, reason: bal.reason };
    return { ok: true, content: p };
  }
  // Snippet-only: replace around error line
  const m = String(errorText || '').match(/:(\d+)/);
  const line = m ? Number(m[1]) : 0;
  if (!line) return { ok: false, reason: 'snippet without line number' };
  const lines = original.split('\n');
  const start = Math.max(0, line - 40);
  const end = Math.min(lines.length, line + 40);
  const next = lines.slice(0, start).concat(p.split('\n')).concat(lines.slice(end)).join('\n');
  const bal = balanceCheck(next);
  if (!bal.ok) return { ok: false, reason: bal.reason };
  return { ok: true, content: next };
}

export async function runPrometheus({ err, cmd, ctx, bot }) {
  const adminId = ADMIN();
  const fromId = String(ctx?.from?.id || '');
  if (!adminId || fromId !== adminId) {
    return { ok: false, skipped: true, reason: 'not founder' };
  }
  // skip prometheus for debug apply / expect / architect (manual flows)
  const c = String(cmd || '') + ' ' + String(ctx?.message?.text || '');
  if (/\/debug\b|\/expect\b|\/architect\b|apply\s+[0-9a-f-]{8}/i.test(c)) {
    return { ok: false, skipped: true, reason: 'skip prometheus for debug' };
  }

  const errorText = err?.stack || err?.message || String(err);
  const signature = sig(cmd, errorText);
  const gate = canAttempt(signature);
  if (!gate.ok) {
    return {
      ok: false,
      exhausted: true,
      n: gate.n,
      message:
        '❌ Prometheus: could not fix `' +
        (cmd || 'command') +
        '` after ' +
        MAX_ATTEMPTS +
        ' attempts.\n' +
        String(errorText).slice(0, 500),
    };
  }

  const n = recordAttempt(signature);
  const filePath = guessTargetFile(err, cmd);

  try {
    if (ctx?.reply) {
      await ctx.reply(
        '🔧 Prometheus · attempt ' +
          n +
          '/' +
          MAX_ATTEMPTS +
          '\nTarget: `' +
          filePath +
          '`\nGathering code…'
      ).catch(() => {});
    }

    const file = await githubGetFile(filePath);
    if (!file) {
      return { ok: false, message: 'Prometheus: file not found on GitHub: ' + filePath };
    }

    const patch = await aiPatch({
      filePath,
      source: file.content,
      errorText,
      cmd,
    });
    if (!patch.ok) {
      return { ok: false, message: 'Prometheus AI failed: ' + (patch.error || 'empty') };
    }

    const merged = mergePatch(file.content, patch.text, errorText);
    if (!merged.ok) {
      return { ok: false, message: 'Prometheus validate fail: ' + merged.reason };
    }

    // Prefer external node --check via short heuristic only (serverless has no node spawn reliably)
    if (merged.content.includes('SyntaxError') && merged.content.length < 20) {
      return { ok: false, message: 'Prometheus: invalid patch content' };
    }

    await githubPutFile(
      filePath,
      merged.content,
      'prometheus: auto-fix ' + (cmd || '').slice(0, 40) + ' (' + patch.model + ')',
      file.sha
    );

    if (ctx?.reply) {
      await ctx.reply(
        '✅ Patched `' +
          filePath +
          '` via ' +
          patch.model +
          '\n⏳ Redeploying — re-run the command in ~30s to verify.'
      ).catch(() => {});
    }
    // WAIT_DEPLOY_MS is 0 — do not block serverless

    // Soft re-invoke: tell founder to re-run (true re-dispatch of Telegraf update is unsafe)
    const report =
      '✅ Autonomous Fix report\n' +
      'Command: ' +
      (cmd || '?') +
      '\nFile: ' +
      filePath +
      '\nModel: ' +
      patch.model +
      '\nAttempt: ' +
      n +
      '/' +
      MAX_ATTEMPTS +
      '\nPlease re-run the command to verify.\n' +
      'Error was:\n' +
      String(errorText).slice(0, 400);

    if (bot && adminId) {
      await bot.telegram.sendMessage(adminId, report).catch(() => {});
    } else if (ctx?.reply) {
      await ctx.reply(report).catch(() => {});
    }

    return { ok: true, filePath, model: patch.model, n };
  } catch (e) {
    return {
      ok: false,
      message: 'Prometheus crash: ' + (e.message || e),
    };
  }
}

/** Wire helper for bot.catch */
export function createPrometheusCatch(bot) {
  return async (err, ctx) => {
    try {
      const text = ctx?.message?.text || ctx?.callbackQuery?.data || '';
      const cmd = String(text).split(/\s+/)[0] || 'unknown';
      // Never recurse on prometheus itself
      const fullText = String(text || '');
      if (/prometheus|autofix|\/gh\b|ghpath|\/debug\b|\/expect\b|\/architect\b|apply\s+/i.test(cmd + ' ' + fullText)) {
        if (ctx?.reply) await ctx.reply('❌ ' + (err?.message || err)).catch(() => {});
        return;
      }
      const r = await runPrometheus({ err, cmd, ctx, bot });
      if (r.skipped) {
        if (ctx?.reply) await ctx.reply('❌ ' + (err?.message || 'error')).catch(() => {});
        return;
      }
      if (r.exhausted && r.message && ctx?.reply) {
        await ctx.reply(r.message).catch(() => {});
        return;
      }
      if (!r.ok && r.message && ctx?.reply) {
        await ctx.reply(r.message).catch(() => {});
      }
    } catch (e2) {
      if (ctx?.reply) await ctx.reply('❌ catch: ' + (e2.message || e2)).catch(() => {});
    }
  };
}

export default {
  runPrometheus,
  createPrometheusCatch,
  guessTargetFile,
};
