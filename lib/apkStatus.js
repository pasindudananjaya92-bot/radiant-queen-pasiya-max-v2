/**
 * Read latest GitHub Actions APK workflow run (optional GITHUB_TOKEN).
 */
export async function getApkStatus() {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
  const repo =
    process.env.GITHUB_REPO ||
    process.env.GH_REPO ||
    process.env.VERCEL_GIT_REPO_OWNER
      ? `${process.env.VERCEL_GIT_REPO_OWNER}/${process.env.VERCEL_GIT_REPO_SLUG || 'radiant-queen-pasiya-max-v2'}`
      : '';
  const workflow = process.env.APK_WORKFLOW_FILE || 'build-queen-apk.yml';
  const pwaUrl =
    process.env.QUEEN_PWA_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}/dashboard.html`
      : '');

  if (!token || !repo || !repo.includes('/')) {
    return {
      ok: true,
      configured: false,
      pwa_url: pwaUrl,
      message:
        'Set GITHUB_TOKEN + GITHUB_REPO (owner/name) in Vercel to show live build status. APK still builds via Actions on push.',
      actions_url: repo ? `https://github.com/${repo}/actions` : null,
    };
  }

  try {
    const runsUrl = `https://api.github.com/repos/${repo}/actions/workflows/${workflow}/runs?per_page=1`;
    const res = await fetch(runsUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'QueenOS-Dash',
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      return {
        ok: false,
        configured: true,
        error: `GitHub API ${res.status}`,
        actions_url: `https://github.com/${repo}/actions`,
        pwa_url: pwaUrl,
      };
    }
    const data = await res.json();
    const run = (data.workflow_runs || [])[0];
    if (!run) {
      return {
        ok: true,
        configured: true,
        has_run: false,
        message: 'No workflow runs yet — push to main or run workflow_dispatch',
        actions_url: `https://github.com/${repo}/actions`,
        pwa_url: pwaUrl,
      };
    }
    return {
      ok: true,
      configured: true,
      has_run: true,
      status: run.status,
      conclusion: run.conclusion,
      html_url: run.html_url,
      display_title: run.display_title,
      created_at: run.created_at,
      updated_at: run.updated_at,
      head_branch: run.head_branch,
      actions_url: `https://github.com/${repo}/actions`,
      pwa_url: pwaUrl,
      artifact_hint: 'Open the run → Artifacts → queen-os-apk',
    };
  } catch (e) {
    return { ok: false, configured: true, error: e.message || String(e), pwa_url: pwaUrl };
  }
}
