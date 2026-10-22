/**
 * Self-Healing Uploader — syntax check + AI fix before GitHub push
 */
import { execFile } from 'child_process';
import { writeFileSync, unlinkSync, mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

function balanceCheck(code) {
  const stack = [];
  let inS = null;
  let lineC = false;
  let blockC = false;
  const pairs = { '(': ')', '[': ']', '{': '}' };
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
    if (pairs[c]) stack.push(c);
    else if (c === ')' || c === ']' || c === '}') {
      const last = stack.pop();
      if (!last || pairs[last] !== c) {
        return { ok: false, error: 'unbalanced ' + c + ' @' + i };
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
    const msg = String((e && e.stderr) || (e && e.message) || e).slice(0, 500);
    return { ok: false, error: msg };
  } finally {
    try {
      unlinkSync(file);
    } catch (_) {}
  }
}

async function aiFixSyntax(code, errorMsg, path) {
  const groq = process.env.GROQ_API_KEY || '';
  const gem = process.env.GEMINI_API_KEY || '';
  const sys =
    'Fix ONLY JavaScript syntax errors. Output the COMPLETE fixed source file. No markdown. No explanation.';
  const user =
    'Path: ' +
    path +
    '\nError:\n' +
    errorMsg +
    '\n\nSOURCE:\n' +
    String(code).slice(0, 10000);

  if (groq) {
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
            { role: 'system', content: sys },
            { role: 'user', content: user },
          ],
        }),
      });
      const j = await res.json();
      let text = (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '';
      text = text.replace(/^```(?:js|javascript)?\n?/i, '').replace(/\n?```$/i, '').trim();
      if (text.length > 50) return { ok: true, code: text };
    } catch (_) {}
  }

  if (gem) {
    try {
      const url =
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' +
        encodeURIComponent(gem);
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: sys + '\n\n' + user }] }],
        }),
      });
      const j = await res.json();
      let text =
        (j.candidates &&
          j.candidates[0] &&
          j.candidates[0].content &&
          j.candidates[0].content.parts &&
          j.candidates[0].content.parts[0] &&
          j.candidates[0].content.parts[0].text) ||
        '';
      text = text.replace(/^```(?:js|javascript)?\n?/i, '').replace(/\n?```$/i, '').trim();
      if (text.length > 50) return { ok: true, code: text };
    } catch (_) {}
  }

  return { ok: false, error: 'AI returned empty — fix syntax manually' };
}

export async function healSourceBeforePush(path, code) {
  const src = String(code || '');
  let check = await nodeSyntaxCheck(src);
  if (check.ok) return { ok: true, code: src, fixed: false, attempts: 0 };

  let current = src;
  let lastErr = check.error;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const fixed = await aiFixSyntax(current, lastErr, path);
    if (!fixed.ok) {
      return {
        ok: false,
        error: lastErr + ' | ' + fixed.error,
        attempts: attempt,
      };
    }
    check = await nodeSyntaxCheck(fixed.code);
    if (check.ok) {
      return { ok: true, code: fixed.code, fixed: true, attempts: attempt };
    }
    current = fixed.code;
    lastErr = check.error;
  }
  return { ok: false, error: 'Still invalid: ' + lastErr, attempts: 2 };
}

export default {
  nodeSyntaxCheck: nodeSyntaxCheck,
  healSourceBeforePush: healSourceBeforePush,
  balanceCheck: balanceCheck,
};
