/**
 * Lightweight GitHub upload (fallback when ghHeal path fails)
 * Used by telegram document handler for: caption "gh path/to/file"
 */
export async function githubPutFile({ path, content, message }) {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO; // owner/name
  if (!token || !repo) {
    throw new Error('Set GITHUB_TOKEN + GITHUB_REPO=owner/name');
  }
  const api = 'https://api.github.com/repos/' + repo + '/contents/' + path.replace(/^\/+/, '');
  const headers = {
    Authorization: 'Bearer ' + token,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'pasiyaOS-bot',
    'Content-Type': 'application/json',
  };

  // get existing sha
  let sha = null;
  const get = await fetch(api, { headers });
  if (get.status === 200) {
    const j = await get.json();
    sha = j.sha;
  } else if (get.status !== 404) {
    const t = await get.text();
    throw new Error('GitHub GET ' + get.status + ': ' + t.slice(0, 200));
  }

  const body = {
    message: message || ('bot: update ' + path),
    content: Buffer.from(content, 'utf8').toString('base64'),
    ...(sha ? { sha } : {}),
  };
  const put = await fetch(api, {
    method: 'PUT',
    headers,
    body: JSON.stringify(body),
  });
  const out = await put.text();
  if (!put.ok) {
    throw new Error('GitHub PUT ' + put.status + ': ' + out.slice(0, 300));
  }
  let j = {};
  try {
    j = JSON.parse(out);
  } catch (_) {}
  return {
    ok: true,
    path,
    commit: j.commit?.sha || null,
    url: j.content?.html_url || null,
  };
}

/** Minimal syntax gate for JS before push */
export function quickSyntaxGate(source, filePath) {
  const s = String(source || '');
  const isJs = /\.(js|mjs|cjs)$/i.test(filePath || '');
  if (!isJs) return { ok: true };
  const opens = (s.match(/\{/g) || []).length;
  const closes = (s.match(/\}/g) || []).length;
  if (opens !== closes) {
    return {
      ok: false,
      error: 'unbalanced braces { } diff=' + (opens - closes),
    };
  }
  const po = (s.match(/\(/g) || []).length;
  const pc = (s.match(/\)/g) || []).length;
  if (po !== pc) {
    return {
      ok: false,
      error: 'unbalanced parens ( ) diff=' + (po - pc),
    };
  }
  return { ok: true };
}

export default { githubPutFile, quickSyntaxGate };
