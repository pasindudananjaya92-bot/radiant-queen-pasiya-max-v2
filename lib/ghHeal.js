/**
 * Self-Healing Uploader — syntax check + AI fix before GitHub push
 * Uses node --check in Vercel runtime; Groq/Gemini to repair
 */
import { execFile } from 'child_process';
import { writeFileSync, unlinkSync, mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

function balanceCheck(code) {
  const pairs = { '(': ')', '[': ']', '{': '}' };
  const open = Object.keys(pairs);
  const stack = [];
  let inS = null;
  let lineC = false;
  let blockC = false;
  for (let i = 0; i < code.length; i++) {
    const c = code[i];
    const n = code[i + 1];
    if (lineC) {
      if (c === '\n') lineC = false;
      continue;
    }
    if (blockC) {
      if (c === '*' && n === '/') {
        blockC = false;
        i++;
      }
      continue;
    }
    if (inS) {
      if (c === '\\') {
        i++;
        continue;
      }
      if (c === inS) inS = null;
      continue;
    }
    if (c === '/' && n === '/') {
      lineC = true;
      i++;
      continue;
    }
    if (c === '/' && n === '*') {
      blockC = true;
      i++;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      inS = c;
      continue;
    }
    if (open.includes(c)) stack.push(c);
    else if (Object.values(pairs).includes(c)) {
      const last = stack.pop();
      if (!last || pairs[last] !== c) {
        return { ok: false, error: 'unbalanced ' + c + ' near index ' + i };
      }
    }
  }
  if (stack.length) return { ok: false, error: 'unclosed ' + stack.join(' ') };
  return { ok: true };
}

export async function nodeSyntaxCheck(code) {
  const bal = balanceCheck(code);
  if (!bal.ok) return bal;
  const dir = mkdtempSync(join(tmpdir(), 'ghheal-'));
  const file = join(dir, 'check.mjs');
  try {
    writeFileSync(file, code, 'utf8');
    await execFileAsync('node', ['--check', file], { timeout: 15000 });
    return { ok: true };
  } catch (e) {
    const msg = String(e.stderr || e.message || e).slice(0, 500);
    return { ok: false, error: msg };
  } finally {
    try {
      unlinkSync(file);
    } catch (_) {}
  }
}

async function aiFixSyntax(code, errorMsg, path) {
  const groq = process.env.GROQ_API_KEY || '';
  const prompt =
    'Fix ONLY syntax errors in this file. Return the COMPLETE fixed file source. No markdown fences. No explanation.\n' +
    'Path: ' +
    path +
    '\nError:\n' +
    errorMsg +
    '\n\nSOURCE:\n' +
    String(code).slice(0, 12000);
  if (!groq) return { ok: false, error: 'GROQ_API_KEY missing for AI fix' };
  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + groq,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
        temperature: 0,
        max_tokens: 8000,
        messages: [
          {
            role: 'system',
            content:
              'You are a precise JS syntax fixer. Output only valid JavaScript module source. Preserve logic.',
          },
          { role: 'user', content: prompt },
        ],
      }),
    });
    const j = await res.json();
    let text = j.choices?.[0]?.message?.content || '';
    text = text.replace(/^```(?:js|javascript)?\n?/i, '').replace(/\n?```$/i, '');
    if (!text.trim()) return { ok: false, error: 'AI returned empty' };
    return { ok: true, code: text };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
}

/**
 * @returns {{ ok: boolean, code?: string, fixed?: boolean, error?: string, attempts?: number }}
 */
export async function healSourceBeforePush(path, code) {
  const src = String(code || '');
  let check = await nodeSyntaxCheck(src);
  if (check.ok) return { ok: true, code: src, fixed: false, attempts: 0 };

  let current = src;
  let lastErr = check.error;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const fixed = await aiFixSyntax(current, lastErr, path);
    if (!fixed.ok) {
      return { ok: false, error: lastErr + ' | AI: ' + fixed.error, attempts: attempt };
    }
    check = await nodeSyntaxCheck(fixed.code);
    if (check.ok) {
      return { ok: true, code: fixed.code, fixed: true, attempts: attempt };
    }
    current = fixed.code;
    lastErr = check.error;
  }
  return {
    ok: false,
    error: 'Still invalid after AI heal: ' + lastErr,
    attempts: 2,
  };
}

export default { nodeSyntaxCheck, healSourceBeforePush, balanceCheck };
