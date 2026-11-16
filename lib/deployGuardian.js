
/**
 * Wave 22 — Deploy Guardian
 * Proactive Hobby-limit + GitHub api/ surface + optional Vercel deploy status.
 * Goal: Founder never learns deploy death only from Vercel dashboard.
 */

const HOBBY_FN_MAX = 12;
const HOBBY_DEPLOY_DAY_HINT = 100;

function ghHeaders() {
  const h = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'QueenOS-DeployGuardian',
  };
  const tok =
    process.env.GITHUB_TOKEN ||
    process.env.GH_TOKEN ||
    process.env.GITHUB_PAT ||
    '';
  if (tok) h.Authorization = 'Bearer ' + tok;
  return h;
}

function repoParts() {
  const owner =
    process.env.GITHUB_OWNER ||
    process.env.GH_OWNER ||
    'pasindudananjaya92-bot';
  const repo =
    process.env.GITHUB_REPO ||
    process.env.GH_REPO ||
    'radiant-queen-pasiya-max-v2';
  const branch = process.env.GITHUB_BRANCH || process.env.GH_BRANCH || 'main';
  return { owner, repo, branch };
}

async function listApiJsFiles() {
  const { owner, repo, branch } = repoParts();
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/api?ref=${encodeURIComponent(branch)}`;
  const r = await fetch(url, { headers: ghHeaders() });
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    return { ok: false, error: `GitHub api/ list ${r.status}: ${t.slice(0, 180)}`, files: [] };
  }
  const data = await r.json();
  const files = (Array.isArray(data) ? data : [])
    .filter((f) => f && f.type === 'file' && /\.(js|ts|mjs|cjs)$/i.test(f.name || ''))
    .map((f) => f.name)
    .sort();
  return { ok: true, files };
}

async function listExtraFunctionPaths() {
  // hull-b/api/*.js also counts on same Vercel project
  const { owner, repo, branch } = repoParts();
  const paths = ['hull-b/api', 'workers'];
  const found = [];
  for (const p of paths) {
    try {
      const url = `https://api.github.com/repos/${owner}/${repo}/contents/${p}?ref=${encodeURIComponent(branch)}`;
      const r = await fetch(url, { headers: ghHeaders() });
      if (!r.ok) continue;
      const data = await r.json();
      if (!Array.isArray(data)) continue;
      for (const f of data) {
        if (f.type === 'file' && /\.(js|ts)$/i.test(f.name || '')) {
          found.push(p + '/' + f.name);
        }
        if (f.type === 'dir' && p === 'hull-b/api') {
          // skip deep
        }
      }
      // recursive one level for hull-b/api
      if (p === 'hull-b/api') {
        for (const f of data) {
          if (f.type === 'dir') {
            const u2 = `https://api.github.com/repos/${owner}/${repo}/contents/${p}/${f.name}?ref=${encodeURIComponent(branch)}`;
            const r2 = await fetch(u2, { headers: ghHeaders() });
            if (!r2.ok) continue;
            const d2 = await r2.json();
            for (const x of Array.isArray(d2) ? d2 : []) {
              if (x.type === 'file' && /\.(js|ts)$/i.test(x.name || '')) {
                found.push(p + '/' + f.name + '/' + x.name);
              }
            }
          }
        }
      }
    } catch (_) {}
  }
  return found;
}

async function vercelLatestDeploy() {
  const token = process.env.VERCEL_TOKEN || process.env.VERCEL_API_TOKEN || '';
  const project =
    process.env.VERCEL_PROJECT_ID ||
    process.env.VERCEL_PROJECT_NAME ||
    process.env.VERCEL_PROJECT ||
    '';
  const team = process.env.VERCEL_TEAM_ID || '';
  if (!token) {
    return {
      ok: false,
      configured: false,
      error: 'VERCEL_TOKEN not set — add for live deploy status',
    };
  }
  try {
    let url =
      'https://api.vercel.com/v6/deployments?limit=3&target=production';
    if (project) url += '&projectId=' + encodeURIComponent(project);
    if (team) url += '&teamId=' + encodeURIComponent(team);
    const r = await fetch(url, {
      headers: { Authorization: 'Bearer ' + token },
    });
    if (!r.ok) {
      const t = await r.text().catch(() => '');
      return { ok: false, configured: true, error: `Vercel API ${r.status}: ${t.slice(0, 200)}` };
    }
    const data = await r.json();
    const deps = data.deployments || data || [];
    const list = (Array.isArray(deps) ? deps : []).slice(0, 3).map((d) => ({
      uid: d.uid || d.id,
      state: d.state || d.readyState,
      errorMessage: d.errorMessage || null,
      created: d.created || d.createdAt,
      url: d.url,
    }));
    const latest = list[0] || null;
    const failed = list.filter((d) =>
      /ERROR|FAILED|CANCELED/i.test(String(d.state || ''))
    );
    return {
      ok: true,
      configured: true,
      latest,
      recent_failed: failed.length,
      list,
    };
  } catch (e) {
    return { ok: false, configured: true, error: e.message || String(e) };
  }
}

