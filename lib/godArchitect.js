/**
 * lib/godArchitect.js — /architect scan + PR
 * Free: GitHub API + Groq. Founder-only.
 */
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const GITHUB_REPO =
  process.env.GITHUB_REPO || 'pasindudananjaya92-bot/radiant-queen-pasiya-max-v2';
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || 'main';
const GROQ_API_KEY = process.env.GROQ_API_KEY || '';

function ownerRepo() {
  const p = String(GITHUB_REPO).split('/');
  return { owner: p[0], repo: p[1] };
}

function ghHeaders() {
  return {
    Authorization: 'Bearer ' + GITHUB_TOKEN,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'pasiya-god-architect',
  };
}

const SCAN_PATHS = [
  'api/telegram.js',
  'lib/errorRadar.js',
  'lib/sqlCommander.js',
  'lib/swarm.js',
  'lib/chronos.js',
  'lib/galaxyGod.js',
  'lib/universeShell.js',
  'lib/liveCanvas.js',
  'package.json',
];

export async function fetchFile(path) {
  try {
    const { owner, repo } = ownerRepo();
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${encodeURIComponent(
      GITHUB_BRANCH
    )}`;
    const res = await fetch(url, { headers: ghHeaders() });
    if (!res.ok) return { ok: false, path, error: res.status };
    const j = await res.json();
    const text = Buffer.from(j.content || '', 'base64').toString('utf8');
    return { ok: true, path, text, sha: j.sha, size: text.length };
  } catch (e) {
    return { ok: false, path, error: e.message };
  }
}

export async function scanRepo(paths = SCAN_PATHS) {
  const files = [];
  const concurrency = 3;
  let idx = 0;
  async function worker() {
    while (true) {
      const i = idx++;
      if (i >= paths.length) break;
      const p = paths[i];
      const f = await fetchFile(p);
      if (f.ok) {
        files.push({
          path: f.path,
          size: f.size,
          preview: f.text.slice(0, 4000),
          sha: f.sha,
          text: f.text,
        });
      }
    }
  }
  const workers = Array.from({ length: concurrency }, worker);
  await Promise.all(workers);
  return files;
}

async function groqArchitect(files, focus) {
  if (!GROQ_API_KEY) {
    return {
      summary: 'GROQ_API_KEY missing — heuristic only',
      issues: files
        .filter((f) => f.size > 200000)
        .map((f) => ({
          path: f.path,
          severity: 'med',
          note: 'Very large file (' + f.size + ' bytes) — consider split',
        })),
      patches: [],
    };
  }
  const catalog = files
    .map((f) => `### ${f.path} (${f.size}b)\n${f.preview.slice(0, 2500)}`)
    .join('\n\n')
    .slice(0, 14000);
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + GROQ_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
      temperature: 0.2,
      max_tokens: 2000,
      messages: [
        {
          role: 'system',
          content:
            'You are God Architect for a Telegram bot on Vercel free tier. Reply ONLY valid JSON: {"summary":"...","issues":[{"path":"...","severity":"low|med|high","note":"..."}],"patches":[{"path":"...","title":"...","rationale":"...","search":"exact old snippet","replace":"new snippet"}]}. Max 3 patches. search must be unique exact substring from the file preview. Prefer safe refactors, no new paid APIs.',
        },
        {
          role: 'user',
          content:
            (focus ? 'Focus: ' + focus + '\n\n' : '') + 'Repo snapshot:\n' + catalog,
        },
      ],
    }),
  });
  const j = await res.json();
  let raw = j.choices?.[0]?.message?.content || '{}';
  raw = raw.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
  try {
    return JSON.parse(raw);
  } catch {
    return { summary: raw.slice(0, 500), issues: [], patches: [] };
  }
}

