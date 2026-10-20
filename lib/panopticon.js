/**
 * lib/panopticon.js — S4 Zero-Day Shield (free)
 *
 * Sources (no paid keys):
 *  1) package.json from GitHub → OSV.dev batch query (npm ecosystem)
 *  2) GitHub Dependabot alerts (if GITHUB_TOKEN has access; else soft-skip)
 *  3) Optional GitHub code scanning alerts (soft-skip)
 *
 * Never runs shell `npm audit` on Vercel (no reliable local node_modules).
 */

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const GITHUB_REPO = process.env.GITHUB_REPO || 'pasindudananjaya92-bot/radiant-queen-pasiya-max-v2';
const OSV_URL = 'https://api.osv.dev/v1/querybatch';

function ownerRepo() {
  const p = String(GITHUB_REPO).split('/');
  return { owner: p[0] || '', repo: p[1] || '' };
}

function ghHeaders() {
  return {
    Authorization: 'Bearer ' + GITHUB_TOKEN,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'pasiya-panopticon',
  };
}

async function fetchPackageJson() {
  const { owner, repo } = ownerRepo();
  if (!GITHUB_TOKEN || !owner || !repo) {
    return { ok: false, error: 'GITHUB_TOKEN / GITHUB_REPO missing' };
  }
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/package.json`;
  const res = await fetch(url, { headers: ghHeaders() });
  const j = await res.json();
  if (!res.ok) return { ok: false, error: j.message || 'package.json fetch failed' };
  const raw = Buffer.from(String(j.content || '').replace(/\n/g, ''), 'base64').toString('utf8');
  let pkg;
  try {
    pkg = JSON.parse(raw);
  } catch (e) {
    return { ok: false, error: 'package.json parse: ' + e.message };
  }
  const deps = {
    ...(pkg.dependencies || {}),
    ...(pkg.devDependencies || {}),
  };
  return { ok: true, deps, name: pkg.name || repo, version: pkg.version || '' };
}

/** Normalize version for OSV (strip ^ ~ >=) */
function cleanVersion(v) {
  return String(v || '')
    .replace(/^[\^~>=<\s]+/, '')
    .split(/\s+/)[0]
    .trim();
}

async function queryOsv(deps) {
  const entries = Object.entries(deps || {}).slice(0, 80); // free-tier friendly
  if (!entries.length) return { ok: true, vulns: [], scanned: 0 };

  const queries = entries.map(([name, ver]) => ({
    package: { name, ecosystem: 'npm' },
    version: cleanVersion(ver) || undefined,
  }));

  // OSV allows batch
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 25000);
  let res;
  try {
    res = await fetch(OSV_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ queries }),
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(t);
  }
  if (!res.ok) {
    const text = await res.text();
    return { ok: false, error: 'OSV HTTP ' + res.status + ': ' + text.slice(0, 160) };
  }
  const data = await res.json();
  const results = data.results || [];
  const vulns = [];
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const list = r.vulns || [];
    if (!list.length) continue;
    const [name, ver] = entries[i];
    for (const v of list.slice(0, 5)) {
      vulns.push({
        package: name,
        version: cleanVersion(ver),
        id: v.id || 'unknown',
        summary: (v.summary || v.details || '').slice(0, 160),
      });
    }
  }
  // severity sort-ish: GHSA/CVE ids first
  vulns.sort((a, b) => String(a.id).localeCompare(String(b.id)));
  return { ok: true, vulns, scanned: entries.length };
}

async function fetchDependabotAlerts() {
  const { owner, repo } = ownerRepo();
  if (!GITHUB_TOKEN) return { ok: false, skipped: true, reason: 'no token' };
  const url = `https://api.github.com/repos/${owner}/${repo}/dependabot/alerts?state=open&per_page=20`;
  const res = await fetch(url, {
    headers: {
      ...ghHeaders(),
      Accept: 'application/vnd.github+json',
    },
  });
  if (res.status === 403 || res.status === 404) {
    return {
      ok: true,
      skipped: true,
      reason:
        'Dependabot alerts not available (enable Dependabot + token needs security scope / repo admin)',
      alerts: [],
    };
  }
  const j = await res.json();
  if (!res.ok) {
    return { ok: false, error: j.message || 'dependabot ' + res.status, alerts: [] };
  }
  const alerts = (Array.isArray(j) ? j : []).map((a) => ({
    number: a.number,
    severity: a.security_advisory?.severity || a.security_vulnerability?.severity || 'unknown',
    package: a.security_vulnerability?.package?.name || a.dependency?.package?.name || '?',
    summary: (a.security_advisory?.summary || '').slice(0, 120),
    state: a.state,
  }));
  return { ok: true, alerts, skipped: false };
}

