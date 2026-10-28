/**
 * phaseADebug.js — V6000 Multi-file Surgeon (complete, syntax-verified)
 * /debug file|pending|apply|reject
 */
const PER_MS = 18000;
const PHASEC_CONFIRM = () =>
  String(process.env.PHASEC_CONFIRM || '1').trim() !== '0';

function trim(x, n = 180) {
  return String(x || '').slice(0, n);
}

async function fetchJson(url, options, timeoutMs = PER_MS) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: ctrl.signal });
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch (_) {
      json = { raw: text.slice(0, 200) };
    }
    return { ok: res.ok, status: res.status, json, text };
  } finally {
    clearTimeout(t);
  }
}

async function multiChat(prompt, opts = {}) {
  const system =
    opts.system ||
    'You are a precise JS code surgeon. Output only complete files in one js fence.';
  const maxTokens = opts.maxTokens || 6000;
  const temperature = opts.temperature ?? 0.1;
  const errors = [];

  // Groq
  try {
    const key = process.env.GROQ_API_KEY;
    if (key) {
      const models = [
        'llama-3.3-70b-versatile',
        'llama-3.1-8b-instant',
        'openai/gpt-oss-20b',
      ];
      for (const model of models) {
        const r = await fetchJson('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: 'Bearer ' + key,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model,
            temperature,
            max_tokens: maxTokens,
            messages: [
              { role: 'system', content: system },
              { role: 'user', content: prompt },
            ],
          }),
        }, 20000);
        const text =
          r.json?.choices?.[0]?.message?.content ||
          r.json?.choices?.[0]?.text ||
          '';
        if (r.ok && text && text.length > 20) {
          return { ok: true, text, engine: 'groq:' + model };
        }
        errors.push('groq:' + model + ':' + (r.json?.error?.message || r.status));
      }
    } else errors.push('groq:no-key');
  } catch (e) {
    errors.push('groq:' + (e.message || e));
  }

  // Gemini
  try {
    const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (key) {
      const models = ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-flash-latest'];
      for (const model of models) {
        const url =
          'https://generativelanguage.googleapis.com/v1beta/models/' +
          model +
          ':generateContent?key=' +
          encodeURIComponent(key);
        const r = await fetchJson(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: system + '\n\n' + prompt }] }],
            generationConfig: { temperature, maxOutputTokens: maxTokens },
          }),
        }, 20000);
        const text = r.json?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        if (r.ok && text && text.length > 20) {
          return { ok: true, text, engine: 'gemini:' + model };
        }
        errors.push('gemini:' + model + ':' + (r.json?.error?.message || r.status));
      }
    } else errors.push('gemini:no-key');
  } catch (e) {
    errors.push('gemini:' + (e.message || e));
  }

  // OpenRouter
  try {
    const key = process.env.OPENROUTER_API_KEY;
    if (key) {
      const models = [
        'meta-llama/llama-3.3-70b-instruct:free',
        'google/gemma-2-9b-it:free',
        'qwen/qwen-2.5-coder-32b-instruct:free',
      ];
      for (const model of models) {
        const r = await fetchJson('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: 'Bearer ' + key,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model,
            temperature,
            max_tokens: maxTokens,
            messages: [
              { role: 'system', content: system },
              { role: 'user', content: prompt },
            ],
          }),
        }, 20000);
        const text = r.json?.choices?.[0]?.message?.content || '';
        if (r.ok && text && text.length > 20) {
          return { ok: true, text, engine: 'openrouter:' + model };
        }
        errors.push('openrouter:' + model + ':' + (r.json?.error?.message || r.status));
      }
    } else errors.push('openrouter:no-key');
  } catch (e) {
    errors.push('openrouter:' + (e.message || e));
  }

  return { ok: false, error: 'All engines failed ' + errors.slice(0, 6).join(' | ') };
}

