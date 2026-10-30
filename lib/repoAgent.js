/**
 * repoAgent.js — Agent-11 Multi-Repo Lite
 * Uses GITHUB_REPO + MULTI_REPOS (comma-separated owner/name)
 * Optional Supabase bot_config.active_repo via repoBridge if present
 */
'use strict';

function parseList() {
  const primary = String(process.env.GITHUB_REPO || '').trim();
  const extra = String(process.env.MULTI_REPOS || process.env.GITHUB_REPOS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const all = [];
  if (primary) all.push(primary);
  extra.forEach((r) => {
    if (r && all.indexOf(r) === -1) all.push(r);
  });
  return all;
}

export async function listRepos() {
  let active = String(process.env.GITHUB_REPO || '').trim();
  try {
    const bridge = await import('./repoBridge.js');
    if (typeof bridge.getActiveRepo === 'function') {
      const a = await bridge.getActiveRepo();
      if (a) active = String(a);
    }
  } catch (_) {}
  const repos = parseList();
  if (!repos.length) {
    return (
      'No repos configured.\n' +
      'Set GITHUB_REPO=owner/name\n' +
      'Optional MULTI_REPOS=owner/a,owner/b'
    );
  }
  const lines = ['📦 REPOS · active: ' + (active || '—'), ''];
  repos.forEach((r, i) => {
    lines.push((i + 1) + '. ' + r + (r === active ? '  ← active' : ''));
  });
  lines.push('', 'switch repo owner/name');
  return lines.join('\n');
}

export async function switchRepo(name) {
  const target = String(name || '')
    .trim()
    .replace(/^switch\s+repo\s+/i, '');
  if (!target || !target.includes('/')) {
    return 'Usage: switch repo owner/name';
  }
  const allowed = parseList();
  if (allowed.length && allowed.indexOf(target) === -1) {
    // still allow if founder sets any — warn
  }
  try {
    const bridge = await import('./repoBridge.js');
    if (typeof bridge.setActiveRepo === 'function') {
      await bridge.setActiveRepo(target);
      return '✅ Active repo → ' + target + '\n(via repoBridge / bot_config)';
    }
  } catch (_) {}
  return (
    '⚠ repoBridge.setActiveRepo not available.\n' +
    'Set Vercel env GITHUB_REPO=' +
    target +
    ' and redeploy.\n' +
    'Or add MULTI_REPOS and implement repoBridge.'
  );
}

export async function repoStatus() {
  try {
    const bridge = await import('./repoBridge.js');
    if (typeof bridge.status === 'function') return await bridge.status();
    if (typeof bridge.getStatus === 'function') return await bridge.getStatus();
  } catch (_) {}
  const active = String(process.env.GITHUB_REPO || '').trim();
  return (
    '📦 REPO STATUS\n' +
    'GITHUB_REPO: ' +
    (active || '—') +
    '\nMULTI_REPOS: ' +
    (process.env.MULTI_REPOS || process.env.GITHUB_REPOS || '—') +
    '\nToken: ' +
    (process.env.GITHUB_TOKEN ? 'yes' : 'no')
  );
}

export default { listRepos, switchRepo, repoStatus };
