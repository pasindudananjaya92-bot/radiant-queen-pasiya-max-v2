/**
 * ghHeal — Self-healing uploader API expected by api/telegram.js
 *
 * telegram calls:
 *   const { healSourceBeforePush } = await import('../lib/ghHeal.js');
 *   const healed = await healSourceBeforePush(path, sourceString);
 *   healed.ok / healed.code / healed.fixed / healed.error
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const execFileAsync = promisify(execFile);

function balanceOk(src) {
  let a = 0, b = 0, c = 0;
  let inS = false, inD = false, inT = false, esc = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (esc) { esc = false; continue; }
    if (ch === '\\' && (inS || inD || inT)) { esc = true; continue; }
    if (!inD && !inT && ch === "'") { inS = !inS; continue; }
    if (!inS && !inT && ch === '"') { inD = !inD; continue; }
    if (!inS && !inD && ch === '`') { inT = !inT; continue; }
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

export async function syntaxCheck(source, filename = 'check.js') {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ghheal-'));
  const file = path.join(dir, (filename || 'check.js').replace(/[^\w.-]/g, '_') || 'check.js');
  try {
    await fs.writeFile(file, source, 'utf8');
    await execFileAsync('node', ['--check', file], { timeout: 20000 });
    return { ok: true };
  } catch (e) {
    const msg = String(e.stderr || e.message || e);
    // Parse line number if present
    const m = msg.match(/:(\d+)\n/) || msg.match(/:(\d+):/);
    return {
      ok: false,
      error: msg.slice(0, 1200),
      line: m ? Number(m[1]) : null,
    };
  } finally {
    try {
      await fs.rm(dir, { recursive: true, force: true });
    } catch (_) {}
  }
}

/** Surgical AI fix around error line — uses powerChat when available */
async function aiSurgicalFix(source, filename, syntaxErr) {
  let powerChat;
  try {
    const mod = await import('./powerhouse.js');
    powerChat = mod.powerChat;
  } catch (_) {
    return { ok: false, error: 'powerChat unavailable' };
  }

  const line = syntaxErr.line || 0;
  const lines = source.split('\n');
  const start = Math.max(0, (line || 1) - 25);
  const end = Math.min(lines.length, (line || 1) + 25);
  const snippet = lines.slice(start, end).join('\n');

  // For small files, send full source
  const useFull = source.length < 25000;
  const payload = useFull
    ? source
    : '/* lines ' + (start + 1) + '-' + end + ' */\n' + snippet;

  const r = await powerChat(
    'Fix JavaScript syntax only. File: ' +
      filename +
      '\nError:\n' +
      String(syntaxErr.error || '').slice(0, 500) +
      '\n\nSOURCE:\n' +
      payload +
      '\n\nRules:\n' +
      '- Output COMPLETE fixed file if source was full, OR the fixed snippet only if partial.\n' +
      '- No markdown fences.\n' +
      '- Preserve logic; fix brackets/strings/exports only.',
    {
      system: 'You are a surgical JS syntax fixer. Output code only.',
      temperature: 0.05,
      maxTokens: useFull ? 8000 : 2000,
    }
  );
  if (!r.ok) return { ok: false, error: r.error || 'AI fail' };

  let body = String(r.text || '')
    .replace(/^```(?:js|javascript)?\n?/i, '')
    .replace(/\n?```$/i, '')
    .trim();
  if (body.length < 20) return { ok: false, error: 'AI empty' };

  let next = body;
  if (!useFull && line) {
    // splice snippet back
    const before = lines.slice(0, start).join('\n');
    const after = lines.slice(end).join('\n');
    next = (before ? before + '\n' : '') + body + (after ? '\n' + after : '');
  }
  return { ok: true, code: next };
}

/**
 * Main entry used by telegram githubPutFile
 * @returns {{ ok:boolean, code?:string, fixed?:boolean, error?:string, stage?:string }}
 */
export async function healSourceBeforePush(filePath, source) {
  const src = String(source || '');
  const filename = String(filePath || 'file.js').split('/').pop() || 'file.js';

  if (!src.trim()) {
    return { ok: false, error: 'empty source', stage: 'empty' };
  }

  // Fast balance pre-check (helps AI targets)
  const bal = balanceOk(src);

  let check = await syntaxCheck(src, filename);
  if (check.ok && bal) {
    return { ok: true, code: src, fixed: false, stage: 'clean' };
  }
  if (check.ok && !bal) {
    // node --check passed but our balance heuristic failed (template strings etc.) — allow push
    return { ok: true, code: src, fixed: false, stage: 'clean-balance-soft' };
  }

  // Attempt surgical AI heal (up to 2 rounds)
  let current = src;
  let lastErr = check;
  for (let i = 0; i < 2; i++) {
    const fixed = await aiSurgicalFix(current, filename, lastErr);
    if (!fixed.ok) {
      return {
        ok: false,
        error:
          (lastErr.error || 'syntax error') +
          ' | heal: ' +
          (fixed.error || 'fail') +
          ' | Fix manually or paste smaller file.',
        stage: 'ai-heal-fail',
        line: lastErr.line,
      };
    }
    const re = await syntaxCheck(fixed.code, filename);
    if (re.ok) {
      return {
        ok: true,
        code: fixed.code,
        fixed: true,
        stage: 'healed-round-' + (i + 1),
      };
    }
    current = fixed.code;
    lastErr = re;
  }

  return {
    ok: false,
    error:
      'Unhealed syntax: ' +
      String(lastErr.error || '').slice(0, 400) +
      (lastErr.line ? ' @ line ' + lastErr.line : ''),
    stage: 'blocked',
    line: lastErr.line,
  };
}

/** Optional richer validate (syntax + probe) */
export async function prePushValidate(source, filename = 'file.js') {
  const h = await healSourceBeforePush(filename, source);
  if (!h.ok) return { ok: false, stage: h.stage, error: h.error };
  return { ok: true, fixed: h.fixed, code: h.code };
}

export { balanceOk };
export default {
  healSourceBeforePush,
  syntaxCheck,
  prePushValidate,
  balanceOk,
};
