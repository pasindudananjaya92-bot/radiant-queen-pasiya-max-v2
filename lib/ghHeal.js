/**
 * lib/ghHeal.js — Surgical Self-Healing Uploader
 * Strategy for large files (600KB+):
 *  1) node --check is the ONLY pass/fail authority
 *  2) On fail, parse line number from error
 *  3) Send ONLY a ±40 line window to AI
 *  4) Splice fixed window back, re-check
 *  5) Up to 4 surgical rounds; never dump whole file to AI
 */
import { execFile } from 'child_process';
import { writeFileSync, unlinkSync, mkdtempSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

const WINDOW = 40; // lines each side
const MAX_ROUNDS = 4;
const MAX_AI_CHARS = 12000;

/**
 * Run node --check; return { ok, error, line }
 */
export async function nodeSyntaxCheck(code) {
  const dir = mkdtempSync(join(tmpdir(), 'ghheal-'));
  const file = join(dir, 'check.mjs');
  try {
    writeFileSync(file, code, 'utf8');
    await execFileAsync('node', ['--check', file], {
      timeout: 20000,
      maxBuffer: 2 * 1024 * 1024,
    });
    return { ok: true };
  } catch (e) {
    const msg = String((e && e.stderr) || (e && e.message) || e);
    // Examples:
    // /tmp/.../check.mjs:16124
    // SyntaxError: Unexpected token '}'
    let line = null;
    const m1 = msg.match(/check\.mjs:(\d+)/);
    const m2 = msg.match(/:(\d+)\r?\n/);
    const m3 = msg.match(/line\s+(\d+)/i);
    if (m1) line = Number(m1[1]);
    else if (m2) line = Number(m2[1]);
    else if (m3) line = Number(m3[1]);
    return { ok: false, error: msg.slice(0, 800), line };
  } finally {
    try {
      unlinkSync(file);
    } catch (_) {}
  }
}

function extractWindow(code, line, radius) {
  const lines = String(code).split('\n');
  if (!line || line < 1) {
    // no line → last 80 lines (common for trailing brace issues)
    const start = Math.max(0, lines.length - 80);
    return {
      startLine: start + 1,
      endLine: lines.length,
      text: lines.slice(start).join('\n'),
      lines,
    };
  }
  const idx = line - 1;
  const start = Math.max(0, idx - radius);
  const end = Math.min(lines.length, idx + radius + 1);
  return {
    startLine: start + 1,
    endLine: end,
    text: lines.slice(start, end).join('\n'),
    lines,
  };
}

function spliceWindow(lines, startLine, endLine, newWindowText) {
  const before = lines.slice(0, startLine - 1);
  const mid = String(newWindowText).replace(/\r\n/g, '\n').split('\n');
  const after = lines.slice(endLine);
  return before.concat(mid).concat(after).join('\n');
}

function stripFences(text) {
  let t = String(text || '').trim();
  t = t.replace(/^```(?:js|javascript|ts|mjs)?\s*\n?/i, '');
  t = t.replace(/\n?```\s*$/i, '');
  return t.trim();
}

async function aiFixWindow({ path, errorMsg, line, windowText, startLine, endLine }) {
  const groq = process.env.GROQ_API_KEY || '';
  const gem = process.env.GEMINI_API_KEY || '';
  const prompt =
    'You are a precise JavaScript syntax surgeon.\n' +
    'Fix ONLY syntax errors inside the WINDOW below.\n' +
    'Return ONLY the fixed window source (same region). No markdown fences. No explanation.\n' +
    'Keep logic identical. Fix missing/extra braces, parens, brackets, or string quotes.\n\n' +
    'File: ' +
    path +
    '\nError line (approx): ' +
    (line || '?') +
    '\nWindow lines: ' +
    startLine +
    '-' +
    endLine +
    '\nCompiler error:\n' +
    String(errorMsg).slice(0, 500) +
    '\n\n--- WINDOW START ---\n' +
    String(windowText).slice(0, MAX_AI_CHARS) +
    '\n--- WINDOW END ---';

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
          max_tokens: 4000,
          messages: [
            {
              role: 'system',
              content:
                'Output only the fixed JavaScript window. No markdown. No commentary.',
            },
            { role: 'user', content: prompt },
          ],
        }),
      });
      const j = await res.json();
      const text = stripFences(
        (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || ''
      );
      if (text.length > 10) return { ok: true, code: text, engine: 'groq' };
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
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0, maxOutputTokens: 4000 },
        }),
      });
      const j = await res.json();
      const text = stripFences(
        (j.candidates &&
          j.candidates[0] &&
          j.candidates[0].content &&
          j.candidates[0].content.parts &&
          j.candidates[0].content.parts[0] &&
          j.candidates[0].content.parts[0].text) ||
          ''
      );
      if (text.length > 10) return { ok: true, code: text, engine: 'gemini' };
    } catch (_) {}
  }

  return { ok: false, error: 'AI empty on surgical window' };
}

