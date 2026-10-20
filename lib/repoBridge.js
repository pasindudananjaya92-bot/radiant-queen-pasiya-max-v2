/**
 * lib/repoBridge.js — Multi-Repo Bridge (active_repo in Supabase bot_config)
 */
const DEFAULT_REPO =
  process.env.GITHUB_REPO || 'pasindudananjaya92-bot/radiant-queen-pasiya-max-v2';

export async function getActiveRepo(supabase) {
  if (!supabase) return { ok: true, repo: DEFAULT_REPO, source: 'env' };
  try {
    const { data, error } = await supabase
      .from('bot_config')
      .select('value')
      .eq('key', 'active_repo')
      .maybeSingle();
    if (error) return { ok: true, repo: DEFAULT_REPO, source: 'env', warn: error.message };
    if (data?.value) return { ok: true, repo: String(data.value).trim(), source: 'db' };
  } catch (e) {
    return { ok: true, repo: DEFAULT_REPO, source: 'env', warn: String(e.message || e) };
  }
  return { ok: true, repo: DEFAULT_REPO, source: 'default' };
}

export async function setActiveRepo(supabase, repo) {
  const r = String(repo || '').trim();
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(r)) {
    return { ok: false, error: 'Use owner/name format, e.g. user/repo' };
  }
  if (!supabase) return { ok: false, error: 'no supabase' };
  const { error } = await supabase.from('bot_config').upsert(
    { key: 'active_repo', value: r, updated_at: new Date().toISOString() },
    { onConflict: 'key' }
  );
  if (error) return { ok: false, error: error.message };
  return { ok: true, repo: r };
}

export async function githubRepoStatus(repo, token) {
  const t = token || process.env.GITHUB_TOKEN || '';
  if (!t) return { ok: false, error: 'GITHUB_TOKEN missing' };
  const res = await fetch('https://api.github.com/repos/' + repo, {
    headers: {
      Authorization: 'Bearer ' + t,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'pasiya-repo-bridge',
    },
  });
  const j = await res.json();
  if (!res.ok) return { ok: false, error: j.message || res.status };
  return {
    ok: true,
    full_name: j.full_name,
    default_branch: j.default_branch,
    private: j.private,
    pushed_at: j.pushed_at,
    description: (j.description || '').slice(0, 120),
  };
}

export function formatRepoStatus(active, gh) {
  const lines = [
    '📦 REPO BRIDGE',
    'Active: ' + (active.repo || '?') + ' (' + (active.source || '') + ')',
  ];
  if (gh?.ok) {
    lines.push(
      'Branch: ' + gh.default_branch,
      'Private: ' + gh.private,
      'Pushed: ' + gh.pushed_at,
      gh.description ? 'About: ' + gh.description : ''
    );
  } else if (gh && !gh.ok) {
    lines.push('GitHub: ' + gh.error);
  }
  lines.push('', 'Commands: /git status · /git switch owner/repo');
  return lines.filter(Boolean).join('\n');
}

export default { getActiveRepo, setActiveRepo, githubRepoStatus, formatRepoStatus };
