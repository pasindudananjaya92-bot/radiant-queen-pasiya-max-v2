/**
 * V6000 Multi-file Surgeon context
 * Pulls target file + shallow imports from GitHub for /debug
 */
const GH_API = 'https://api.github.com';

function repoParts() {
  const raw = String(process.env.GITHUB_REPO || '').trim();
  if (raw.includes('/')) {
    const [o, r] = raw.split('/');
    return { owner: o, repo: r };
  }
  return {
    owner: process.env.GITHUB_OWNER || '',
    repo: process.env.GITHUB_REPO_NAME || process.env.GITHUB_REPO || '',
  };
}

function token() {
  return (
    process.env.GITHUB_TOKEN ||
    process.env.GH_TOKEN ||
    process.env.GITHUB_PAT ||
    ''
  );
}

export async function ghGet(path) {
  const { owner, repo } = repoParts();
  const t = token();
  if (!owner || !repo || !t) throw new Error('GITHUB_REPO / GITHUB_TOKEN missing');
  const url =
    GH_API +
    '/repos/' +
    owner +
    '/' +
    repo +
    '/contents/' +
    String(path).replace(/^\//, '');
  const res = await fetch(url, {
    headers: {
      Authorization: 'Bearer ' + t,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'PasiyaOS-Surgeon/6000',
    },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j.message || 'GitHub ' + res.status + ' for ' + path);
  }
  const j = await res.json();
  if (j.encoding === 'base64' && j.content) {
    return {
      path: j.path || path,
      sha: j.sha,
      content: Buffer.from(j.content.replace(/\n/g, ''), 'base64').toString('utf8'),
    };
  }
  throw new Error('Unexpected GitHub content for ' + path);
}

/** Extract relative ./ and ../ imports from JS source */
export function extractLocalImports(source, fromPath) {
  const s = String(source || '');
  const dir = String(fromPath || '')
    .replace(/\\/g, '/')
    .split('/')
    .slice(0, -1)
    .join('/');
  const re =
    /(?:import|export)\s+(?:[^'";]+?\s+from\s+)?['"](\.[^'"]+)['"]|require\s*\(\s*['"](\.[^'"]+)['"]\s*\)/g;
  const found = new Set();
  let m;
  while ((m = re.exec(s))) {
    let rel = m[1] || m[2];
    if (!rel) continue;
    if (!rel.endsWith('.js') && !rel.endsWith('.mjs') && !rel.endsWith('.cjs')) {
      rel = rel + '.js';
    }
    // resolve relative to fromPath directory
    const stack = (dir ? dir.split('/') : []).filter(Boolean);
    for (const part of rel.split('/')) {
      if (part === '.' || part === '') continue;
      if (part === '..') stack.pop();
      else stack.push(part);
    }
    found.add(stack.join('/'));
  }
  return [...found].slice(0, 6);
}

/**
 * Build multi-file context string for the Surgeon prompt.
 * Returns { target, related: [{path,content}], contextBlock }
 */
export async function buildSurgeonContext(targetPath) {
  const target = await ghGet(targetPath);
  const imports = extractLocalImports(target.content, target.path);
  const related = [];
  for (const p of imports) {
    try {
      const f = await ghGet(p);
      // cap each related file
      related.push({
        path: f.path,
        content: f.content.slice(0, 12000),
        sha: f.sha,
      });
    } catch (_) {
      related.push({ path: p, content: '/* fetch failed */', sha: null });
    }
  }
  let contextBlock =
    '=== TARGET FILE: ' +
    target.path +
    ' ===\n' +
    target.content +
    '\n=== END TARGET ===\n';
  for (const r of related) {
    contextBlock +=
      '\n=== RELATED (read-only context): ' +
      r.path +
      ' ===\n' +
      r.content +
      '\n=== END RELATED ===\n';
  }
  return { target, related, imports, contextBlock };
}

/** Lightweight brace/paren balance (same idea as phaseADebug) */
export function quickSyntaxHints(src) {
  const s = String(src || '');
  const issues = [];
  const count = (ch) => (s.match(new RegExp('\\' + ch, 'g')) || []).length;
  if (count('{') !== count('}')) issues.push('unbalanced {}');
  if (count('(') !== count(')')) issues.push('unbalanced ()');
  if (count('[') !== count(']')) issues.push('unbalanced []');
  if (/restParts/.test(s) && !/\.\.\.restParts/.test(s) && !/restParts\s*=/.test(s)) {
    issues.push('restParts used but undefined');
  }
  return issues;
}

export default { buildSurgeonContext, extractLocalImports, quickSyntaxHints, ghGet };
