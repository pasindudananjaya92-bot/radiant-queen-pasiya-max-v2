const VERSION = '37-S3.1';

async function safeImport(path) {
  try {
    return await import(path);
  } catch (_) {
    return null;
  }
}

async function safeCall(fn, fallback) {
  try {
    if (typeof fn !== 'function') return fallback;
    return await fn();
  } catch (_) {
    return fallback;
  }
}

export async function quickStatus() {
  let guard = await safeImport('./deployGuardian.js');
  if (!guard) guard = await safeImport('./deployManager.js');
  if (guard) {
    if (typeof guard.quickStatus === 'function') {
      const s = await safeCall(() => guard.quickStatus(), null);
      if (s) return s;
    }
    if (typeof guard.check === 'function') {
      const s = await safeCall(() => guard.check(), null);
      if (s && s.text) return { line: String(s.text).slice(0, 200), raw: s };
    }
  }
  return {
    line: '🛡 Deploy Gate · Hobby · ≤12 api/*.js · batch ZIP → 1 redeploy',
    deploysHint: 'Check Vercel dashboard for /24h count · ~100/day Hobby',
    ok: true,
  };
}

export async function advice() {
  return [
    'Upload several files then **one** Redeploy (not per file).',
    'Hobby ~100 deployments / day — each `gh` file can burn 1 deploy.',
    'Keep `api/*.js` ≤ 12 (you are typically at 5).',
    'Syntax gate blocks bad JS before push — good.',
    'If limit hit: wait 24h or use Deploy Hook once.',
    'CI red → fix 1–2 files only, not full tree.',
  ];
}

export async function formatStatus() {
  const st = await quickStatus();
  const tips = await advice();
  return [
    '🚧 *Deploy Gatekeeper · ' + VERSION + '*',
    st.line || 'Deploy status unknown',
    st.deploysHint ? '· ' + st.deploysHint : '',
    '',
    '*Hobby rules*',
    ...tips.map((t) => '· ' + t),
    '',
    'Commands: `dgate` · `deploy gate` · `deploy advice` · `deploy check`',
    '_Read-only · no auto redeploy._',
  ]
    .filter(Boolean)
    .join('\n');
}

export function helpText() {
  return [
    '🚧 *Deploy Gatekeeper · ' + VERSION + '*',
    'Protect Vercel Hobby budget',
    '',
    '• `dgate` / `deploy gate` — status + rules',
    '• `deploy advice` — batch tips',
    '• `deploy check` — existing guardian',
    '',
    '_No auto deploy. Founder triggers redeploy._',
  ].join('\n');
}

export default { VERSION, quickStatus, advice, formatStatus, helpText };
