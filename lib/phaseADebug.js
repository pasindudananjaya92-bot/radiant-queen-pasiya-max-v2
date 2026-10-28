/**
 * phaseADebug.js — V6000-DEBUG-UUID-DOCTOR
 * Fixes:
 * 1) /debug file → real UUID from rq_pending_patches (never id=?)
 * 2) /debug doctor → HARDCODED only (never AI / never Linux essays)
 * 3) Multi-strategy apply + clearer errors
 *
 * Founder-only should be enforced by telegram router before calling handleDebug.
 */

'use strict';

const BUILD = 'V6000-DEBUG-UUID-DOCTOR';
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

/** Hardcoded doctor — NEVER call AI */
function doctorText() {
  const env = (k) => (process.env[k] ? 'YES' : 'NO');
  const lines = [
    `🩺 DEBUG DOCTOR · ${BUILD}`,
    '',
    `build: ${BUILD}`,
    `inline-semantic: YES`,
    `semanticSanityCheck: INLINE (no external fn)`,
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
    `  PHASEC_CONFIRM: ${process.env.PHASEC_CONFIRM || '0'}`,
    `  HULL_MODE: ${process.env.HULL_MODE || 'local'}`,
    '',
    'ROUTING',
    '  /debug doctor → hardcoded (no AI)',
    '  /debug file → queue rq_pending_patches + UUID',
    '  /debug apply <id> → apply queued patch',
    '  --local → Hull A only (never Hull B)',
    '',
    'If this block is replaced by a Linux/sysadmin essay, telegram.js is',
    'routing /debug to the general AI handler — fix route order.',
  ];
  return lines.join('\n');
}

function helpText() {
  return [
    `🔧 DEBUG · ${BUILD}`,
    '',
    '/debug doctor',
    '/debug help',
    '/debug pending',
    '/debug file <path> :: <instruction> [--local]',
    '/debug apply <uuid-or-prefix>',
    '/debug discard <uuid-or-prefix>',
    '',
    'Notes:',
    '· doctor is hardcoded (never AI)',
    '· file queues a patch and returns full UUID',
    '· apply uses exact queued body (no Prometheus)',
  ].join('\n');
}

/** Lightweight balance check (no external semanticSanityCheck) */
function inlineSemanticCheck(code) {
  const s = String(code || '');
  const issues = [];
  const pairs = [
    ['(', ')', 'parens'],
    ['{', '}', 'braces'],
    ['[', ']', 'brackets'],
  ];
  for (const [a, b, name] of pairs) {
    let d = 0;
    for (const ch of s) {
      if (ch === a) d++;
      if (ch === b) d--;
      if (d < 0) {
        issues.push(`unbalanced ${name}`);
        break;
      }
    }
    if (d > 0) issues.push(`unclosed ${name} (+${d})`);
  }
  if (/\bTODO_BROKEN\b/.test(s)) issues.push('TODO_BROKEN marker');
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
  if (!j.content) throw new Error('No content');
  const buf = Buffer.from(j.content.replace(/\n/g, ''), 'base64');
  return { text: buf.toString('utf8'), sha: j.sha, path: j.path || path };
}

async function ghPut(path, content, message, sha) {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO;
  if (!token || !repo) throw new Error('GITHUB_TOKEN or GITHUB_REPO missing');
  const url = `https://api.github.com/repos/${repo}/contents/${path.replace(/^\//, '')}`;
  const body = {
    message: message || `debug apply ${path}`,
    content: Buffer.from(content, 'utf8').toString('base64'),
    sha,
  };
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'User-Agent': 'PasiyaOS-Debug',
    },
    body: JSON.stringify(body),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.message || `GitHub PUT ${res.status}`);
  return j;
}

/**
 * Insert pending patch; always try to return UUID.
 * Column fallbacks: path | file_path | target_path
 */