export async function runDeployCheck() {
  const t0 = Date.now();
  const api = await listApiJsFiles();
  const extra = await listExtraFunctionPaths();
  const vercel = await vercelLatestDeploy();

  const apiFiles = api.files || [];
  const apiCount = apiFiles.length;
  const extraCount = extra.length;
  const totalEstimate = apiCount + extraCount;
  const over = totalEstimate > HOBBY_FN_MAX;
  const warn = totalEstimate >= HOBBY_FN_MAX - 1;

  const alerts = [];
  if (!api.ok) alerts.push({ level: 'red', msg: 'Cannot list api/ from GitHub: ' + (api.error || '') });
  if (over) {
    alerts.push({
      level: 'red',
      msg: `Serverless function budget EXCEEDED: ~${totalEstimate} > Hobby max ${HOBBY_FN_MAX}. Delete surplus api/*.js`,
    });
  } else if (warn) {
    alerts.push({
      level: 'yellow',
      msg: `Function budget tight: ~${totalEstimate}/${HOBBY_FN_MAX}`,
    });
  }
  if (vercel.configured && vercel.latest) {
    const st = String(vercel.latest.state || '');
    if (/ERROR|FAILED/i.test(st)) {
      alerts.push({
        level: 'red',
        msg: `Latest production deploy ${st}: ${(vercel.latest.errorMessage || 'see Vercel logs').slice(0, 160)}`,
      });
    }
  } else if (!vercel.configured) {
    alerts.push({
      level: 'yellow',
      msg: 'VERCEL_TOKEN not set — deploy state blind. Add token for live fail alerts.',
    });
  }

  const safeKeep = ['telegram.js', 'cron.js', 'dash.js', 'fs.js'];
  const surplus = apiFiles.filter((f) => !safeKeep.includes(f));

  return {
    ok: alerts.filter((a) => a.level === 'red').length === 0,
    ms: Date.now() - t0,
    hobby_fn_max: HOBBY_FN_MAX,
    api_files: apiFiles,
    api_count: apiCount,
    extra_paths: extra,
    total_estimate: totalEstimate,
    surplus_candidates: surplus,
    vercel,
    alerts,
    tips: [
      'Batch ZIP → one redeploy (save daily deploy quota ~100)',
      'Never leave empty stub api/*.js — they still count',
      'Rewrites in vercel.json ≠ deleted functions',
    ],
  };
}

export function formatDeployCheck(r) {
  const lines = [];
  lines.push('🛡 *Deploy Guardian · 22*');
  lines.push(r.ok ? '✅ No RED deploy risks' : '🚨 *Action needed*');
  lines.push('');
  lines.push(
    `Functions (est.): *${r.total_estimate}* / ${r.hobby_fn_max} Hobby`
  );
  lines.push(`· api/*.js: ${r.api_count} — ${(r.api_files || []).join(', ') || '—'}`);
  if (r.extra_paths?.length) {
    lines.push(`· extra: ${r.extra_paths.join(', ')}`);
  }
  if (r.surplus_candidates?.length) {
    lines.push(`· delete candidates: \`${r.surplus_candidates.join('`, `')}\``);
  }
  lines.push('');
  if (r.vercel?.configured && r.vercel.latest) {
    lines.push(
      `Vercel latest: *${r.vercel.latest.state}* ${r.vercel.latest.url ? '· ' + r.vercel.latest.url : ''}`
    );
    if (r.vercel.latest.errorMessage) {
      lines.push('Error: ' + String(r.vercel.latest.errorMessage).slice(0, 200));
    }
  } else if (r.vercel && !r.vercel.configured) {
    lines.push('Vercel API: not configured (set VERCEL_TOKEN + VERCEL_PROJECT_ID)');
  } else if (r.vercel?.error) {
    lines.push('Vercel API: ' + r.vercel.error);
  }
  if (r.alerts?.length) {
    lines.push('');
    lines.push('*Alerts*');
    for (const a of r.alerts) {
      lines.push(`${a.level === 'red' ? '🔴' : '🟡'} ${a.msg}`);
    }
  }
  lines.push('');
  lines.push('_' + r.ms + 'ms_');
  return lines.join('\n');
}

/** Short block for morning pack / omni pulse */
export async function deployGuardianBrief() {
  const r = await runDeployCheck();
  const red = (r.alerts || []).filter((a) => a.level === 'red');
  const yellow = (r.alerts || []).filter((a) => a.level === 'yellow');
  if (!red.length && !yellow.length) {
    return `🛡 Deploy: OK · fn ~${r.total_estimate}/${r.hobby_fn_max}`;
  }
  const top = (red[0] || yellow[0]).msg;
  return `🛡 Deploy: ${red.length ? 'RED' : 'WARN'} · fn ~${r.total_estimate}/${r.hobby_fn_max}\n· ${top}`;
}

export function deployHelp() {
  return (
    '*Deploy Guardian · Wave 22*\n' +
    'Catches Hobby 12-fn + failed deploys *before* you open Vercel.\n\n' +
    '• `deploy check` — full report\n' +
    '• `deploy status` — same\n' +
    '• `deploy help`\n' +
    '• Also embedded in `morning pack` + `omni pulse`\n\n' +
    'Optional env: `VERCEL_TOKEN`, `VERCEL_PROJECT_ID` (or name), `VERCEL_TEAM_ID`\n' +
    'GitHub list uses `GITHUB_TOKEN` if rate-limited.'
  );
}

export default {
  runDeployCheck,
  formatDeployCheck,
  deployGuardianBrief,
  deployHelp,
};
