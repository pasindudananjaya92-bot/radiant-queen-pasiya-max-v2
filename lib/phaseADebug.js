/**
 * phaseADebug.js — V6000-WIRED-DOCTOR
 * - handlePhaseADebug({ text, ctx }) → string (telegram.js contract)
 * - /debug doctor → HARDCODED only
 * - /debug file simple "add comment" → surgical (no AI, no paren risk)
 * - complex file edits → Groq models (2026 active ids) + validate
 */

'use strict';

const BUILD = 'V6000-WIRED-DOCTOR';
const MAX_PATCH_CHARS = 180000;

function sb() {
  try {
    const { createClient } = require('@supabase/supabase-js');
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
    if (!url || !key) return null;
    return createClient(url, key, { auth: { persistSession: false } });
  } catch {
    return null;
  }
}

function stripLocal(s) {
  return String(s || '')
    .replace(/\s+--local\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function doctorText() {
  const env = (k) => (process.env[k] ? 'YES' : 'NO');
  return [
    `🩺 DEBUG DOCTOR · ${BUILD}`,
    '',
    `build: ${BUILD}`,
    `inline-semantic: YES`,
    `semanticSanityCheck: INLINE`,
    `wired: telegram.js exclusive /debug gate`,
    '',
    'ENV',
    `  BOT_TOKEN: ${env('BOT_TOKEN')}`,
    `  ADMIN_ID: ${env('ADMIN_ID')}`,
    `  SUPABASE_URL: ${env('SUPABASE_URL')}`,
    `  SUPABASE_SERVICE_ROLE_KEY: ${env('SUPABASE_SERVICE_ROLE_KEY') || env('SUPABASE_KEY') ? 'YES' : 'NO'}`,
    `  GITHUB_TOKEN: ${env('GITHUB_TOKEN')}`,
    `  GITHUB_REPO: ${process.env.GITHUB_REPO || '—'}`,
    `  GROQ_API_KEY: ${env('GROQ_API_KEY')}`,
    `  GEMINI_API_KEY: ${env('GEMINI_API_KEY')}`,
    `  OPENROUTER_API_KEY: ${env('OPENROUTER_API_KEY')}`,
    `  HULL_MODE: ${process.env.HULL_MODE || 'local'}`,
    '',
    'If you still see an AI diagnosis prompt, redeploy failed or old telegram.js is live.',
  ].join('\n');
}

function helpText() {
  return [
    `🔧 DEBUG · ${BUILD}`,
    '',
    '/debug doctor',
    '/debug help',
    '/debug pending',
    '/debug file <path> :: <instruction> [--local]',
    '/debug apply <uuid>',
    '/debug discard <uuid>',
    '',
    'Simple instructions like "add comment X" use surgical mode (no AI).',
  ].join('\n');
}

function balanceCheck(code) {
  const s = String(code || '');
  const issues = [];
  for (const [a, b, name] of [
    ['(', ')', 'parens'],
    ['{', '}', 'braces'],
    ['[', ']', 'brackets'],
  ]) {
    let d = 0;
    let inS = null;
    let esc = false;
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (inS) {
        if (esc) {
          esc = false;
          continue;
        }
        if (ch === '\\') {
          esc = true;
          continue;
        }
        if (ch === inS) inS = null;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === '`') {
        inS = ch;
        continue;
      }
      if (ch === a) d++;
      if (ch === b) d--;
      if (d < 0) {
        issues.push(`unbalanced ${name}`);
        break;
      }
    }
    if (d > 0) issues.push(`unclosed ${name} (+${d})`);
  }
  return { ok: issues.length === 0, issues };
}

async function ghGet(path) {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO;
  if (!token || !repo) throw new Error('GITHUB_TOKEN or GITHUB_REPO missing');
  const url = `https://api.github.com/repos/${repo}/contents/${path.replace(/^\//, '')}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'PasiyaOS-Debug',
    },
  });
  if (!res.ok) throw new Error(`GitHub GET ${path}: ${res.status}`);
  const j = await res.json();
  const buf = Buffer.from(String(j.content || '').replace(/\n/g, ''), 'base64');
  return { text: buf.toString('utf8'), sha: j.sha, path: j.path || path };
}

async function ghPut(path, content, message, sha) {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO;
  if (!token || !repo) throw new Error('GITHUB_TOKEN or GITHUB_REPO missing');
  const url = `https://api.github.com/repos/${repo}/contents/${path.replace(/^\//, '')}`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'User-Agent': 'PasiyaOS-Debug',
    },
    body: JSON.stringify({
      message: message || `debug apply ${path}`,
      content: Buffer.from(content, 'utf8').toString('base64'),
      sha,
    }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.message || `GitHub PUT ${res.status}`);
  return j;
}

