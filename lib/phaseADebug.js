/**
 * v5000 Phase A2 — live models (Oct 2026)
 * Groq free: openai/gpt-oss-20b, openai/gpt-oss-120b, qwen/qwen3.8-27b
 * Gemini: gemini-3.8-flash, gemini-3.6-flash, gemini-3.5-flash-lite
 * Schema: file_path + content_b64 (phaseC)
 */
const ADMIN = () =>
  String(process.env.ADMIN_ID || process.env.FOUNDER_ID || '').trim();
const PER_MS = 22000;

function trim(x, n = 180) {
  return String(x || '').replace(/\s+/g, ' ').slice(0, n);
}

async function fetchJson(url, options, timeoutMs = PER_MS) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: ctrl.signal });
    const text = await res.text();
    let json = {};
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = { raw: text.slice(0, 200) };
    }
    return { res, json, text };
  } finally {
    clearTimeout(t);
  }
}

async function multiChat(prompt, opts = {}) {
  const system =
    opts.system ||
    'PasiyaOS Repo Surgeon. Output only full file in one js code fence.';
  const maxTokens = opts.maxTokens || 4000;
  const tried = [];

  try {
    const mod = await import('./powerhouse.js');
    const fn = mod.powerChat || mod.default?.powerChat;
    if (fn) {
      const r = await fn(prompt, {
        system,
        maxTokens,
        temperature: opts.temperature ?? 0.1,
      });
      if (r?.ok && r.text)
        return {
          ok: true,
          text: r.text,
          engine: r.engine || 'powerhouse',
          tried: r.tried || tried,
        };
      tried.push('powerhouse:' + trim(r?.error || 'empty'));
    } else tried.push('powerhouse:no-fn');
  } catch (e) {
    tried.push('powerhouse:' + trim(e.message || e));
  }

  const groqKey = process.env.GROQ_API_KEY || process.env.GROQ_KEY;
  if (groqKey) {
    for (const model of [
      'openai/gpt-oss-20b',
      'openai/gpt-oss-120b',
      'qwen/qwen3.8-27b',
    ]) {
      try {
        const { res, json } = await fetchJson(
          'https://api.groq.com/openai/v1/chat/completions',
          {
            method: 'POST',
            headers: {
              Authorization: 'Bearer ' + groqKey,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model,
              temperature: 0.1,
              max_tokens: Math.min(maxTokens, 6000),
              messages: [
                { role: 'system', content: system },
                { role: 'user', content: prompt },
              ],
            }),
          },
          PER_MS
        );
        const t = json?.choices?.[0]?.message?.content || '';
        if (res.ok && t.trim()) {
          return { ok: true, text: t.trim(), engine: 'groq', model, tried };
        }
        tried.push(
          'groq@' + model + ':' + trim(json?.error?.message || res.status)
        );
      } catch (e) {
        tried.push('groq@' + model + ':' + trim(e.message || e));
      }
    }
  } else tried.push('groq:no-key');

  const gemKey =
    process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
  if (gemKey) {
    for (const model of [
      'gemini-3.8-flash',
      'gemini-3.6-flash',
      'gemini-3.5-flash-lite',
    ]) {
      try {
        const url =
          'https://generativelanguage.googleapis.com/v1beta/models/' +
          encodeURIComponent(model) +
          ':generateContent?key=' +
          encodeURIComponent(gemKey);
        const { res, json } = await fetchJson(
          url,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [
                {
                  role: 'user',
                  parts: [{ text: system + '\n\n' + prompt }],
                },
              ],
              generationConfig: {
                temperature: 0.1,
                maxOutputTokens: Math.min(maxTokens, 6000),
              },
            }),
          },
          PER_MS
        );
        const t =
          json?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') ||
          '';
        if (res.ok && t.trim()) {
          return { ok: true, text: t.trim(), engine: 'gemini', model, tried };
        }
        tried.push(
          'gemini@' + model + ':' + trim(json?.error?.message || res.status)
        );
      } catch (e) {
        tried.push('gemini@' + model + ':' + trim(e.message || e));
      }
    }
  } else tried.push('gemini:no-key');

  // OpenRouter free fallback
  const orKey = process.env.OPENROUTER_API_KEY;
  if (orKey) {
    for (const model of [
      'openrouter/free',
      'qwen/qwen-2.5-coder-32b-instruct:free',
      'meta-llama/llama-3.3-8b-instruct:free',
    ]) {
      try {
        const { res, json } = await fetchJson(
          'https://openrouter.ai/api/v1/chat/completions',
          {
            method: 'POST',
            headers: {
              Authorization: 'Bearer ' + orKey,
              'Content-Type': 'application/json',
              'HTTP-Referer': 'https://pasiyaos.local',
              'X-Title': 'PasiyaOS',
            },
            body: JSON.stringify({
              model,
              temperature: 0.1,
              max_tokens: Math.min(maxTokens, 4000),
              messages: [
                { role: 'system', content: system },
                { role: 'user', content: prompt },
              ],
            }),
          },
          PER_MS
        );
        const t = json?.choices?.[0]?.message?.content || '';
        if (res.ok && t.trim()) {
          return {
            ok: true,
            text: t.trim(),
            engine: 'openrouter',
            model,
            tried,
          };
        }
        tried.push(
          'or@' + model + ':' + trim(json?.error?.message || res.status)
        );
      } catch (e) {
        tried.push('or@' + model + ':' + trim(e.message || e));
      }
    }
  } else tried.push('openrouter:no-key');

  return {
    ok: false,
    error: 'All engines failed · ' + tried.slice(0, 10).join(' | '),
    tried,
  };
}

