/**
 * v5000 Phase A — Code Bug God Mode deepen
 * /debug file <path> :: <instruction>
 * /debug apply <id> | /debug reject <id>
 * Uses rq_pending_patches when PHASEC_CONFIRM=1
 */
const ADMIN = () =>
  String(process.env.ADMIN_ID || process.env.FOUNDER_ID || '').trim();

function sb() {
  const url = process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
  if (!url || !key) return null;
  return { url: url.replace(/\/$/, ''), key };
}

async function sbFetch(path, opts = {}) {
  const c = sb();
  if (!c) throw new Error('Supabase not configured');
  const res = await fetch(c.url + '/rest/v1/' + path, {
    ...opts,
    headers: {
      apikey: c.key,
      Authorization: 'Bearer ' + c.key,
      'Content-Type': 'application/json',
      Prefer: opts.prefer || 'return=representation',
      ...(opts.headers || {}),
    },
  });
  const text = await res.text();
  let j = null;
  try {
    j = text ? JSON.parse(text) : null;
  } catch (_) {
    j = { raw: text };
  }
  if (!res.ok) {
    throw new Error(
      (j && (j.message || j.error || j.hint || j.raw)) || 'SB ' + res.status
    );
  }
  return j;
}

async function powerChatSafe(prompt, opts) {
  try {
    const mod = await import('./powerhouse.js');
    const fn = mod.powerChat || mod.default?.powerChat;
    if (!fn) return { ok: false, error: 'powerChat missing' };
    return await fn(prompt, opts || {});
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
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
  // whole response if looks like code
  const t = String(text || '').trim();
  if (t.includes('export ') || t.includes('function ') || t.includes('const ')) {
    return t;
  }
  return null;
}

export async function debugFile({ path, instruction, ownerId }) {
  const file = await githubGetFile(path);
  // Cap source for AI
  const src = file.content.slice(0, 28000);
  const r = await powerChatSafe(
    'FILE: ' +
      path +
      '\n\nINSTRUCTION:\n' +
      instruction +
      '\n\nCURRENT SOURCE:\n' +
      src +
      '\n\nReturn the COMPLETE fixed file inside one ```js code block. No prose outside the block. Keep balanced braces/parens.',
    {
      system:
        'PasiyaOS Repo Surgeon. Output only full file in a js code fence. Surgical minimal change.',
      maxTokens: 8000,
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
    const row = {
      owner_id: String(ownerId || ADMIN()),
      path: path,
      instruction: String(instruction || '').slice(0, 1000),
      proposed: code.slice(0, 500000),
      sha: file.sha,
      status: 'pending',
    };
    let inserted;
    try {
      inserted = await sbFetch('rq_pending_patches', {
        method: 'POST',
        body: JSON.stringify(row),
      });
    } catch (e) {
      return {
        ok: false,
        error:
          'Pending table failed: ' +
          (e.message || e) +
          ' — run sql/PHASE_C_PENDING_PATCHES.sql',
      };
    }
    const rec = Array.isArray(inserted) ? inserted[0] : inserted;
    return {
      ok: true,
      queued: true,
      id: rec?.id,
      path,
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
      message: '✅ Applied `' + path + '`' + (put.commit ? ' · ' + String(put.commit).slice(0, 7) : ''),
    };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

export async function applyPatch(id, ownerId) {
  const rows = await sbFetch(
    'rq_pending_patches?id=eq.' +
      encodeURIComponent(id) +
      '&status=eq.pending&limit=1'
  );
  const rec = Array.isArray(rows) ? rows[0] : null;
  if (!rec) return { ok: false, error: 'Patch not found or not pending' };
  const { githubPutFile } = await import('./ghUploadLite.js');
  const put = await githubPutFile({
    path: rec.path,
    content: rec.proposed,
    message: 'debug apply: ' + String(rec.instruction || '').slice(0, 60),
  });
  await sbFetch('rq_pending_patches?id=eq.' + encodeURIComponent(id), {
    method: 'PATCH',
    body: JSON.stringify({
      status: 'applied',
      applied_at: new Date().toISOString(),
    }),
    prefer: 'return=minimal',
  });
  return {
    ok: true,
    path: rec.path,
    commit: put.commit,
    message:
      '✅ Applied `' +
      rec.path +
      '`' +
      (put.commit ? ' · ' + String(put.commit).slice(0, 7) : ''),
  };
}

export async function rejectPatch(id) {
  await sbFetch('rq_pending_patches?id=eq.' + encodeURIComponent(id), {
    method: 'PATCH',
    body: JSON.stringify({ status: 'rejected' }),
    prefer: 'return=minimal',
  });
  return { ok: true, message: '🗑 Rejected ' + id };
}

export async function listPending(ownerId) {
  const rows = await sbFetch(
    'rq_pending_patches?status=eq.pending&order=created_at.desc&limit=10&select=id,path,instruction,created_at'
  );
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
          r.path +
          '\n   ' +
          String(r.instruction || '').slice(0, 60)
      )
      .join('\n')
  );
}

export async function handlePhaseADebug({ text, ctx }) {
  if (String(ctx?.from?.id || '') !== ADMIN()) return '👑 Founder-only.';
  const raw = String(text || '').trim();

  if (/^\/debug(?:@\w+)?(?:\s+help)?$/i.test(raw)) {
    return (
      '🛠 DEBUG · v5000 Phase A\n\n' +
      '/debug file <path> :: <instruction>\n' +
      '/debug pending\n' +
      '/debug apply <id>\n' +
      '/debug reject <id>\n\n' +
      'PHASEC_CONFIRM=' +
      (process.env.PHASEC_CONFIRM || '1') +
      ' (1=queue, 0=direct push)\n' +
      'Example:\n' +
      '/debug file lib/echoX.js :: forbid generic greeting'
    );
  }

  if (/^\/debug(?:@\w+)?\s+pending$/i.test(raw)) {
    return await listPending(ctx.from.id);
  }

  const apply = raw.match(/^\/debug(?:@\w+)?\s+apply\s+(\S+)/i);
  if (apply) {
    const r = await applyPatch(apply[1], ctx.from.id);
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

  // Fallback: try existing debugLite
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
};