/** Surgical: add a one-line comment near top — no AI */
function surgicalAddComment(source, instruction) {
  const m =
    instruction.match(/add\s+comment\s+(.+)$/i) ||
    instruction.match(/comment\s*[:\-]\s*(.+)$/i) ||
    instruction.match(/add\s+(.+)$/i);
  const note = (m ? m[1] : instruction).replace(/\s+/g, ' ').trim().slice(0, 120);
  const line = `/* ${note} */\n`;
  // After shebang / 'use strict' / leading comments block
  const lines = source.split('\n');
  let insertAt = 0;
  for (let i = 0; i < Math.min(lines.length, 30); i++) {
    const L = lines[i];
    if (i === 0 && L.startsWith('#!')) {
      insertAt = 1;
      continue;
    }
    if (/^['"]use strict['"]\s*;?\s*$/.test(L.trim())) {
      insertAt = i + 1;
      continue;
    }
    if (/^\s*\/\//.test(L) || /^\s*\/\*/.test(L) || /^\s*\*/.test(L)) {
      insertAt = i + 1;
      continue;
    }
    break;
  }
  const next = lines.slice();
  next.splice(insertAt, 0, line.replace(/\n$/, ''));
  return next.join('\n');
}

function isSurgicalInstruction(instruction) {
  const s = String(instruction || '').toLowerCase();
  if (/add\s+comment/.test(s)) return true;
  if (/^comment\b/.test(s) && s.length < 160) return true;
  if (/seal-test|v6000-seal/.test(s) && /comment/.test(s)) return true;
  return false;
}

async function queuePatch({ path, instruction, body, meta }) {
  const client = sb();
  if (!client) throw new Error('Supabase not configured');

  const base = {
    status: 'pending',
    instruction: String(instruction || '').slice(0, 4000),
    body: String(body || '').slice(0, MAX_PATCH_CHARS),
    meta: meta || {},
    created_at: new Date().toISOString(),
    path,
  };

  const shapes = [base, { ...base, file_path: path }, { ...base, target_path: path }];
  let lastErr = null;
  for (const payload of shapes) {
    const { data, error } = await client.from('rq_pending_patches').insert(payload).select('id').single();
    if (error) {
      lastErr = error;
      if (/column|schema|Could not find/i.test(error.message || '')) continue;
      throw error;
    }
    if (data?.id) return String(data.id);
  }

  const { error: insErr } = await client.from('rq_pending_patches').insert(base);
  if (insErr) throw insErr;
  const { data: listed, error: listErr } = await client
    .from('rq_pending_patches')
    .select('id, path, created_at')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(5);
  if (listErr) throw listErr;
  const hit = (listed || []).find((r) => r.path === path);
  if (hit?.id) return String(hit.id);
  throw lastErr || new Error('Could not obtain patch id');
}

async function listPending(limit = 12) {
  const client = sb();
  if (!client) throw new Error('Supabase not configured');
  const { data, error } = await client
    .from('rq_pending_patches')
    .select('id, path, file_path, target_path, status, instruction, created_at')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

async function resolvePatch(idOrPrefix) {
  const client = sb();
  if (!client) throw new Error('Supabase not configured');
  const q = String(idOrPrefix || '').trim();
  if (!q) return null;
  if (/^[0-9a-f-]{36}$/i.test(q)) {
    const { data, error } = await client.from('rq_pending_patches').select('*').eq('id', q).maybeSingle();
    if (error) throw error;
    return data;
  }
  const { data, error } = await client
    .from('rq_pending_patches')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(40);
  if (error) throw error;
  const lower = q.toLowerCase();
  return (data || []).find((r) => String(r.id).toLowerCase().startsWith(lower)) || null;
}

async function markStatus(id, status) {
  const client = sb();
  if (!client) throw new Error('Supabase not configured');
  const { error } = await client
    .from('rq_pending_patches')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

/** Active Groq model ids (Oct 2026) */
async function generatePatchWithAI(path, source, instruction) {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error('GROQ_API_KEY missing');

  const models = [
    'openai/gpt-oss-20b',
    'openai/gpt-oss-120b',
    process.env.GROQ_MODEL,
    'qwen/qwen3.8-27b',
  ].filter(Boolean);

  const system = [
    'You output ONLY complete valid JavaScript source for one file.',
    'No markdown. No fences. No commentary.',
    'Every ( { [ must be closed. Do not truncate.',
    'Minimal change for the instruction. Preserve all existing logic.',
  ].join(' ');

  // Prefer smaller context for balance
  const src = source.length > 60000 ? source.slice(0, 60000) : source;
  const user = `FILE: ${path}\nINSTRUCTION: ${instruction}\n---\n${src}\n---\nReturn the full file only.`;

  let lastErr = null;
  for (const model of models) {
    try {
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), 25000);
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        signal: ac.signal,
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          temperature: 0,
          max_tokens: 8192,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
        }),
      });
      clearTimeout(timer);
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        lastErr = new Error(j.error?.message || `Groq ${res.status} ${model}`);
        continue;
      }
      let text = j.choices?.[0]?.message?.content || '';
      text = text.replace(/^```(?:javascript|js)?\n?/i, '').replace(/\n?```$/i, '').trim();
      if (!text || text.length < 20) {
        lastErr = new Error('AI returned empty');
        continue;
      }
      const bal = balanceCheck(text);
      if (!bal.ok) {
        lastErr = new Error(`Validate fail: ${bal.issues.join(', ')}`);
        continue;
      }
      return { text, model, mode: 'ai' };
    } catch (e) {
      lastErr = e.name === 'AbortError' ? new Error('AI timeout') : e;
    }
  }
  throw lastErr || new Error('All engines failed');
}