async function githubGetFile(path) {
  const repo = String(process.env.GITHUB_REPO || '').trim();
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
  if (!repo || !token) throw new Error('GITHUB_REPO / GITHUB_TOKEN missing');
  const [owner, name] = repo.split('/');
  const url =
    'https://api.github.com/repos/' +
    owner +
    '/' +
    name +
    '/contents/' +
    String(path).replace(/^\//, '');
  const r = await fetchJson(url, {
    headers: {
      Authorization: 'Bearer ' + token,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'PasiyaOS-Debug/6000',
    },
  });
  if (!r.ok) throw new Error(r.json?.message || 'GitHub ' + r.status);
  const content = Buffer.from(
    String(r.json.content || '').replace(/\n/g, ''),
    'base64'
  ).toString('utf8');
  return { path: r.json.path || path, sha: r.json.sha, content };
}

function balanceCheck(src) {
  const s = String(src || '');
  const count = (re) => (s.match(re) || []).length;
  const o = count(/\{/g);
  const c = count(/\}/g);
  if (o !== c) return 'unbalanced braces diff=' + (o - c);
  const po = count(/\(/g);
  const pc = count(/\)/g);
  if (po !== pc) return 'unbalanced parens diff=' + (po - pc);
  const bo = count(/\[/g);
  const bc = count(/\]/g);
  if (bo !== bc) return 'unbalanced brackets diff=' + (bo - bc);
  return '';
}

function semanticSanityCheck(src, instruction) {
  try {
    const s = String(src || '');
    const issues = [];
    if (/\brestParts\b/.test(s) && !/\.\.\.restParts\b/.test(s) && !/\brestParts\s*=/.test(s)) {
      issues.push('restParts used but not defined');
    }
    if (/await\s+rest\s*\(/.test(s) && /\.\.\.rest\b/.test(s)) {
      issues.push('rest shadowed — rename HTTP helper to sbRest');
    }
    const ins = String(instruction || '').toLowerCase();
    if (ins.includes('restparts') && !/restParts/.test(s)) {
      issues.push('instruction mentions restParts but patch ignores it');
    }
    return issues;
  } catch (_) {
    return [];
  }
}

function extractCode(text) {
  const t = String(text || '');
  const fence = t.match(/```(?:js|javascript)?\s*([\s\S]*?)```/i);
  if (fence) return fence[1].trim();
  if (t.includes('export ') || t.includes('function ') || t.includes('const ')) {
    return t.trim();
  }
  return '';
}

function tryPadClosers(src) {
  let s = String(src || '');
  const bal = balanceCheck(s);
  if (!bal) return s;
  const diff = (openRe, closeCh) =>
    (s.match(openRe) || []).length - (s.match(new RegExp('\\' + closeCh, 'g')) || []).length;
  const needBrace = diff(/\{/g, '}');
  const needParen = diff(/\(/g, ')');
  const needBracket = diff(/\[/g, ']');
  if (needBrace > 0 && needBrace < 20) s += '\n' + '}'.repeat(needBrace);
  if (needParen > 0 && needParen < 20) s += ')'.repeat(needParen);
  if (needBracket > 0 && needBracket < 20) s += ']'.repeat(needBracket);
  return s;
}

async function repairSyntaxLoop(code, path, instruction, maxTries = 2) {
  let cur = code;
  let lastErr = balanceCheck(cur);
  if (!lastErr) return cur;
  const padded = tryPadClosers(cur);
  if (padded && !balanceCheck(padded)) return padded;
  for (let i = 0; i < maxTries; i++) {
    const r = await multiChat(
      'Fix syntax only. Error: ' +
        lastErr +
        '\nPath: ' +
        path +
        '\nInstruction: ' +
        instruction +
        '\n\nFILE:\n' +
        cur,
      {
        system:
          'JS syntax fixer. Output the FULL file in one js fence. Count braces and parentheses. Never leave unclosed delimiters. No prose.',
        maxTokens: 8000,
        temperature: 0,
      }
    );
    if (!r.ok) break;
    const next = extractCode(r.text);
    if (!next || next.length < 50) break;
    cur = next;
    lastErr = balanceCheck(cur);
    if (!lastErr) return cur;
    const p2 = tryPadClosers(cur);
    if (p2 && !balanceCheck(p2)) return p2;
  }
  return cur;
}

export async function debugFile({ path, instruction, ownerId }) {
  try {
    let contextBlock = '';
    let file;
    try {
      const sc = await import('./surgeonContext.js');
      const build = sc.buildSurgeonContext || (sc.default && sc.default.buildSurgeonContext);
      if (typeof build === 'function') {
        const ctx = await build(path);
        file = ctx.target;
        contextBlock = ctx.contextBlock;
      } else {
        file = await githubGetFile(path);
        contextBlock =
          '=== TARGET FILE: ' + path + ' ===\n' + file.content + '\n=== END TARGET ===\n';
      }
    } catch (_) {
      file = await githubGetFile(path);
      contextBlock =
        '=== TARGET FILE: ' + path + ' ===\n' + file.content + '\n=== END TARGET ===\n';
    }
    if (!file || !file.content) {
      return { ok: false, error: 'Could not load ' + path };
    }

    const r = await multiChat(
      'INSTRUCTION:\n' + String(instruction || '') + '\n\n' + contextBlock,
      {
        system:
          'PasiyaOS V6000 MULTI-FILE SURGEON.\n' +
          'You receive TARGET file + RELATED import context (read-only).\n' +
          'Output ONLY the complete fixed TARGET file in one js fence.\n' +
          'Rules:\n' +
          '1) Full TARGET file only — never snippet, never rewrite RELATED files.\n' +
          '2) Every { ( [ must close. Count before finish.\n' +
          '3) Rename declaration AND all uses together.\n' +
          '4) Never leave undefined identifiers.\n' +
          '5) Surgical minimal change.\n' +
          '6) No prose outside the fence.',
        maxTokens: 8000,
        temperature: 0.1,
      }
    );
    if (!r.ok) return { ok: false, error: r.error || 'AI failed' };

    let code = extractCode(r.text);
    if (!code) return { ok: false, error: 'AI did not return a code block' };

    const sem =
      typeof semanticSanityCheck === 'function'
        ? semanticSanityCheck(code, instruction)
        : [];
    if (sem.length) {
      try {
        const fixPrompt =
          'Fix these semantic bugs and return FULL file:\n- ' +
          sem.join('\n- ') +
          '\n\nFILE:\n' +
          code;
        const r2 = await multiChat(fixPrompt, {
          system:
            'JS fixer. Full file in one fence. Define every identifier you use. Pair renames.',
          maxTokens: 8000,
          temperature: 0,
        });
        const c2 = extractCode(r2.text || '');
        if (c2 && c2.length > 50) code = c2;
      } catch (_) {}
    }

    let bal = balanceCheck(code);
    if (bal) {
      code = await repairSyntaxLoop(code, path, instruction, 2);
      bal = balanceCheck(code);
      if (bal) {
        return {
          ok: false,
          error: 'Validate fail: ' + bal + ' (repair loop exhausted)',
          preview: code.slice(0, 400),
        };
      }
    }

    // Queue or apply
    if (PHASEC_CONFIRM()) {
      try {
        const phaseC = await import('./phaseC.js');
        if (typeof phaseC.queuePatch === 'function') {
          const q = await phaseC.queuePatch({
            path,
            content: code,
            reason: String(instruction || '').slice(0, 200),
            ownerId,
          });
          return {
            ok: true,
            queued: true,
            id: q?.id,
            path,
            engine: r.engine,
            preview: code.slice(0, 1200),
            message:
              '⏸ Patch queued id=' +
              (q?.id || '?') +
              '\nPath: ' +
              path +
              '\n/debug apply ' +
              (q?.id || ''),
          };
        }
      } catch (_) {}
      // Fallback: insert into rq_pending_patches via REST
      const sbUrl = process.env.SUPABASE_URL;
      const key =
        process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
      if (sbUrl && key) {
        const row = {
          target_path: path,
          content: code,
          reason: String(instruction || '').slice(0, 200),
          status: 'pending',
        };
        const res = await fetch(
          sbUrl.replace(/\/$/, '') + '/rest/v1/rq_pending_patches',
          {
            method: 'POST',
            headers: {
              apikey: key,
              Authorization: 'Bearer ' + key,
              'Content-Type': 'application/json',
              Prefer: 'return=representation',
            },
            body: JSON.stringify(row),
          }
        );
        const j = await res.json().catch(() => ({}));
        if (!res.ok) {
          return {
            ok: false,
            error:
              'Pending insert failed: ' + (j.message || j.error || res.status),
          };
        }
        const rec = Array.isArray(j) ? j[0] : j;
        return {
          ok: true,
          queued: true,
          id: rec?.id,
          path,
          engine: r.engine,
          preview: code.slice(0, 1200),
          message:
            '⏸ Patch queued id=' +
            (rec?.id || '?') +
            '\nPath: ' +
            path +
            '\n/debug apply ' +
            (rec?.id || ''),
        };
      }
    }

    // Direct apply via gh upload helper
    try {
      const { githubPutFile } = await import('./ghUploadLite.js');
      const put = await githubPutFile({
        path,
        content: code,
        message: 'debug: ' + String(instruction).slice(0, 80),
      });
      return {
        ok: true,
        queued: false,
        path,
        commit: put.commit,
        engine: r.engine,
        message:
          '✅ Applied `' +
          path +
          '`' +
          (put.commit ? ' · ' + String(put.commit).slice(0, 7) : ''),
      };
    } catch (e) {
      return {
        ok: false,
        error: 'Apply failed: ' + (e.message || e),
        preview: code.slice(0, 400),
      };
    }
  } catch (e) {
    return {
      ok: false,
      error: 'debug engine: ' + String(e.message || e).slice(0, 280),
    };
  }
}

export async function applyPatch(id) {
  try {
    try {
      const phaseC = await import('./phaseC.js');
      const fn =
        typeof phaseC.confirmPatch === 'function'
          ? phaseC.confirmPatch
          : typeof phaseC.applyPending === 'function'
            ? phaseC.applyPending
            : null;
      if (fn) {
        const r = await fn(id);
        if (r && r.ok) return r;
        if (r && r.error && !/not found|missing/i.test(String(r.error))) {
          return r;
        }
      }
    } catch (_) {}

    const sbUrl = process.env.SUPABASE_URL;
    const key =
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
    if (!sbUrl || !key) return { ok: false, error: 'no supabase' };

    const res = await fetch(
      sbUrl.replace(/\/$/, '') +
        '/rest/v1/rq_pending_patches?id=eq.' +
        encodeURIComponent(id) +
        '&select=*',
      {
        headers: {
          apikey: key,
          Authorization: 'Bearer ' + key,
        },
      }
    );
    const rows = await res.json().catch(() => []);
    const rec = Array.isArray(rows) ? rows[0] : null;
    if (!rec) return { ok: false, error: 'patch not found: ' + id };

    const path = rec.target_path || rec.path || rec.file_path;
    const content = rec.content || rec.patch || '';
    if (!path || !content) {
      return { ok: false, error: 'patch missing path/content' };
    }

    const bal = balanceCheck(content);
    if (bal) {
      return {
        ok: false,
        error: 'Validate fail: ' + bal + ' — re-run /debug file instead of apply',
      };
    }

    const { githubPutFile } = await import('./ghUploadLite.js');
    const put = await githubPutFile({
      path,
      content,
      message: 'debug apply: ' + String(rec.reason || '').slice(0, 60),
    });

    await fetch(
      sbUrl.replace(/\/$/, '') +
        '/rest/v1/rq_pending_patches?id=eq.' +
        encodeURIComponent(id),
      {
        method: 'PATCH',
        headers: {
          apikey: key,
          Authorization: 'Bearer ' + key,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({
          status: 'applied',
          applied_at: new Date().toISOString(),
        }),
      }
    );

    return {
      ok: true,
      path,
      commit: put.commit,
      message:
        '✅ Applied ' +
        path +
        (put.commit ? ' · ' + String(put.commit).slice(0, 7) : ''),
    };
  } catch (e) {
    return {
      ok: false,
      error: 'apply crash: ' + (e.message || String(e)).slice(0, 240),
    };
  }
}

export async function rejectPatch(id) {
  try {
    try {
      const phaseC = await import('./phaseC.js');
      if (typeof phaseC.rejectPending === 'function') {
        return await phaseC.rejectPending(id);
      }
    } catch (_) {}
    const sbUrl = process.env.SUPABASE_URL;
    const key =
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
    if (!sbUrl || !key) return { ok: false, error: 'no supabase' };
    await fetch(
      sbUrl.replace(/\/$/, '') +
        '/rest/v1/rq_pending_patches?id=eq.' +
        encodeURIComponent(id),
      {
        method: 'PATCH',
        headers: {
          apikey: key,
          Authorization: 'Bearer ' + key,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({ status: 'rejected' }),
      }
    );
    return { ok: true, message: 'Rejected ' + id };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

export async function listPending() {
  try {
    try {
      const phaseC = await import('./phaseC.js');
      if (typeof phaseC.listPending === 'function') {
        return await phaseC.listPending();
      }
    } catch (_) {}
    const sbUrl = process.env.SUPABASE_URL;
    const key =
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
    if (!sbUrl || !key) return { ok: false, error: 'no supabase', rows: [] };
    const res = await fetch(
      sbUrl.replace(/\/$/, '') +
        '/rest/v1/rq_pending_patches?status=eq.pending&order=created_at.desc&limit=10&select=id,target_path,path,file_path,reason,status,created_at',
      {
        headers: {
          apikey: key,
          Authorization: 'Bearer ' + key,
        },
      }
    );
    const rows = await res.json().catch(() => []);
    return { ok: true, rows: Array.isArray(rows) ? rows : [] };
  } catch (e) {
    return { ok: false, error: e.message || String(e), rows: [] };
  }
}

export async function handlePhaseADebug({ text, ctx }) {
  const raw = String(text || '').trim();
  if (/^\/debug(?:@\w+)?\s*$/i.test(raw) || /^\/debug(?:@\w+)?\s+help$/i.test(raw)) {
    return (
      '⚔️ DEBUG SURGEON\n' +
      '/debug file <path> :: <instruction> [--local]\n' +
      '/debug pending | apply <id> | reject <id>\n\n' +
      'Always use --local for code repair on Hull A.'
    );
  }

  const apply = raw.match(/^\/debug(?:@\w+)?\s+apply\s+(\S+)/i);
  if (apply) {
    try {
      const r = await applyPatch(apply[1]);
      if (r && r.ok) return r.message || '✅ Applied';
      return '❌ apply: ' + ((r && r.error) || 'failed');
    } catch (e) {
      return '❌ apply: ' + (e.message || e);
    }
  }

  const reject = raw.match(/^\/debug(?:@\w+)?\s+reject\s+(\S+)/i);
  if (reject) {
    const r = await rejectPatch(reject[1]);
    return r.ok ? r.message || 'Rejected' : '❌ ' + (r.error || 'reject failed');
  }

  if (/^\/debug(?:@\w+)?\s+pending/i.test(raw)) {
    const r = await listPending();
    if (!r.ok) return 'debug: ' + (r.error || 'list failed');
    const rows = r.rows || [];
    if (!rows.length) return 'No pending patches.';
    return (
      '⏸ PENDING PATCHES\n' +
      rows
        .map((row, i) => {
          const p = row.target_path || row.path || row.file_path || '?';
          return i + 1 + '. ' + String(row.id).slice(0, 8) + ' · ' + p;
        })
        .join('\n') +
      '\n\n/debug apply <full-id>'
    );
  }

  const file = raw.match(
    /^\/debug(?:@\w+)?\s+file\s+(\S+)\s*::\s*([\s\S]+?)(?:\s+--local)?\s*$/i
  );
  if (file) {
    const path = file[1];
    const instruction = file[2].replace(/\s+--local\s*$/i, '').trim();
    const r = await debugFile({
      path,
      instruction,
      ownerId: ctx?.from?.id,
    });
    if (!r.ok) return '❌ ' + (r.error || 'debug failed');
    return r.message || '✅ Debug done · ' + path;
  }

  return 'Usage: /debug file lib/x.js :: instruction --local';
}

export default {
  handlePhaseADebug,
  debugFile,
  applyPatch,
  rejectPatch,
  listPending,
  multiChat,
};
