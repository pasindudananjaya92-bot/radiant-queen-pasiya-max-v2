/**
 * Wave 36A — GitHub Ops Desk
 * Uses existing GITHUB_TOKEN + GITHUB_REPO (same as gh upload).
 * Read issues/actions/repo + Founder-only create issue.
 */
export const VERSION = '37A-S2';

function token() {
  return String(process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '').trim();
}

function repoFull() {
  return String(
    process.env.GITHUB_REPO || process.env.GH_REPO || 'pasindudananjaya92-bot/radiant-queen-pasiya-max-v2'
  )
    .trim()
    .replace(/^https?:\/\/github\.com\//, '')
    .replace(/\.git$/, '');
}

function headers() {
  return {
    Authorization: 'Bearer ' + token(),
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'QueenOS-GOps/36A',
  };
}

async function gh(path, opts = {}) {
  if (!token()) return { ok: false, error: 'GITHUB_TOKEN missing on Vercel' };
  const url = path.startsWith('http') ? path : 'https://api.github.com' + path;
  try {
    const r = await fetch(url, {
      method: opts.method || 'GET',
      headers: { ...headers(), ...(opts.json ? { 'Content-Type': 'application/json' } : {}) },
      body: opts.json ? JSON.stringify(opts.json) : undefined,
      signal: AbortSignal.timeout(opts.timeoutMs || 12000),
    });
    const text = await r.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text.slice(0, 300) };
    }
    if (!r.ok) {
      const msg = data?.message || data?.error || text.slice(0, 200) || 'HTTP ' + r.status;
      return { ok: false, error: msg, status: r.status };
    }
    return { ok: true, data, status: r.status };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

export function gopsHelp() {
  return [
    '🛠 *GitHub Ops · ' + VERSION + '*',
    'Repo control · free · uses `GITHUB_TOKEN`',
    '',
    '• `gops help`',
    '• `gops repo` — name, branch, push, open issues count',
    '• `gops issues` — open issues (latest 10)',
    '• `gops open <title> | <body>` — create issue (Founder)',
    '• `gops actions` — latest workflow runs',
    '• `gops issue <number>` — one issue',
    '',
    'Repo: `' + repoFull() + '`',
    'Auto-open on fail: set `GOPS_AUTO_ISSUE=1` (default off)',
  ].join('\n');
}

export async function gopsRepo() {
  const repo = repoFull();
  const r = await gh('/repos/' + repo);
  if (!r.ok) return r;
  const d = r.data || {};
  return {
    ok: true,
    text: [
      '📦 *Repo*',
      '`' + (d.full_name || repo) + '`',
      'Default branch: `' + (d.default_branch || '—') + '`',
      'Open issues: ' + (d.open_issues_count ?? '—'),
      'Visibility: ' + (d.private ? 'private' : 'public'),
      'Pushed: ' + (d.pushed_at || '—'),
      'URL: ' + (d.html_url || 'https://github.com/' + repo),
    ].join('\n'),
  };
}

export async function gopsIssues(limit = 10) {
  const repo = repoFull();
  const r = await gh(
    '/repos/' + repo + '/issues?state=open&per_page=' + Math.min(15, limit) + '&sort=updated'
  );
  if (!r.ok) return r;
  const items = (r.data || []).filter((x) => !x.pull_request);
  if (!items.length) return { ok: true, text: '✅ No open issues on `' + repo + '`' };
  const lines = ['🐛 *Open issues* (' + items.length + ')', ''];
  for (const it of items.slice(0, limit)) {
    lines.push('· #' + it.number + ' ' + String(it.title || '').slice(0, 80));
    if (it.html_url) lines.push('  ' + it.html_url);
  }
  lines.push('', '_`gops issue <number>` · `gops open Title | body`_');
  return { ok: true, text: lines.join('\n') };
}

export async function gopsIssue(num) {
  const n = parseInt(String(num || '').replace(/^#/, ''), 10);
  if (!n) return { ok: false, error: 'Usage: gops issue 12' };
  const repo = repoFull();
  const r = await gh('/repos/' + repo + '/issues/' + n);
  if (!r.ok) return r;
  const d = r.data || {};
  return {
    ok: true,
    text: [
      '🐛 *#' + d.number + '* ' + (d.title || ''),
      'State: ' + (d.state || '—') + ' · ' + (d.user?.login || ''),
      d.html_url || '',
      '',
      String(d.body || '(no body)').slice(0, 2000),
    ].join('\n'),
  };
}

export async function gopsOpenIssue(title, body) {
  const repo = repoFull();
  const t = String(title || '').trim().slice(0, 200);
  const b = String(body || '').trim().slice(0, 8000);
  if (!t) return { ok: false, error: 'Usage: gops open Title | body text' };
  const r = await gh('/repos/' + repo + '/issues', {
    method: 'POST',
    json: {
      title: t,
      body: (b || '_Opened from Queen OS GOps 36A_') + '\n\n---\n_Queen OS · mobile Founder_',
    },
  });
  if (!r.ok) return r;
  const d = r.data || {};
  return {
    ok: true,
    text:
      '✅ Issue opened *#' +
      d.number +
      '*\n' +
      (d.title || t) +
      '\n' +
      (d.html_url || ''),
  };
}

export async function gopsActions(limit = 8) {
  const repo = repoFull();
  const r = await gh('/repos/' + repo + '/actions/runs?per_page=' + Math.min(12, limit));
  if (!r.ok) return r;
  const runs = r.data?.workflow_runs || [];
  if (!runs.length) return { ok: true, text: 'No workflow runs yet on `' + repo + '`' };
  const lines = ['⚙️ *Actions* (latest)', ''];
  for (const run of runs.slice(0, limit)) {
    const icon =
      run.conclusion === 'success'
        ? '✅'
        : run.conclusion === 'failure'
          ? '❌'
          : run.status === 'in_progress'
            ? '🔄'
            : '•';
    lines.push(
      icon +
        ' ' +
        (run.name || 'workflow') +
        ' · ' +
        (run.conclusion || run.status || '—') +
        ' · ' +
        (run.head_branch || '')
    );
    if (run.html_url) lines.push('  ' + run.html_url);
  }
  return { ok: true, text: lines.join('\n') };
}

export default {
  VERSION,
  gopsHelp,
  gopsRepo,
  gopsIssues,
  gopsIssue,
  gopsOpenIssue,
  gopsActions,
  repoFull,
  token,
};


/** Check latest Actions; emit signals; optional auto-issue if GOPS_AUTO_ISSUE=1 */
export async function gopsWatch() {
  const runs = await gopsActions(8);
  if (!runs.ok) {
    try {
      const { emitSignal } = await import('./signalManager.js');
      await emitSignal({
        kind: 'gops',
        source: 'gops_watch',
        title: 'GOps actions fetch failed',
        body: String(runs.error || 'fail').slice(0, 400),
        level: 'warn',
      });
    } catch (_) {}
    return { ok: false, error: runs.error, text: '❌ GOps watch: ' + runs.error };
  }
  const text = String(runs.text || '');
  const failed = /failure|failed|cancelled/i.test(text);
  const lines = ['👁 *GOps Watch · ' + VERSION + '*', ''];
  if (!failed) {
    lines.push('✅ No failed runs in latest Actions window');
    lines.push(text.split('\n').slice(0, 12).join('\n'));
    return { ok: true, failed: false, text: lines.join('\n') };
  }
  lines.push('🔴 Failed run(s) detected in latest Actions');
  lines.push(text.split('\n').slice(0, 16).join('\n'));
  try {
    const { emitSignal } = await import('./signalManager.js');
    await emitSignal({
      kind: 'ci',
      source: 'gops_watch',
      title: 'CI / Actions failure detected',
      body: text.slice(0, 800),
      level: 'error',
    });
    lines.push('', '📡 Signal emitted · `signal list`');
  } catch (_) {}
  const auto = String(process.env.GOPS_AUTO_ISSUE || '0') === '1';
  if (auto) {
    const issue = await gopsOpenIssue(
      'CI failure · Queen OS auto',
      'Auto-opened by gops watch.\n\n' + text.slice(0, 2500)
    );
    if (issue.ok) lines.push('✅ Auto issue opened');
    else lines.push('⚠️ Auto issue: ' + (issue.error || 'fail'));
  } else {
    lines.push('_Auto-issue OFF. Set GOPS_AUTO_ISSUE=1 to open GitHub issues._');
  }
  return { ok: true, failed: true, text: lines.join('\n') };
}
