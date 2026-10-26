/**
 * v5000 Phase A HOTFIX
 * - Aligns with rq_pending_patches schema used by phaseC.js
 *   (file_path, content_b64, reason, sha, status, created_by)
 * - Stronger AI fallback (direct Groq/Gemini) when powerChat fails
 * - Better error text (shows engine failures)
 */
const ADMIN = () =>
  String(process.env.ADMIN_ID || process.env.FOUNDER_ID || '').trim();

const PER_MS = 18000;

function trim(x, n = 180) {
  return String(x || '')
    .replace(/\s+/g, ' ')
    .slice(0, n);
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

/** Prefer powerhouse; fall back to live models */
async function multiChat(prompt, opts = {}) {
  const system =
    opts.system ||
    'PasiyaOS Repo Surgeon. Output only full file in one js code fence.';
  const maxTokens = opts.maxTokens || 4000;
  const tried = [];

  // 1) powerhouse
  try {
    const mod = await import('./powerhouse.js');
    const fn = mod.powerChat || mod.default?.powerChat;
    if (fn) {
      const r = await fn(prompt, {
        system,
        maxTokens,
        temperature: opts.temperature ?? 0.1,
      });
      if (r && r.ok && r.text) return { ok: true, text: r.text, engine: r.engine || 'powerhouse', tried: r.tried || tried };
      tried.push('powerhouse:' + trim(r?.error || 'empty'));
    } else tried.push('powerhouse:no-fn');
  } catch (e) {
    tried.push('powerhouse:' + trim(e.message || e));
  }

  // 2) Groq live models
  const groqKey = process.env.GROQ_API_KEY || process.env.GROQ_KEY;
  if (groqKey) {
    for (const model of ['llama-3.1-8b-instant', 'llama-3.3-70b-versatile']) {
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
        tried.push('groq@' + model + ':' + trim(json?.error?.message || res.status));
      } catch (e) {
        tried.push('groq@' + model + ':' + trim(e.message || e));
      }
    }
  } else tried.push('groq:no-key');

  // 3) Gemini
  const gemKey =
    process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
  if (gemKey) {
    for (const model of ['gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-1.5-flash']) {
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
              contents: [{ role: 'user', parts: [{ text: system + '\n\n' + prompt }] }],
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

  return {
    ok: false,
    error: 'All engines failed · ' + tried.slice(0, 8).join(' | '),
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
  const content = Buffer.from(j.content || '', 'base64').toString('utf8');
  return { content, sha: j.sha, path };
}

function balanceCheck(src) {
  const s = String(src || '');
  const o = (s.match(/\{/g) || []).length;
  const c = (s.match(/\}/g) || []).length;
  if (o !== c) return 'unbalanced braces diff=' + (o - c);
  const po = (s.match(/\(/g) || []).length;
  const pc = (s.match(/\)/g) || []).length;
  if (po !== pc) return 'unbalanced parens diff=' + (po - pc);
  return null;
}

function extractCode(text) {
  const m = String(text || '').match(/```(?:javascript|js)?\n([\s\S]*?)```/i);
  if (m) return m[1].trim();
  const t = String(text || '').trim();
  if (t.includes('export ') || t.includes('function ') || t.includes('const ')) {
    return t;
  }
  return null;
}

export async function debugFile({ path, instruction, ownerId }) {
  const file = await githubGetFile(path);
  // Keep prompt smaller to avoid timeouts
  const src = file.content.slice(0, 14000);
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
        'PasiyaOS Repo Surgeon. Output only full file in a js code fence. Surgical minimal change.',
      maxTokens: 5000,
      temperature: 0.1,
    }
  );
  if (!r.ok) return { ok: false, error: r.error || 'AI failed' };
  const code = extractCode(r.text);
  if (!code) return { ok: false, error: 'AI did not return a code block' };
  const bal = balanceCheck(code);
  if (bal) return { ok: false, error: 'Validate fail: ' + bal };

  const confirm = String(process.env.PHASEC_CONFIRM || '1') === '1';
  if (confirm) {
    // Use phaseC schema: file_path + content_b64 + reason
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
          preview: code.slice(0, 1200),
          message:
            '⏸ Patch queued id=' +
            (q.id || '?') +
            '\nPath: ' +
            path +
            '\nEngine: ' +
            (r.engine || '') +
            '\n/debug apply ' +
            (q.id || '') +
            '  OR  /debug reject ' +
            (q.id || ''),
        };
      }
    } catch (e) {
      /* fall through to direct schema insert */
    }

    // Direct insert matching phaseC columns
    try {
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
          error:
            'Pending insert failed: ' +
            (j.message || j.error || res.status) +
            ' — table needs file_path, content_b64, reason, status',
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
          (rec?.id || '') +
          '  OR  /debug reject ' +
          (rec?.id || ''),
      };
    } catch (e) {
      return { ok: false, error: e.message || String(e) };
    }
  }

  // Direct push
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
        (put.commit ? ' · ' + String(put.commit).slice(0, 7) : '') +
        ' · engine ' +
        (r.engine || ''),
    };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