/**
 * telegram.js contract: return message string or null
 */
async function handlePhaseADebug({ text, ctx } = {}) {
  const raw = String(text || ctx?.message?.text || '').trim();
  if (!/^\/debug\b/i.test(raw)) return null;

  const without = raw.replace(/^\/debug(?:@\w+)?\s*/i, '').trim();
  const low = without.toLowerCase();

  if (!without || low === 'doctor' || low.startsWith('doctor ')) {
    return doctorText();
  }
  if (low === 'help' || low === '?' || low === 'menu') {
    return helpText();
  }

  if (low === 'pending' || low.startsWith('pending ')) {
    try {
      const rows = await listPending(15);
      if (!rows.length) return 'No pending patches.';
      return (
        `⏸ PENDING (${rows.length})\n\n` +
        rows
          .map((r, i) => {
            const p = r.path || r.file_path || r.target_path || '?';
            return `${i + 1}. ${r.id}\n   ${p}\n   ${(r.instruction || '').slice(0, 80)}`;
          })
          .join('\n\n')
      );
    } catch (e) {
      return `debug pending: ${e.message || e}`;
    }
  }

  if (low.startsWith('apply ')) {
    const idPart = without.slice(6).trim().split(/\s+/)[0];
    try {
      const row = await resolvePatch(idPart);
      if (!row) return `No pending patch matching: ${idPart}`;
      const path = row.path || row.file_path || row.target_path;
      if (!path || !row.body) return 'Patch missing path/body';
      const bal = balanceCheck(row.body);
      if (!bal.ok) return `❌ Refusing apply: ${bal.issues.join(', ')}`;
      const cur = await ghGet(path);
      const put = await ghPut(path, row.body, `debug apply ${path}`, cur.sha);
      await markStatus(row.id, 'applied');
      const sha = put?.content?.sha || put?.commit?.sha || 'ok';
      return `✅ Applied ${path}\nid: ${row.id}\nsha: ${sha}`;
    } catch (e) {
      return `debug apply: ${e.message || e}`;
    }
  }

  if (low.startsWith('discard ') || low.startsWith('drop ') || low.startsWith('reject ')) {
    const idPart = without.split(/\s+/).slice(1)[0];
    try {
      const row = await resolvePatch(idPart);
      if (!row) return `No patch matching: ${idPart}`;
      await markStatus(row.id, 'discarded');
      return `🗑 Discarded ${row.id}`;
    } catch (e) {
      return `debug discard: ${e.message || e}`;
    }
  }

  if (low.startsWith('file ')) {
    try {
      let rest = stripLocal(without.slice(5));
      let path = '';
      let instruction = '';
      if (rest.includes('::')) {
        const idx = rest.indexOf('::');
        path = rest.slice(0, idx).trim();
        instruction = rest.slice(idx + 2).trim();
      } else {
        const parts = rest.split(/\s+/);
        path = parts.shift() || '';
        instruction = parts.join(' ').trim();
      }
      if (!path) return 'Usage: /debug file <path> :: <instruction> [--local]';
      if (!instruction) instruction = 'add comment debug touch';

      const cur = await ghGet(path);
      let body;
      let model = 'surgical';
      let mode = 'surgical';

      if (isSurgicalInstruction(instruction)) {
        body = surgicalAddComment(cur.text, instruction);
        const bal = balanceCheck(body);
        if (!bal.ok) throw new Error(`Surgical validate fail: ${bal.issues.join(', ')}`);
      } else {
        const gen = await generatePatchWithAI(path, cur.text, instruction);
        body = gen.text;
        model = gen.model;
        mode = 'ai';
      }

      const id = await queuePatch({
        path,
        instruction,
        body,
        meta: { model, mode, build: BUILD, source_sha: cur.sha },
      });

      return [
        '⏸ Patch queued',
        `id: ${id}`,
        `path: ${path}`,
        `mode: ${mode}`,
        `model: ${model}`,
        `bytes: ${body.length}`,
        '',
        `Apply: /debug apply ${id}`,
        `Prefix: /debug apply ${String(id).slice(0, 8)}`,
      ].join('\n');
    } catch (e) {
      return `debug file: ${e.message || e}`;
    }
  }

  return helpText();
}

/** Alias used by some routers */
async function handleDebug(ctxOrOpts, maybeText) {
  if (ctxOrOpts && typeof ctxOrOpts === 'object' && (ctxOrOpts.text || ctxOrOpts.ctx || ctxOrOpts.message)) {
    if (ctxOrOpts.text || ctxOrOpts.ctx) {
      const msg = await handlePhaseADebug(ctxOrOpts);
      return msg ? { handled: true, text: msg } : { handled: false };
    }
    const msg = await handlePhaseADebug({ text: maybeText, ctx: ctxOrOpts });
    return msg ? { handled: true, text: msg } : { handled: false };
  }
  const msg = await handlePhaseADebug({ text: String(ctxOrOpts || maybeText || '') });
  return msg ? { handled: true, text: msg } : { handled: false };
}

module.exports = {
  BUILD,
  handlePhaseADebug,
  handleDebug,
  doctorText,
  helpText,
  balanceCheck,
};