/**
 * Heuristic local brace fix when AI unavailable:
 * If error is Unexpected token '}' — try removing that line's lone }
 * If unexpected end — try appending }
 * Very conservative; only applied when AI fails.
 */
function heuristicFix(code, check) {
  const lines = String(code).split('\n');
  const msg = String(check.error || '');
  const line = check.line;
  if (line && /Unexpected token\s*'\}'/.test(msg)) {
    const idx = line - 1;
    if (idx >= 0 && idx < lines.length && lines[idx].trim() === '}') {
      const next = lines.slice();
      next.splice(idx, 1);
      return { ok: true, code: next.join('\n'), note: 'removed lone } at ' + line };
    }
  }
  if (/Unexpected end of input|expected/i.test(msg)) {
    // try add closing brace at EOF once
    return { ok: true, code: code + '\n}\n', note: 'appended } at EOF' };
  }
  return { ok: false };
}

/**
 * Main entry used by githubPutFile
 */
export async function healSourceBeforePush(path, code) {
  const src0 = String(code || '');
  let current = src0;

  let check = await nodeSyntaxCheck(current);
  if (check.ok) {
    return { ok: true, code: current, fixed: false, attempts: 0, mode: 'clean' };
  }

  const log = [];
  for (let round = 1; round <= MAX_ROUNDS; round++) {
    const win = extractWindow(current, check.line, WINDOW);
    log.push(
      'R' +
        round +
        ' errLine=' +
        (check.line || '?') +
        ' window=' +
        win.startLine +
        '-' +
        win.endLine
    );

    const ai = await aiFixWindow({
      path,
      errorMsg: check.error,
      line: check.line,
      windowText: win.text,
      startLine: win.startLine,
      endLine: win.endLine,
    });

    if (ai.ok) {
      current = spliceWindow(win.lines, win.startLine, win.endLine, ai.code);
      check = await nodeSyntaxCheck(current);
      if (check.ok) {
        return {
          ok: true,
          code: current,
          fixed: true,
          attempts: round,
          mode: 'surgical-' + ai.engine,
          log,
        };
      }
      continue;
    }

    // AI failed — try one heuristic on full file once
    const h = heuristicFix(current, check);
    if (h.ok) {
      const c2 = await nodeSyntaxCheck(h.code);
      if (c2.ok) {
        return {
          ok: true,
          code: h.code,
          fixed: true,
          attempts: round,
          mode: 'heuristic',
          note: h.note,
          log,
        };
      }
      current = h.code;
      check = c2;
      log.push('heuristic applied: ' + h.note);
      continue;
    }

    log.push('AI empty: ' + (ai.error || ''));
  }

  return {
    ok: false,
    error:
      'Surgical heal failed after ' +
      MAX_ROUNDS +
      ' rounds. Last: ' +
      String(check.error || '').slice(0, 300),
    attempts: MAX_ROUNDS,
    log,
    line: check.line,
  };
}

export default {
  nodeSyntaxCheck,
  healSourceBeforePush,
};