async function queuePatch({ path, instruction, body, meta }) {
  const client = sb();
  if (!client) throw new Error('Supabase not configured');

  const row = {
    status: 'pending',
    instruction: String(instruction || '').slice(0, 4000),
    body: String(body || '').slice(0, MAX_PATCH_CHARS),
    meta: meta || {},
    created_at: new Date().toISOString(),
  };

  // Prefer path; also set aliases if columns exist (Supabase ignores unknown only if not strict — we try staged)
  const attempts = [
    { ...row, path },
    { ...row, file_path: path, path },
    { ...row, target_path: path, path },
  ];

  let lastErr = null;
  for (const payload of attempts) {
    try {
      const { data, error } = await client
        .from('rq_pending_patches')
        .insert(payload)
        .select('id')
        .single();
      if (error) {
        lastErr = error;
        // column errors → try next shape
        if (/column|schema|Could not find/i.test(error.message || '')) continue;
        throw error;
      }
      const id = data && data.id;
      if (id) return String(id);
      lastErr = new Error('insert ok but id missing');
    } catch (e) {
      lastErr = e;
      if (/column|schema|Could not find/i.test(String(e.message || e))) continue;
      throw e;
    }
  }

  // Last resort: insert without select, then read latest pending for path
  const { error: insErr } = await client.from('rq_pending_patches').insert({
    ...row,
    path,
  });
  if (insErr) throw insErr;

  const { data: listed, error: listErr } = await client
    .from('rq_pending_patches')
    .select('id, path, file_path, target_path, created_at')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(5);
  if (listErr) throw listErr;
  const hit = (listed || []).find(
    (r) => r.path === path || r.file_path === path || r.target_path === path
  );
  if (hit && hit.id) return String(hit.id);
  throw lastErr || new Error('Could not obtain patch id');
}

async function listPending(limit = 10) {
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

  // Full UUID
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(q)) {
    const { data, error } = await client.from('rq_pending_patches').select('*').eq('id', q).maybeSingle();
    if (error) throw error;
    return data;
  }

  // Prefix (8+) via text cast
  const { data, error } = await client
    .from('rq_pending_patches')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(30);
  if (error) throw error;
  const lower = q.toLowerCase();
  return (data || []).find((r) => String(r.id).toLowerCase().startsWith(lower)) || null;
}

