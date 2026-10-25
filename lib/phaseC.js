/**
 * Phase C — Repo Surgeon
 * Pending patches in Supabase; founder confirms before push.
 * /debug fix list | confirm <id> | reject <id>
 * Integrates with Architect / debug apply path.
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
      (j && (j.message || j.error || j.raw)) || 'SB ' + res.status
    );
  }
  return j;
}

function ghHeaders() {
  return {
    Authorization:
      'Bearer ' + (process.env.GITHUB_TOKEN || process.env.GH_TOKEN || ''),
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'PasiyaOS-PhaseC',
  };
}

function repoParts() {
  const r =
    process.env.GITHUB_REPO ||
    'pasindudananjaya92-bot/radiant-queen-pasiya-max-v2';
  const [owner, name] = r.split('/');
  return { owner, name };
}

function balanceOk(src) {
  let a = 0,
    b = 0,
    c = 0;
  let inS = false,
    inD = false,
    inT = false,
    esc = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (esc) {
      esc = false;
      continue;
    }
    if (ch === '\\' && (inS || inD || inT)) {
      esc = true;
      continue;
    }
    if (!inD && !inT && ch === "'") {
      inS = !inS;
      continue;
    }
    if (!inS && !inT && ch === '"') {
      inD = !inD;
      continue;
    }
    if (!inS && !inD && ch === '`') {
      inT = !inT;
      continue;
    }
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

export async function queuePatch({
  filePath,
  content,
  reason,
  sha,
  createdBy,
}) {
  if (!balanceOk(content)) {
    return { ok: false, error: 'Unbalanced braces — not queued' };
  }
  if (String(content || '').length > 400000) {
    return { ok: false, error: 'Patch too large' };
  }
  const row = {
    file_path: filePath,
    content_b64: Buffer.from(content, 'utf8').toString('base64'),
    reason: String(reason || '').slice(0, 500),
    sha: sha || null,
    status: 'pending',
    created_by: createdBy || 'bot',
  };
  try {
    const inserted = await sbFetch('rq_pending_patches', {
      method: 'POST',
      body: JSON.stringify(row),
      prefer: 'return=representation',
    });
    const id = Array.isArray(inserted) ? inserted[0]?.id : inserted?.id;
    return { ok: true, id, filePath };
  } catch (e) {
    // Fallback: pasiya_fs style path via storage not available — return error
    return { ok: false, error: e.message || String(e) };
  }
}

export async function listPending(limit = 10) {
  try {
    const rows = await sbFetch(
      'rq_pending_patches?status=eq.pending&order=created_at.desc&limit=' +
        limit
    );
    return Array.isArray(rows) ? rows : [];
  } catch (e) {
    return { error: e.message || String(e) };
  }
}

async function ghGetSha(filePath) {
  const { owner, name } = repoParts();
  const res = await fetch(
    'https://api.github.com/repos/' +
      owner +
      '/' +
      name +
      '/contents/' +
      filePath.replace(/^\//, ''),
    { headers: ghHeaders() }
  );
  if (!res.ok) return null;
  const j = await res.json();
  return j.sha || null;
}

async function ghPut(filePath, content, sha, message) {
  const { owner, name } = repoParts();
  const res = await fetch(
    'https://api.github.com/repos/' +
      owner +
      '/' +
      name +
      '/contents/' +
      filePath.replace(/^\//, ''),
    {
      method: 'PUT',
      headers: { ...ghHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: message || 'phaseC: confirmed patch',
        content: Buffer.from(content, 'utf8').toString('base64'),
        branch: process.env.GITHUB_BRANCH || 'main',
        sha,
      }),
    }
  );
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.message || 'PUT ' + res.status);
  return j;
}

export async function confirmPatch(id) {
  const rows = await sbFetch(
    'rq_pending_patches?id=eq.' + encodeURIComponent(id) + '&limit=1'
  );
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row) return { ok: false, error: 'Patch not found: ' + id };
  if (row.status !== 'pending') {
    return { ok: false, error: 'Status is ' + row.status };
  }
  const content = Buffer.from(row.content_b64, 'base64').toString('utf8');
  if (!balanceOk(content)) {
    return { ok: false, error: 'Stored patch unbalanced' };
  }
  let sha = row.sha;
  if (!sha) sha = await ghGetSha(row.file_path);
  if (!sha) return { ok: false, error: 'Cannot resolve SHA for ' + row.file_path };
  try {
    await ghPut(
      row.file_path,
      content,
      sha,
      'phaseC confirm: ' + (row.reason || '').slice(0, 60)
    );
    await sbFetch('rq_pending_patches?id=eq.' + encodeURIComponent(id), {
      method: 'PATCH',
      body: JSON.stringify({
        status: 'applied',
        applied_at: new Date().toISOString(),
      }),
      prefer: 'return=minimal',
    });
    return { ok: true, filePath: row.file_path };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

export async function rejectPatch(id) {
  try {
    await sbFetch('rq_pending_patches?id=eq.' + encodeURIComponent(id), {
      method: 'PATCH',
      body: JSON.stringify({ status: 'rejected' }),
      prefer: 'return=minimal',
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

export async function handlePhaseC({ text, ctx }) {
  if (String(ctx?.from?.id || '') !== ADMIN()) return '👑 Founder-only.';
  const raw = String(text || '')
    .replace(/^\/debug(?:@\w+)?\s*/i, '')
    .trim();

  // /debug fix list|confirm|reject
  if (/^fix\b/i.test(raw) || /^surgeon\b/i.test(raw)) {
    const rest = raw.replace(/^(fix|surgeon)\s*/i, '').trim();
    if (!rest || rest === 'help') {
      return (
        '🛠 PHASE C · Repo Surgeon\n\n' +
        '/debug fix list\n' +
        '/debug fix confirm <id>\n' +
        '/debug fix reject <id>\n\n' +
        'Queue a patch:\n' +
        '/debug file lib/x.js :: apply :: <problem>\n' +
        '(queues for confirm if PHASEC_CONFIRM=1)\n\n' +
        'SQL: sql/PHASE_C_PENDING_PATCHES.sql'
      );
    }
    if (/^list\b/i.test(rest)) {
      const rows = await listPending(15);
      if (rows.error) return '❌ ' + rows.error;
      if (!rows.length) return 'No pending patches.';
      return (
        '🛠 PENDING PATCHES\n' +
        rows
          .map(function (r, i) {
            return (
              i +
              1 +
              '. id=' +
              r.id +
              ' · `' +
              r.file_path +
              '`\n   ' +
              (r.reason || '').slice(0, 80)
            );
          })
          .join('\n')
      );
    }
    const conf = rest.match(/^confirm\s+(\S+)/i);
    if (conf) {
      const r = await confirmPatch(conf[1]);
      if (!r.ok) return '❌ ' + r.error;
      return (
        '✅ Applied `' +
        r.filePath +
        '`\n⏳ Vercel 30–60s then re-test the command.'
      );
    }
    const rej = rest.match(/^reject\s+(\S+)/i);
    if (rej) {
      const r = await rejectPatch(rej[1]);
      if (!r.ok) return '❌ ' + r.error;
      return '🗑 Rejected patch ' + rej[1];
    }
  }

  return null; // not handled — fall through to debugLite
}

/**
 * Called from debug apply path: either push immediately or queue
 */
export async function applyOrQueue({
  filePath,
  content,
  sha,
  reason,
  forcePush,
}) {
  const needConfirm =
    process.env.PHASEC_CONFIRM === '1' ||
    process.env.PHASEC_CONFIRM === 'true';
  if (needConfirm && !forcePush) {
    return queuePatch({
      filePath,
      content,
      reason,
      sha,
      createdBy: 'debug-apply',
    });
  }
  // direct push
  if (!balanceOk(content)) {
    return { ok: false, error: 'Unbalanced braces' };
  }
  try {
    let s = sha;
    if (!s) s = await ghGetSha(filePath);
    if (!s) return { ok: false, error: 'No SHA' };
    await ghPut(filePath, content, s, 'phaseC: ' + (reason || '').slice(0, 50));
    return { ok: true, pushed: true, filePath };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

export default {
  handlePhaseC,
  queuePatch,
  confirmPatch,
  rejectPatch,
  listPending,
  applyOrQueue,
};