async function githubGetFile(path) {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO;
  if (!token || !repo) throw new Error('GITHUB_TOKEN + GITHUB_REPO required');
  const api =
    'https://api.github.com/repos/' +
    repo +
    '/contents/' +
    String(path).replace(/^\/+/, '');
  const res = await fetch(api, {
    headers: {
      Authorization: 'Bearer ' + token,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'pasiyaOS-bot',
    },
  });
  if (res.status === 404) throw new Error('File not found on GitHub: ' + path);
  const j = await res.json();
  if (!res.ok) throw new Error(j.message || 'GitHub GET failed');
  return {
    content: Buffer.from(j.content || '', 'base64').toString('utf8'),
    sha: j.sha,
    path,
  };
}

function balanceCheck(src) {
  const s = String(src || '');
  const o = (s.match(/\{/g) || []).length;
  const c = (s.match(/\}/g) || []).length;
  if (o !== c) return 'unbalanced braces diff=' + (o - c);
  const po = (s.match(/\(/g) || []).length;
  const pc = (s.match(/\)/g) || []).length;
  if (po !== pc) return 'unbalanced parens diff=' + (po - pc);
  const bo = (s.match(/\[/g) || []).length;
  const bc = (s.match(/\]/g) || []).length;
  if (bo !== bc) return 'unbalanced brackets diff=' + (bo - bc);
  return null;
}

function extractCode(text) {
  const m = String(text || '').match(/```(?:javascript|js)?\n([\s\S]*?)```/i);
  if (m) return m[1].trim();
  const t = String(text || '').trim();
  if (t.includes('export ') || t.includes('function ') || t.includes('const '))
    return t;
  return null;
}


function tryPadClosers(src) {
  let s = String(src || '');
  const stack = [];
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '{' || ch === '(' || ch === '[') stack.push(ch);
    else if (ch === '}' || ch === ')' || ch === ']') {
      const open = stack.pop();
      if (!open) return null;
      const ok =
        (open === '{' && ch === '}') ||
        (open === '(' && ch === ')') ||
        (open === '[' && ch === ']');
      if (!ok) return null;
    }
  }
  if (!stack.length) return s;
  if (stack.length > 12) return null;
  const map = { '{': '}', '(': ')', '[': ']' };
  return s + '\n' + stack.reverse().map((c) => map[c]).join('');
}