export async function putBranchFile(path, content, branch, message, sha) {
  const { owner, repo } = ownerRepo();
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
  const body = {
    message,
    content: Buffer.from(content, 'utf8').toString('base64'),
    branch,
  };
  if (sha) body.sha = sha;
  const res = await fetch(url, {
    method: 'PUT',
    headers: { ...ghHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const j = await res.json();
  if (!res.ok) return { ok: false, error: j.message || res.status };
  return { ok: true, url: j.content?.html_url };
}

export async function createBranch(fromSha, newBranch) {
  const { owner, repo } = ownerRepo();
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/git/refs`,
    {
      method: 'POST',
      headers: { ...ghHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ ref: 'refs/heads/' + newBranch, sha: fromSha }),
    }
  );
  const j = await res.json();
  if (!res.ok && !/already exists/i.test(j.message || '')) {
    return { ok: false, error: j.message || res.status };
  }
  return { ok: true, branch: newBranch };
}

export async function getMainSha() {
  const { owner, repo } = ownerRepo();
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/git/ref/heads/${GITHUB_BRANCH}`,
    { headers: ghHeaders() }
  );
  const j = await res.json();
  if (!res.ok) return { ok: false, error: j.message };
  return { ok: true, sha: j.object?.sha };
}

export async function openPR(title, head, body) {
  const { owner, repo } = ownerRepo();
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls`, {
    method: 'POST',
    headers: { ...ghHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title,
      head,
      base: GITHUB_BRANCH,
      body: body || 'Opened by PasiyaOS God Architect',
    }),
  });
  const j = await res.json();
  if (!res.ok) return { ok: false, error: j.message || res.status };
  return { ok: true, url: j.html_url, number: j.number };
}

/**
 * mode: scan | pr
 */
export async function runArchitect({ mode = 'scan', focus = '' } = {}) {
  if (!GITHUB_TOKEN) return { ok: false, error: 'GITHUB_TOKEN missing' };
  const files = await scanRepo();
  if (!files.length)
    return {
      ok: false,
      error: 'No files readable — check GITHUB_REPO/TOKEN',
    };
  const plan = await groqArchitect(files, focus);

  if (mode !== 'pr') {
    return {
      ok: true,
      mode: 'scan',
      summary: plan.summary,
      issues: plan.issues || [],
      patches: plan.patches || [],
      filesScanned: files.map((f) => f.path),
    };
  }

  const patches = (plan.patches || []).filter(
    (p) => p.path && p.search && p.replace
  );
  if (!patches.length) {
    return {
      ok: true,
      mode: 'pr',
      summary: plan.summary,
      issues: plan.issues || [],
      pr: null,
      note: 'No safe patches produced — scan-only result',
    };
  }

  const main = await getMainSha();
  if (!main.ok) return { ok: false, error: main.error };
  const branch = 'architect/' + Date.now().toString(36);
  const br = await createBranch(main.sha, branch);
  if (!br.ok) return { ok: false, error: br.error };

  const applied = [];
  for (const p of patches.slice(0, 3)) {
    const file = files.find((f) => f.path === p.path);
    if (!file) continue;
    if (!file.text.includes(p.search)) {
      applied.push({
        path: p.path,
        ok: false,
        error: 'search snippet not found',
      });
      continue;
    }
    const next = file.text.replace(p.search, p.replace);
    // re-fetch sha on branch tip — use main file sha first put
    const put = await putBranchFile(
      p.path,
      next,
      branch,
      'architect: ' + (p.title || p.path),
      file.sha
    );
    applied.push({
      path: p.path,
      ok: put.ok,
      error: put.error,
      title: p.title,
    });
    if (put.ok) file.sha = undefined; // next patch same file would need fresh sha — limit 1 patch per file
  }

  const okCount = applied.filter((a) => a.ok).length;
  if (!okCount) {
    return {
      ok: true,
      mode: 'pr',
      summary: plan.summary,
      applied,
      pr: null,
      note: 'Patches failed to apply',
    };
  }

  const pr = await openPR(
    'architect: ' + (plan.summary || 'improvements').slice(0, 60),
    branch,
    [
      '## God Architect',
      plan.summary || '',
      '',
      '### Applied',
      ...applied.map((a) => '- ' + a.path + (a.ok ? ' ✅' : ' ❌ ' + a.error)),
    ].join('\n')
  );

  return {
    ok: true,
    mode: 'pr',
    summary: plan.summary,
    issues: plan.issues || [],
    applied,
    pr: pr.ok ? pr : null,
    prError: pr.ok ? null : pr.error,
    branch,
  };
}

export function formatArchitect(r) {
  if (!r.ok) return '❌ Architect: ' + r.error;
  const lines = [
    '🏛 GOD ARCHITECT · ' + (r.mode || 'scan').toUpperCase(),
    '',
    r.summary || '',
    '',
  ];
  if (r.filesScanned?.length) {
    lines.push('Scanned: ' + r.filesScanned.join(', '));
    lines.push('');
  }
  for (const i of r.issues || []) {
    lines.push('• [' + (i.severity || '?') + '] ' + (i.path || '') + ' — ' + (i.note || ''));
  }
  if (r.patches?.length && r.mode === 'scan') {
    lines.push('', 'Proposed patches: ' + r.patches.length + ' (run /architect pr to open PR)');
    for (const p of r.patches) {
      lines.push('  → ' + p.path + ': ' + (p.title || p.rationale || '').slice(0, 80));
    }
  }
  if (r.applied?.length) {
    lines.push('', 'Applied:');
    for (const a of r.applied) {
      lines.push((a.ok ? '  ✅ ' : '  ❌ ') + a.path + (a.error ? ' · ' + a.error : ''));
    }
  }
  if (r.pr?.url) lines.push('', 'PR: ' + r.pr.url);
  if (r.prError) lines.push('PR error: ' + r.prError);
  if (r.note) lines.push(r.note);
  return lines.join('\n').slice(0, 3900);
}

export default { runArchitect, formatArchitect, scanRepo };