/**
 * Full panopticon scan
 */
export async function runPanopticonScan() {
  const started = Date.now();
  const report = {
    ok: true,
    at: new Date().toISOString(),
    repo: GITHUB_REPO,
    package: null,
    osv: null,
    dependabot: null,
    ms: 0,
  };

  const pkg = await fetchPackageJson();
  if (!pkg.ok) {
    report.ok = false;
    report.error = pkg.error;
    report.ms = Date.now() - started;
    return report;
  }
  report.package = { name: pkg.name, version: pkg.version, depCount: Object.keys(pkg.deps).length };

  const osv = await queryOsv(pkg.deps);
  report.osv = osv;
  if (!osv.ok) report.ok = false;

  const dep = await fetchDependabotAlerts();
  report.dependabot = dep;

  report.ms = Date.now() - started;
  report.summary = {
    depsScanned: osv.scanned || 0,
    osvVulns: (osv.vulns || []).length,
    dependabotOpen: (dep.alerts || []).length,
    dependabotSkipped: !!dep.skipped,
  };
  return report;
}

export function formatPanopticonReport(report) {
  if (!report) return 'No report';
  const lines = [
    '🕶 PANOPTICON · Zero-Day Shield',
    'Time: ' + (report.at || ''),
    'Repo: ' + (report.repo || ''),
    'ms: ' + (report.ms || '?'),
    '',
  ];
  if (report.error) {
    lines.push('❌ ' + report.error);
    return lines.join('\n');
  }
  if (report.package) {
    lines.push(
      'package.json: ' +
        report.package.name +
        '@' +
        (report.package.version || '?') +
        ' · deps=' +
        report.package.depCount
    );
  }
  const s = report.summary || {};
  lines.push(
    'OSV scanned: ' +
      (s.depsScanned || 0) +
      ' · findings: ' +
      (s.osvVulns || 0)
  );
  lines.push(
    'Dependabot open: ' +
      (s.dependabotOpen || 0) +
      (s.dependabotSkipped ? ' (skipped — enable in GitHub)' : '')
  );
  lines.push('');

  const vulns = report.osv?.vulns || [];
  if (vulns.length) {
    lines.push('— OSV findings (max 12) —');
    for (const v of vulns.slice(0, 12)) {
      lines.push(
        '• ' +
          v.package +
          '@' +
          v.version +
          ' · ' +
          v.id +
          (v.summary ? '\n  ' + v.summary.slice(0, 100) : '')
      );
    }
  } else if (report.osv?.ok) {
    lines.push('✅ OSV: no known vulns for pinned versions queried');
  } else if (report.osv?.error) {
    lines.push('OSV error: ' + report.osv.error);
  }

  const alerts = report.dependabot?.alerts || [];
  if (alerts.length) {
    lines.push('', '— Dependabot open —');
    for (const a of alerts.slice(0, 10)) {
      lines.push(
        '• #' +
          a.number +
          ' [' +
          a.severity +
          '] ' +
          a.package +
          (a.summary ? ' — ' + a.summary : '')
      );
    }
  } else if (report.dependabot?.skipped) {
    lines.push('', 'Dependabot: ' + (report.dependabot.reason || 'skipped'));
  }

  lines.push('', 'Tips: bump deps · enable Dependabot in GitHub → Security');
  lines.push('Commands: /secreport · /checkvulns');
  return lines.join('\n').slice(0, 3900);
}

export default { runPanopticonScan, formatPanopticonReport };
