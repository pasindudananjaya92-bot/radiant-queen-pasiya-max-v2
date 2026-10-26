/**
 * v5000 Phase C — deepen without Prometheus loops
 * - /patchlog  — applied/pending history from rq_pending_patches
 * - /healcheck — diagnose only (never auto-push)
 * - afterApplyRetest — optional retest hint after /debug apply
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
  const s = sb();
  if (!s) throw new Error('Supabase not configured');
  const res = await fetch(s.url + '/rest/v1/' + path, {
    method: opts.method || 'GET',
    headers: {
      apikey: s.key,
      Authorization: 'Bearer ' + s.key,
      'Content-Type': 'application/json',
      Prefer: opts.prefer || 'return=representation',
      ...(opts.headers || {}),
    },
    body: opts.body,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch (_) {
    json = { raw: text.slice(0, 200) };
  }
  if (!res.ok) {
    throw new Error(
      (json && (json.message || json.error || json.raw)) ||
        'HTTP ' + res.status
    );
  }
  return json;
}

export async function listPatches({ status = 'all', limit = 12 } = {}) {
  let q =
    'rq_pending_patches?order=created_at.desc&limit=' +
    Math.min(30, limit) +
    '&select=id,file_path,status,reason,created_at,applied_at';
  if (status && status !== 'all') {
    q += '&status=eq.' + encodeURIComponent(status);
  }
  try {
    const rows = await sbFetch(q);
    return Array.isArray(rows) ? rows : [];
  } catch (e) {
    return { error: e.message || String(e) };
  }
}

export function formatPatchLog(rows) {
  if (rows?.error) return '❌ patchlog: ' + rows.error;
  if (!rows || !rows.length) return '📋 No patches in log.';
  return (
    '📋 PATCH LOG (' +
    rows.length +
    ')\n' +
    rows
      .map((r, i) => {
        const id = String(r.id || '').slice(0, 8);
        const st = r.status || '?';
        const path = r.file_path || r.path || '?';
        const why = String(r.reason || '').slice(0, 60);
        return (
          i +
          1 +
          '. `' +
          id +
          '` · ' +
          st +
          '\n   ' +
          path +
          (why ? '\n   ' + why : '')
        );
      })
      .join('\n')
  );
}

/** Diagnose only — never pushes code */
export async function runHealCheck(supabase) {
  const checks = [];
  const envKeys = [
    'BOT_TOKEN',
    'ADMIN_ID',
    'GROQ_API_KEY',
    'GEMINI_API_KEY',
    'GITHUB_TOKEN',
    'GITHUB_REPO',
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
  ];
  for (const k of envKeys) {
    const ok = !!(process.env[k] || (k === 'GROQ_API_KEY' && process.env.GROQ_KEY));
    checks.push({ name: k, ok });
  }

  // Supabase ping
  let sbOk = false;
  let sbDetail = '';
  try {
    if (supabase) {
      const { error } = await supabase.from('rq_audit_log').select('id').limit(1);
      sbOk = !error;
      sbDetail = error ? error.message : 'rq_audit_log readable';
    } else {
      sbDetail = 'no client';
    }
  } catch (e) {
    sbDetail = String(e.message || e).slice(0, 80);
  }
  checks.push({ name: 'supabase', ok: sbOk, detail: sbDetail });

  // GitHub ping
  let ghOk = false;
  let ghDetail = '';
  try {
    const token = process.env.GITHUB_TOKEN;
    const repo = process.env.GITHUB_REPO || '';
    if (token && repo) {
      const res = await fetch('https://api.github.com/repos/' + repo, {
        headers: {
          Authorization: 'Bearer ' + token,
          Accept: 'application/vnd.github+json',
          'User-Agent': 'PasiyaOS-HealCheck',
        },
      });
      ghOk = res.ok;
      ghDetail = res.ok ? repo : 'HTTP ' + res.status;
    } else ghDetail = 'token/repo missing';
  } catch (e) {
    ghDetail = String(e.message || e).slice(0, 80);
  }
  checks.push({ name: 'github', ok: ghOk, detail: ghDetail });

  // Pending patches count
  let pending = 0;
  try {
    const rows = await listPatches({ status: 'pending', limit: 50 });
    if (Array.isArray(rows)) pending = rows.length;
  } catch (_) {}

  const failed = checks.filter((c) => !c.ok);
  return {
    ok: failed.length === 0,
    checks,
    pending,
    advice:
      failed.length === 0
        ? 'System calm. Use /debug file + /debug apply for surgical fixes. Prometheus stays OFF.'
        : 'Fix red items first. Do not enable auto-push until env is green.',
  };
}

export function formatHealCheck(r) {
  const lines = (r.checks || []).map(
    (c) =>
      (c.ok ? '✅' : '❌') +
      ' ' +
      c.name +
      (c.detail ? ' · ' + c.detail : '')
  );
  return (
    '🩺 HEAL CHECK (diagnose only — no auto-push)\n' +
    lines.join('\n') +
    '\n\nPending patches: ' +
    (r.pending || 0) +
    '\n' +
    r.advice
  );
}

/**
 * Map file path → suggested retest command
 */
export function suggestRetest(filePath) {
  const p = String(filePath || '').toLowerCase();
  if (p.includes('echox') || p.includes('echo')) return '/architect retest /echo';
  if (p.includes('expect')) return '/expect list';
  if (p.includes('omniscient') || p.includes('architect'))
    return '/architect status';
  if (p.includes('phasea') || p.includes('debug')) return '/debug pending';
  if (p.includes('powerhouse') || p.includes('omniprompt'))
    return '/architect status';
  return '/ping';
}

export async function handlePhaseCExtra({ text, ctx }) {
  if (String(ctx?.from?.id || '') !== ADMIN()) return '👑 Founder-only.';
  const raw = String(text || '').trim();
  const cmd = raw.split(/\s+/)[0].replace(/@\w+$/, '').toLowerCase();
  const arg = raw.replace(/^\/\S+\s*/, '').trim();

  if (cmd === '/patchlog') {
    const st = arg || 'all';
    const rows = await listPatches({
      status: /^(pending|applied|rejected)$/i.test(st) ? st.toLowerCase() : 'all',
      limit: 15,
    });
    return formatPatchLog(rows);
  }

  if (cmd === '/healcheck' || cmd === '/doctor') {
    // supabase optional — pass null; env checks still run
    let supabase = null;
    try {
      const { createClient } = await import('@supabase/supabase-js');
      const url = process.env.SUPABASE_URL;
      const key =
        process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
      if (url && key) {
        supabase = createClient(url, key, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
      }
    } catch (_) {}
    const r = await runHealCheck(supabase);
    return formatHealCheck(r);
  }

  return null;
}

export default {
  listPatches,
  formatPatchLog,
  runHealCheck,
  formatHealCheck,
  suggestRetest,
  handlePhaseCExtra,
};
