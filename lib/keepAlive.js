/**
 * keepAlive.js — ping external sites so free hosts don't cold-sleep
 * Env:
 *   KEEP_ALIVE_URLS=https://site1,https://site2
 *   STRIDECLUB_URL=https://...   (alias, merged into list)
 * Interval: use cron-job.org every 5–10 min (NOT every 1 min)
 */
'use strict';

function parseUrls() {
  const raw = [
    process.env.KEEP_ALIVE_URLS || '',
    process.env.STRIDECLUB_URL || '',
    process.env.STRIDE_CLUB_URL || '',
    process.env.KEEPALIVE_URL || '',
  ].join(',');
  const seen = new Set();
  const out = [];
  raw.split(/[\s,]+/).forEach((u) => {
    u = String(u || '').trim();
    if (!u) return;
    if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
    if (seen.has(u)) return;
    seen.add(u);
    out.push(u);
  });
  return out;
}

export async function pingUrl(url, timeoutMs = 15000) {
  const started = Date.now();
  try {
    const r = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        'User-Agent': 'PasiyaOS-KeepAlive/1.0 (+Telegram bot)',
        Accept: 'text/html,application/json,*/*',
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    // Read a few bytes so some hosts count the request as "real"
    try {
      await r.text();
    } catch (_) {}
    return {
      ok: r.ok || (r.status >= 200 && r.status < 500),
      url: url,
      status: r.status,
      ms: Date.now() - started,
    };
  } catch (e) {
    return {
      ok: false,
      url: url,
      status: 0,
      ms: Date.now() - started,
      error: String(e.message || e),
    };
  }
}

export async function runKeepAlive(opts = {}) {
  const urls = parseUrls();
  if (!urls.length) {
    return {
      ok: false,
      job: 'keepalive',
      error:
        'No URLs. Set KEEP_ALIVE_URLS or STRIDECLUB_URL in Vercel env (full https://...).',
      results: [],
    };
  }
  const results = [];
  for (const u of urls) {
    results.push(await pingUrl(u, opts.timeoutMs || 15000));
  }
  const okN = results.filter((r) => r.ok).length;
  return {
    ok: okN > 0,
    job: 'keepalive',
    total: results.length,
    okCount: okN,
    results: results,
  };
}

export function formatKeepAliveReport(r) {
  if (!r) return 'keepalive: no result';
  if (r.error && !(r.results && r.results.length)) {
    return '🌐 KEEP-ALIVE\n❌ ' + r.error;
  }
  const lines = [
    '🌐 KEEP-ALIVE',
    'ok ' + (r.okCount || 0) + '/' + (r.total || 0),
    '',
  ];
  (r.results || []).forEach((x) => {
    lines.push(
      (x.ok ? '✅' : '❌') +
        ' HTTP ' +
        (x.status || '—') +
        ' · ' +
        (x.ms || 0) +
        'ms\n  ' +
        x.url +
        (x.error ? '\n  ' + x.error : '')
    );
  });
  lines.push('');
  lines.push('Tip: cron every 5–10 min (not every 1 min).');
  return lines.join('\n');
}

export async function jobKeepAlive() {
  return await runKeepAlive();
}

export default { runKeepAlive, pingUrl, formatKeepAliveReport, jobKeepAlive, parseUrls };