async function markStatus(id, status, extra = {}) {
  const client = sb();
  if (!client) throw new Error('Supabase not configured');
  const { error } = await client
    .from('rq_pending_patches')
    .update({ status, ...extra, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

/** Simple AI patch via Groq (optional; used only for /debug file generation) */
async function generatePatchWithAI(path, source, instruction) {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error('GROQ_API_KEY missing');

  const models = [
    process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
    'llama-3.1-8b-instant',
    'openai/gpt-oss-20b',
  ];

  const system = [
    'You are a surgical code patcher for a Telegram bot monorepo.',
    'Return ONLY the full updated file source code.',
    'No markdown fences. No explanation.',
    'Keep parentheses/braces/brackets balanced.',
    'Do not truncate. Preserve existing logic unless instruction requires change.',
  ].join(' ');

  const user = [
    `FILE: ${path}`,
    `INSTRUCTION: ${instruction}`,
    '---SOURCE---',
    source.slice(0, 120000),
    '---END---',
    'Return the complete fixed file only.',
  ].join('\n');

  let lastErr = null;
  for (const model of models) {
    try {
      const ac = new AbortController();
      const t = setTimeout(() => ac.abort(), 22000);
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        signal: ac.signal,
        headers: {
          Authorization: `Bearer ${key}`,
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
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        lastErr = new Error(j.error?.message || `Groq ${res.status}`);
        continue;
      }
      let text = j.choices?.[0]?.message?.content || '';
      text = text.replace(/^```(?:javascript|js|ts)?\n?/i, '').replace(/\n?```$/i, '').trim();
      if (!text || text.length < 20) {
        lastErr = new Error('AI returned empty');
        continue;
      }
      const sem = inlineSemanticCheck(text);
      if (!sem.ok) {
        lastErr = new Error(`Validate fail: ${sem.issues.join(', ')}`);
        continue;
      }
      return { text, model };
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('All engines failed');
}

/**
 * Main entry — returns { handled: true, text } or { handled: false }
 * CRITICAL: doctor/help/pending/apply never fall through to AI chat.
 */
async function handleDebug(ctx, rawText) {
  const text = String(rawText || ctx?.message?.text || '').trim();
  if (!/^\/debug\b/i.test(text)) return { handled: false };

  const without = text.replace(/^\/debug\b/i, '').trim();
  const low = without.toLowerCase();

  // ——— doctor (HARDCODED) ———
  if (!without || low === 'doctor' || low.startsWith('doctor ')) {
    return { handled: true, text: doctorText() };
  }

  // ——— help ———
  if (low === 'help' || low === '?' || low === 'menu') {
    return { handled: true, text: helpText() };
  }

  // ——— pending ———
  if (low === 'pending' || low.startsWith('pending ')) {
    try {
      const rows = await listPending(15);
      if (!rows.length) return { handled: true, text: 'No pending patches.' };
      const lines = rows.map((r, i) => {
        const p = r.path || r.file_path || r.target_path || '?';
        const id = r.id || '?';
        const ins = (r.instruction || '').slice(0, 80);
        return `${i + 1}. ${id}\n   ${p}\n   ${ins}`;
      });
      return { handled: true, text: `⏸ PENDING PATCHES (${rows.length})\n\n${lines.join('\n\n')}` };
    } catch (e) {
      return { handled: true, text: `debug pending: ${e.message || e}` };
    }
  }

  // ——— apply ———
  if (low.startsWith('apply ')) {
    const idPart = without.slice(6).trim().split(/\s+/)[0];
    try {
      const row = await resolvePatch(idPart);
      if (!row) return { handled: true, text: `No pending patch matching: ${idPart}` };
      const path = row.path || row.file_path || row.target_path;
      if (!path) return { handled: true, text: 'Patch row missing path' };
      if (!row.body) return { handled: true, text: 'Patch body empty' };

      const sem = inlineSemanticCheck(row.body);
      if (!sem.ok) {
        return {
          handled: true,
          text: `❌ Refusing apply — body failed check: ${sem.issues.join(', ')}`,
        };
      }

      const cur = await ghGet(path);
      const put = await ghPut(path, row.body, `debug apply ${path} (${String(row.id).slice(0, 8)})`, cur.sha);
      await markStatus(row.id, 'applied', { applied_at: new Date().toISOString() });
      const sha = put?.content?.sha || put?.commit?.sha || 'ok';
      return {
        handled: true,
        text: `✅ Applied ${path}\n id: ${row.id}\n sha: ${sha}`,
      };
    } catch (e) {
      return { handled: true, text: `debug apply: ${e.message || e}` };
    }
  }

  // ——— discard ———
  if (low.startsWith('discard ') || low.startsWith('drop ')) {
    const idPart = without.split(/\s+/).slice(1).join(' ').trim().split(/\s+/)[0];
    try {
      const row = await resolvePatch(idPart);
      if (!row) return { handled: true, text: `No patch matching: ${idPart}` };
      await markStatus(row.id, 'discarded');
      return { handled: true, text: `🗑 Discarded ${row.id}` };
    } catch (e) {
      return { handled: true, text: `debug discard: ${e.message || e}` };
    }
  }

  // ——— file path :: instruction ———
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
      if (!path) return { handled: true, text: 'Usage: /debug file <path> :: <instruction> [--local]' };
      if (!instruction) instruction = 'Improve clarity; keep behavior identical.';

      const cur = await ghGet(path);
      const gen = await generatePatchWithAI(path, cur.text, instruction);
      const id = await queuePatch({
        path,
        instruction,
        body: gen.text,
        meta: { model: gen.model, build: BUILD, source_sha: cur.sha },
      });

      return {
        handled: true,
        text: [
          '⏸ Patch queued',
          `id: ${id}`,
          `path: ${path}`,
          `model: ${gen.model}`,
          `bytes: ${gen.text.length}`,
          '',
          `Apply: /debug apply ${id}`,
          `Or prefix: /debug apply ${String(id).slice(0, 8)}`,
        ].join('\n'),
      };
    } catch (e) {
      return { handled: true, text: `debug file: ${e.message || e}` };
    }
  }

  return { handled: true, text: helpText() };
}

/** Sync-style doctor for routers that only need a string */
function getDoctorReport() {
  return doctorText();
}

module.exports = {
  BUILD,
  handleDebug,
  getDoctorReport,
  doctorText,
  helpText,
  inlineSemanticCheck,
  queuePatch,
  listPending,
  resolvePatch,
};