export async function applyPatch(id) {
  // Prefer phaseC.applyPending if exists
  try {
    const phaseC = await import('./phaseC.js');
    if (typeof phaseC.applyPending === 'function') {
      const r = await phaseC.applyPending(id);
      if (r.ok) {
        return {
          ok: true,
          path: r.filePath,
          message: '✅ Applied `' + (r.filePath || '') + '`',
        };
      }
      return { ok: false, error: r.error || 'apply failed' };
    }
  } catch (_) {}

  const url = process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
  const res = await fetch(
    url.replace(/\/$/, '') +
      '/rest/v1/rq_pending_patches?id=eq.' +
      encodeURIComponent(id) +
      '&status=eq.pending&limit=1',
    {
      headers: {
        apikey: key,
        Authorization: 'Bearer ' + key,
      },
    }
  );
  const rows = await res.json();
  const rec = Array.isArray(rows) ? rows[0] : null;
  if (!rec) return { ok: false, error: 'Patch not found or not pending' };

  const filePath = rec.file_path || rec.path;
  let content = rec.proposed || rec.content || '';
  if (rec.content_b64) {
    content = Buffer.from(rec.content_b64, 'base64').toString('utf8');
  }
  if (!filePath || !content) {
    return { ok: false, error: 'Patch missing file_path/content_b64' };
  }

  const { githubPutFile } = await import('./ghUploadLite.js');
  const put = await githubPutFile({
    path: filePath,
    content,
    message: 'debug apply: ' + String(rec.reason || '').slice(0, 60),
  });

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
      body: JSON.stringify({ status: 'applied' }),
    }
  );

  return {
    ok: true,
    path: filePath,
    commit: put.commit,
    message:
      '✅ Applied `' +
      filePath +
      '`' +
      (put.commit ? ' · ' + String(put.commit).slice(0, 7) : ''),
  };
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
      if (rows && rows.error) return '❌ ' + rows.error;
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

  // Fallback select without assuming path column
  const url = process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
  const res = await fetch(
    url.replace(/\/$/, '') +
      '/rest/v1/rq_pending_patches?status=eq.pending&order=created_at.desc&limit=10&select=id,file_path,reason,created_at,status',
    {
      headers: {
        apikey: key,
        Authorization: 'Bearer ' + key,
      },
    }
  );
  const rows = await res.json();
  if (!res.ok) {
    return (
      '❌ pending query: ' +
      (rows.message || rows.error || res.status) +
      '\nExpected columns: id, file_path, reason, status'
    );
  }
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
      '🛠 DEBUG · v5000 Phase A (hotfix)\n\n' +
      '/debug file <path> :: <instruction>\n' +
      '/debug pending\n' +
      '/debug apply <id>\n' +
      '/debug reject <id>\n\n' +
      'Schema: file_path + content_b64 (phaseC)\n' +
      'PHASEC_CONFIRM=' +
      (process.env.PHASEC_CONFIRM || '1') +
      '\nExample:\n' +
      '/debug file lib/echoX.js :: keep replies under 2 sentences'
    );
  }

  if (/^\/debug(?:@\w+)?\s+pending$/i.test(raw)) {
    return await listPending();
  }

  const apply = raw.match(/^\/debug(?:@\w+)?\s+apply\s+(\S+)/i);
  if (apply) {
    const r = await applyPatch(apply[1]);
    return r.message || (r.ok ? 'OK' : '❌ ' + r.error);
  }

  const rej = raw.match(/^\/debug(?:@\w+)?\s+reject\s+(\S+)/i);
  if (rej) {
    const r = await rejectPatch(rej[1]);
    return r.message;
  }

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
};