async function repairSyntaxLoop(code, path, instruction, maxTries = 2) {
  let cur = code;
  let lastErr = balanceCheck(cur);
  if (!lastErr) return { ok: true, code: cur, repaired: false };
  const padded = tryPadClosers(cur);
  if (padded && !balanceCheck(padded)) {
    return { ok: true, code: padded, repaired: true, method: 'pad' };
  }
  for (let i = 0; i < maxTries; i++) {
    const r = await multiChat(
      'FILE: ' +
        path +
        '\nERROR: ' +
        lastErr +
        '\nINSTRUCTION was: ' +
        instruction +
        '\n\nBROKEN SOURCE:\n```js\n' +
        cur.slice(0, 14000) +
        '\n```\n\nFix ONLY syntax (braces/parens/brackets). Return COMPLETE file in one ```js block. Do not truncate.',
      {
        system:
          'JS syntax fixer. Output the FULL file in one js fence. Count braces and parentheses. Never leave unclosed delimiters. No prose.',
        maxTokens: 5000,
        temperature: 0,
      }
    );
    if (!r.ok) {
      lastErr = r.error || lastErr;
      continue;
    }
    const next = extractCode(r.text);
    if (!next) {
      lastErr = 'repair: no code block';
      continue;
    }
    const err = balanceCheck(next);
    if (!err) {
      return {
        ok: true,
        code: next,
        repaired: true,
        method: 'ai-' + (i + 1),
        engine: r.engine,
      };
    }
    const p2 = tryPadClosers(next);
    if (p2 && !balanceCheck(p2)) {
      return {
        ok: true,
        code: p2,
        repaired: true,
        method: 'ai-pad-' + (i + 1),
        engine: r.engine,
      };
    }
    cur = next;
    lastErr = err;
  }
  return { ok: false, error: lastErr, code: cur };
}


