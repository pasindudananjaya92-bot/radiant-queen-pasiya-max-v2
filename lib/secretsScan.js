/**
 * lib/secretsScan.js — /secrets leak scanner (founder)
 * Simple patterns, no nested regex hell
 */
const REPO = process.env.GITHUB_REPO || 'pasindudananjaya92-bot/radiant-queen-pasiya-max-v2';

function authHeaders() {
  const t = process.env.GITHUB_TOKEN || '';
  return {
    Authorization: 'Bearer ' + t,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'PasiyaOS-Secrets',
  };
}

const PATHS = [
  'api/telegram.js',
  'api/cron.js',
  'api/fs.js',
  'api/health.js',
  'lib/fortress.js',
  'lib/sqlCommander.js',
  'lib/galaxyGod.js',
  'lib/ghHeal.js',
  'lib/neuralMemory.js',
  'lib/prReview.js',
  'vercel.json',
  'package.json',
  '.env.example',
  'README.md',
];

function findLeaks(text, path) {
  const hits = [];
  const rules = [
    ['AWS Key', /AKIA[0-9A-Z]{16}/],
    ['GitHub PAT', /ghp_[A-Za-z0-9]{20,}/],
    ['GitHub Fine PAT', /github_pat_[A-Za-z0-9_]{20,}/],
    ['OpenAI-ish', /sk-[A-Za-z0-9]{20,}/],
    ['Telegram token', /[0-9]{8,12}:[A-Za-z0-9_-]{30,}/],
    ['Private key', /BEGIN [A-Z ]*PRIVATE KEY/],
    ['Slack', /xox[baprs]-[0-9A-Za-z-]{10,}/],
    ['Bearer long', /Bearer [A-Za-z0-9._-]{30,}/],
  ];
  for (let i = 0; i < rules.length; i++) {
    const name = rules[i][0];
    const re = rules[i][1];
    const m = text.match(re);
    if (m) {
      hits.push({
        path: path,
        rule: name,
        snippet: String(m[0]).slice(0, 24) + '...',
      });
    }
  }
  return hits;
}

async function fetchFile(path) {
  const token = process.env.GITHUB_TOKEN || '';
  if (!token) return { ok: false, error: 'no token' };
  const enc = path.split('/').map(encodeURIComponent).join('/');
  const url = 'https://api.github.com/repos/' + REPO + '/contents/' + enc;
  try {
    const res = await fetch(url, { headers: authHeaders() });
    if (res.status === 404) return { ok: false, missing: true };
    if (!res.ok) return { ok: false, error: 'HTTP ' + res.status };
    const j = await res.json();
    if (!j.content) return { ok: false, error: 'no content' };
    const text = Buffer.from(String(j.content).replace(/\n/g, ''), 'base64').toString('utf8');
    return { ok: true, text: text, path: path };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
}

export async function runSecretsScan() {
  if (!process.env.GITHUB_TOKEN) {
    return { ok: false, error: 'GITHUB_TOKEN missing' };
  }
  const findings = [];
  let scanned = 0;
  for (let i = 0; i < PATHS.length; i++) {
    const f = await fetchFile(PATHS[i]);
    if (f.missing) continue;
    if (!f.ok) continue;
    scanned++;
    if (f.text.length > 800000) continue;
    const hits = findLeaks(f.text, PATHS[i]);
    for (let h = 0; h < hits.length; h++) {
      findings.push(hits[h]);
    }
  }
  return { ok: true, scanned: scanned, findings: findings.slice(0, 20) };
}

export function formatSecrets(r) {
  if (!r.ok) return 'Secrets: ' + (r.error || 'fail');
  if (!r.findings || !r.findings.length) {
    return (
      'SECRETS SCAN\nScanned: ' +
      r.scanned +
      ' files\nOK - no high-confidence leaks in common paths.\nNever commit .env'
    );
  }
  let out = 'SECRETS SCAN - ' + r.findings.length + ' hit(s)\nScanned: ' + r.scanned + '\n\n';
  for (let i = 0; i < r.findings.length; i++) {
    const h = r.findings[i];
    out += i + 1 + '. [' + h.rule + '] ' + h.path + '\n   ' + h.snippet + '\n';
  }
  out += '\nRotate real keys if any match production.';
  return out.slice(0, 3900);
}

export default { runSecretsScan: runSecretsScan, formatSecrets: formatSecrets };
