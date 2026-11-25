/**
 * Deploy Gatekeeper · Wave 37-S3
 * Hobby-safe deploy budget awareness. Read-only + advice.
 */
'use strict';

const VERSION = '37-S3';

function safeRequire(path) {
  try {
    return require(path);
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

/**
 * Prefer existing deploy guardian if present.
 */
async function quickStatus() {
  const guard = safeRequire('./deployGuardian') || safeRequire('./deployManager');
  if (guard) {
    if (typeof guard.quickStatus === 'function') {
      const s = await safeCall(() => guard.quickStatus(), null);
      if (s) return s;
    }
    if (typeof guard.check === 'function') {
      const s = await safeCall(() => guard.check(), null);
      if (s && s.text) return { line: s.text.slice(0, 200), raw: s };
    }
  }

  // Lightweight local estimate
  const fnHint = '≤12 serverless (telegram/dash/cron/site/fs)';
  return {
    line: `🛡 Deploy Gate · Hobby · ${fnHint} · batch ZIP → 1 redeploy`,
    deploysHint: 'Check Vercel dashboard for /24h count',
    ok: true,
  };
}

async function advice() {
  const tips = [
    'Upload several files then **one** Redeploy (not per file).',
    'Hobby ~100 deployments / day — `gh` each file can burn 1 deploy.',
    'Keep `api/*.js` ≤ 12 (you are typically at 5).',
    'Syntax gate blocks bad JS before push — good.',
    'If limit hit: wait 24h or use Deploy Hook once.',
    'CI red → fix 1–2 files only, not full tree.',
  ];
  return tips;
}

async function formatStatus() {
  const st = await quickStatus();
  const tips = await advice();
  return [
    `🚧 *Deploy Gatekeeper · ${VERSION}*`,
    st.line || 'Deploy status unknown',
    st.deploysHint ? `· ${st.deploysHint}` : '',
    '',
    '*Hobby rules*',
    ...tips.map((t) => `· ${t}`),
    '',
    'Commands: `deploy gate` · `deploy advice` · `deploy check` (guardian)',
    '_Read-only · no auto redeploy._',
  ]
    .filter(Boolean)
    .join('\n');
}

function helpText() {
  return [
    `🚧 *Deploy Gatekeeper · ${VERSION}*`,
    'Protect Vercel Hobby budget',
    '',
    '• `deploy gate` / `dgate` — status + rules',
    '• `deploy advice` — batch tips',
    '• `deploy check` — existing guardian if installed',
    '',
    '_No auto deploy. Founder triggers redeploy._',
  ].join('\n');
}

module.exports = {
  VERSION,
  quickStatus,
  advice,
  formatStatus,
  helpText,
};