export async function debugFile({ path, instruction, ownerId }) {
  const file = await githubGetFile(path);
  const src = file.content.slice(0, 12000);
  const r = await multiChat(
    'FILE: ' +
      path +
      '\n\nINSTRUCTION:\n' +
      instruction +
      '\n\nCURRENT SOURCE (may be truncated):\n' +
      src +
      '\n\nReturn the COMPLETE fixed file inside one ```js code block. No prose. Balanced braces/parens.',
    {
      system:
        'PasiyaOS Repo Surgeon GOD-TIER.\n' +
        'Output ONLY the complete fixed file inside one js/javascript markdown fence.\n' +
        'Rules:\n' +
        '1) Return the FULL file — never a snippet.\n' +
        '2) Every { ( [ must have a matching closer. Count before finishing.\n' +
        '3) When renaming a variable, rename the DECLARATION and ALL uses together.\n' +
        '4) Never leave identifiers referenced but undefined (e.g. restParts without ...restParts).\n' +
        '5) Prefer renaming shadowed names: async function sbRest; const [action, ...restParts].\n' +
        '6) Surgical minimal change — do not refactor unrelated code.\n' +
        '7) No prose outside the fence.',
      maxTokens: 5000,
      temperature: 0.1,
    }
  );
  if (!r.ok) return { ok: false, error: r.error || 'AI failed' };
  let code = extractCode(r.text);
  if (!code) return { ok: false, error: 'AI did not return a code block' };
  const sem = semanticSanityCheck(code, instruction);
  if (sem.length) {
    // one forced repair pass focused on semantic issues
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
      });
      const c2 = extractCode(r2.text || r2);
      if (c2 && c2.length > 50) code = c2;
    } catch (_) {}
  }
  let bal = balanceCheck(code);
  if (bal) {
    const fixed = await repairSyntaxLoop(code, path, instruction, 2);
    if (!fixed.ok) {
      return {
        ok: false,
        error:
          'Validate fail: ' +
          (fixed.error || bal) +
          ' (repair loop exhausted)',
      };
    }
    code = fixed.code;
    bal = balanceCheck(code);
    if (bal) return { ok: false, error: 'Validate fail after repair: ' + bal };
  }

  const confirm = String(process.env.PHASEC_CONFIRM || '1') === '1';
  if (confirm) {
    try {
      const phaseC = await import('./phaseC.js');
      if (typeof phaseC.queuePatch === 'function') {
        const q = await phaseC.queuePatch({
          filePath: path,
          content: code,
          reason: instruction,
          sha: file.sha,
          createdBy: String(ownerId || ADMIN()),
        });
        if (!q.ok) return { ok: false, error: q.error || 'queue failed' };
        return {
          ok: true,
          queued: true,
          id: q.id,
          path,
          engine: r.engine,
          model: r.model,
          preview: code.slice(0, 1200),
          message:
            '⏸ Patch queued id=' +
            (q.id || '?') +
            '\nPath: ' +
            path +
            '\nEngine: ' +
            (r.engine || '') +
            (r.model ? ' · ' + r.model : '') +
            '\n/debug apply ' +
            (q.id || '') +
            '  OR  /debug reject ' +
            (q.id || ''),
        };
      }
    } catch (_) {}

    const url = process.env.SUPABASE_URL;
    const key =
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
    const row = {
      file_path: path,
      content_b64: Buffer.from(code, 'utf8').toString('base64'),
      reason: String(instruction || '').slice(0, 500),
      sha: file.sha || null,
      status: 'pending',
      created_by: String(ownerId || ADMIN()),
    };
    const res = await fetch(
      url.replace(/\/$/, '') + '/rest/v1/rq_pending_patches',
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
        error: 'Pending insert failed: ' + (j.message || j.error || res.status),
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
}

export async function applyPatch(id) {
  try {
    // Prefer phaseC.confirmPatch / applyPending when present
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
        if (r && r.ok) {
          return {
            ok: true,
            path: r.filePath || r.path,
            message:
              '✅ Applied `' +
              (r.filePath || r.path || '') +
              '` (phaseC)',
          };
        }
        if (r && r.error) {
          // fall through to local apply for recoverable errors
          if (/not found|missing/i.test(String(r.error))) {
            return { ok: false, error: r.error };
          }
        }
      }
    } catch (_) {
      /* local path */
    }

    const url = process.env.SUPABASE_URL;
    const key =
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
    if (!url || !key) {
      return { ok: false, error: 'SUPABASE_URL / key missing' };
    }

    const res = await fetch(
      url.replace(/\/$/, '') +
        '/rest/v1/rq_pending_patches?id=eq.' +
        encodeURIComponent(id) +
        '&status=eq.pending&limit=1',
      { headers: { apikey: key, Authorization: 'Bearer ' + key } }
    );
    const rows = await res.json().catch(() => null);
    const rec = Array.isArray(rows) ? rows[0] : null;
    if (!rec) {
      return {
        ok: false,
        error:
          'Patch not found or not pending. Use /debug pending for full ids.',
      };
    }

    const filePath = rec.file_path || rec.path;
    let content = rec.proposed || rec.content || '';
    if (rec.content_b64) {
      try {
        content = Buffer.from(rec.content_b64, 'base64').toString('utf8');
      } catch (e) {
        return { ok: false, error: 'content_b64 decode failed' };
      }
    }
    if (!filePath || !content) {
      return { ok: false, error: 'Patch missing file_path/content_b64' };
    }

    // Re-validate before push (queued patch should already be balanced)
    const bal = balanceCheck(content);
    if (bal) {
      return {
        ok: false,
        error:
          'Stored patch invalid: ' +
          bal +
          ' — re-run /debug file instead of apply',
      };
    }

    let put;
    try {
      const { githubPutFile } = await import('./ghUploadLite.js');
      put = await githubPutFile({
        path: filePath,
        content,
        message: 'debug apply: ' + String(rec.reason || '').slice(0, 60),
      });
    } catch (e) {
      return {
        ok: false,
        error: 'GitHub push failed: ' + (e.message || String(e)).slice(0, 240),
      };
    }

    await fetch(
      url.replace(/\/$/, '') +
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
    ).catch(() => {});

    return {
      ok: true,
      path: filePath,
      message:
        '✅ Applied `' +
        filePath +
        '`' +
        (put && put.commit ? ' · ' + String(put.commit).slice(0, 7) : ''),
    };
  } catch (e) {
    // NEVER throw — prevents Prometheus from hijacking /debug apply
    return {
      ok: false,
      error: 'apply crash: ' + (e.message || String(e)).slice(0, 240),
    };
  }
}

export async function rejectPatch(id) {
  try {
    const phaseC = await import('./phaseC.js');
    if (typeof phaseC.rejectPending === 'function') {
      await phaseC.rejectPending(id);
      return { ok: true, message: '🗑 Rejected ' + id };
    }
  } catch (_) {}
  const url = process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
  await fetch(
    url.replace(/\/$/, '') +
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
  return { ok: true, message: '🗑 Rejected ' + id };
}

export async function listPending() {
  try {
    const phaseC = await import('./phaseC.js');
    if (typeof phaseC.listPending === 'function') {
      const rows = await phaseC.listPending(10);
      if (rows?.error) return '❌ ' + rows.error;
      const list = Array.isArray(rows) ? rows : [];
      if (!list.length) return 'No pending patches.';
      return (
        '⏸ PENDING PATCHES\n' +
        list
          .map(
            (r, i) =>
              i +
              1 +
              '. `' +
              r.id +
              '`\n   ' +
              (r.file_path || r.path || '?') +
              '\n   ' +
              String(r.reason || r.instruction || '').slice(0, 60)
          )
          .join('\n')
      );
    }
  } catch (_) {}
  const url = process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
  const res = await fetch(
    url.replace(/\/$/, '') +
      '/rest/v1/rq_pending_patches?status=eq.pending&order=created_at.desc&limit=10&select=id,file_path,reason,created_at,status',
    { headers: { apikey: key, Authorization: 'Bearer ' + key } }
  );
  const rows = await res.json();
  if (!res.ok)
    return '❌ ' + (rows.message || rows.error || res.status);
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) return 'No pending patches.';
  return (
    '⏸ PENDING PATCHES\n' +
    list
      .map(
        (r, i) =>
          i +
          1 +
          '. `' +
          r.id +
          '`\n   ' +
          (r.file_path || '?') +
          '\n   ' +
          String(r.reason || '').slice(0, 60)
      )
      .join('\n')
  );
}

export async function handlePhaseADebug({ text, ctx }) {
  if (String(ctx?.from?.id || '') !== ADMIN()) return '👑 Founder-only.';
  const raw = String(text || '').trim();
  if (/^\/debug(?:@\w+)?(?:\s+help)?$/i.test(raw)) {
    return (
      '🛠 DEBUG · v5000 A2 (live models Oct 2026)\n\n' +
      '/debug file <path> :: <instruction>\n' +
      '/debug pending | apply <id> | reject <id>\n\n' +
      'Models: gpt-oss-20b · gemini-3.8-flash · qwen3.8\n' +
      'Example:\n/debug file lib/echoX.js :: keep replies under 2 sentences'
    );
  }
  if (/^\/debug(?:@\w+)?\s+pending$/i.test(raw)) return await listPending();
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
  const rej = raw.match(/^\/debug(?:@\w+)?\s+reject\s+(\S+)/i);
  if (rej) return (await rejectPatch(rej[1])).message;
  const file = raw.match(
    /^\/debug(?:@\w+)?\s+file\s+(\S+)\s*::\s*([\s\S]+)/i
  );
  if (file) {
    const r = await debugFile({
      path: file[1],
      instruction: file[2].trim(),
      ownerId: ctx.from.id,
    });
    if (!r.ok) return '❌ ' + (r.error || 'fail');
    return (
      (r.message || 'OK') +
      (r.preview ? '\n\nPreview:\n' + r.preview.slice(0, 1500) : '')
    );
  }
  try {
    const { handleDebug } = await import('./debugLite.js');
    const msg = await handleDebug({ text: raw, ctx });
    if (msg) return msg;
  } catch (_) {}
  return 'Unknown /debug form. Try /debug help';
}

export default {
  handlePhaseADebug,
  debugFile,
  applyPatch,
  rejectPatch,
  listPending,
  multiChat,
};
