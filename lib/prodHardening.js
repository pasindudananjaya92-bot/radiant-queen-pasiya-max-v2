/**
 * prodHardening.js — Agent-15 Production Hardening
 * - env/radar snapshot
 * - cron endpoint health (dry list)
 * - deploy-limit tips
 * - safer chain resume helper text
 * - unified seal checklist through Agent-16
 */
'use strict';

function envYes(k) {
  return Boolean(String(process.env[k] || '').trim());
}

export function deployLimitTips() {
  return [
    '📉 DEPLOY LIMIT AWARENESS (Vercel Hobby ~100/day)',
    '• Batch file uploads → one Redeploy at the end',
    '• Prefer `gh lib/...` then single Redeploy, not per-file',
    '• Avoid editing api/telegram.js unless required',
    '• Hull B: redeploy only when hull-b/lib changes',
    '• If limit hit: wait UTC reset, use GitHub web only for emergencies',
  ].join('\n');
}

export async function prodStatus() {
  const keys = [
    ['BOT_TOKEN', envYes('BOT_TOKEN')],
    ['ADMIN_ID', envYes('ADMIN_ID')],
    ['GROQ_API_KEY', envYes('GROQ_API_KEY')],
    ['GEMINI_API_KEY', envYes('GEMINI_API_KEY')],
    ['OPENROUTER_API_KEY', envYes('OPENROUTER_API_KEY')],
    ['GITHUB_TOKEN', envYes('GITHUB_TOKEN') || envYes('GH_TOKEN')],
    ['SUPABASE_URL', envYes('SUPABASE_URL')],
    ['SUPABASE_SERVICE_ROLE_KEY', envYes('SUPABASE_SERVICE_ROLE_KEY') || envYes('SUPABASE_KEY')],
    ['VERCEL_TOKEN', envYes('VERCEL_TOKEN')],
    ['TAVILY_API_KEY', envYes('TAVILY_API_KEY')],
    ['CRON_SECRET', envYes('CRON_SECRET')],
    ['HULL_B_URL', envYes('HULL_B_URL')],
    ['HULL_MODE', process.env.HULL_MODE || '—'],
    ['SOCIAL_CHANNEL_ID', envYes('SOCIAL_CHANNEL_ID')],
    ['MAKE_SOCIAL_WEBHOOK', envYes('MAKE_SOCIAL_WEBHOOK')],
    ['FB_PAGE_ID', envYes('FB_PAGE_ID')],
    ['FB_PAGE_TOKEN', envYes('FB_PAGE_TOKEN')],
    ['GITHUB_REPO', process.env.GITHUB_REPO || '—'],
  ];

  const lines = ['🛡 PRODUCTION STATUS · Agent-15', ''];
  keys.forEach(function (pair) {
    const k = pair[0];
    const v = pair[1];
    if (typeof v === 'boolean') {
      lines.push((v ? '✅ ' : '❌ ') + k);
    } else {
      lines.push('• ' + k + ': ' + v);
    }
  });
  lines.push('');
  lines.push('HULL_MODE=' + (process.env.HULL_MODE || 'local'));
  lines.push('Prometheus: OFF (safe)');
  lines.push('API functions: keep ≤12 on Hobby');
  lines.push('');
  lines.push(deployLimitTips());
  return lines.join('\n');
}

export async function cronHealth() {
  const secret = process.env.CRON_SECRET || '';
  const jobs = [
    'ghost',
    'track',
    'watch',
    'reminders',
    'digest',
    'news_podcast',
    'shadow',
    'hullpoll',
    'dna',
    'phaseg',
    'swarmdigest',
    'socialdigest',
    'all',
  ];
  const lines = [
    '⏱ CRON HEALTH',
    'CRON_SECRET: ' + (secret ? 'set' : 'MISSING'),
    'HULL_B_URL: ' + (process.env.HULL_B_URL || '—'),
    'HULL_MODE: ' + (process.env.HULL_MODE || '—'),
    'Registered jobs:',
    '  ' + jobs.join(', '),
    '',
  ];

  if (!secret) {
    lines.push('⚠ Set CRON_SECRET then point cron-job.org to:');
    lines.push('  /api/cron?job=phaseg&secret=YOUR_SECRET');
    lines.push('  /api/cron?job=swarmdigest&secret=YOUR_SECRET');
    lines.push('  /api/cron?job=socialdigest&secret=YOUR_SECRET');
    return lines.join('\n');
  }

  // Prefer explicit public URL — VERCEL_URL often points at a host that returns HTML
  let baseUrl = String(
    process.env.BOT_PUBLIC_URL ||
      process.env.PUBLIC_BASE_URL ||
      process.env.CRON_BASE_URL ||
      ''
  ).trim();
  if (!baseUrl && process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    baseUrl = 'https://' + String(process.env.VERCEL_PROJECT_PRODUCTION_URL).replace(/^https?:\/\//, '');
  }
  if (!baseUrl && process.env.VERCEL_URL) {
    baseUrl = 'https://' + String(process.env.VERCEL_URL).replace(/^https?:\/\//, '');
  }

  if (!baseUrl) {
    lines.push('✅ Secret set — static job list OK');
    lines.push('ℹ No public base URL in env (set BOT_PUBLIC_URL=https://your-app.vercel.app)');
    lines.push('Manual: GET /api/cron?job=help&secret=CRON_SECRET');
    return lines.join('\n');
  }

  try {
    const url =
      baseUrl.replace(/\/$/, '') +
      '/api/cron?job=help&secret=' +
      encodeURIComponent(secret);
    const r = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(12000),
    });
    const text = await r.text();
    const trimmed = String(text || '').trim();
    // Never dump HTML into Telegram
    if (/^<!DOCTYPE/i.test(trimmed) || /<html/i.test(trimmed)) {
      lines.push('help probe: HTTP ' + r.status + ' (HTML page — not JSON)');
      lines.push('✅ Using static job list above (probe skipped)');
      lines.push('Tip: set BOT_PUBLIC_URL to your production domain');
      return lines.join('\n');
    }
    let json = null;
    try {
      json = JSON.parse(trimmed);
    } catch (_) {
      json = null;
    }
    if (json && typeof json === 'object') {
      lines.push('help HTTP ' + r.status + ' · JSON OK');
      if (json.jobs) {
        lines.push('live jobs: ' + (Array.isArray(json.jobs) ? json.jobs.join(', ') : String(json.jobs)));
      } else {
        lines.push(JSON.stringify(json).slice(0, 500));
      }
    } else {
      lines.push('help HTTP ' + r.status);
      lines.push(trimmed.slice(0, 400));
    }
  } catch (e) {
    lines.push('⚠ help probe failed: ' + (e.message || e));
    lines.push('✅ Static job list still valid');
  }
  return lines.join('\n');
}

export function saferResumeHelp() {
  return [
    '🔁 SAFER CHAIN RESUME',
    '1. If chain paused: reply with the missing value (e.g. project name)',
    '2. Or type: resume chain',
    '3. After code fix: /debug apply <id> then resume chain',
    '4. After Vercel deploy wait ~30–60s before resume',
    '5. Never auto-apply patches to api/telegram.js without confirm',
    '',
    'Heal drill: test heal hint → fix → resume chain',
  ].join('\n');
}

export async function fullSealChecklist() {
  const fb =
    envYes('FB_PAGE_ID') && envYes('FB_PAGE_TOKEN')
      ? '✅ FB direct ready'
      : 'ℹ FB_PAGE_ID/TOKEN optional';
  const social =
    envYes('SOCIAL_CHANNEL_ID') || envYes('MAKE_SOCIAL_WEBHOOK')
      ? '✅ Social queue ready'
      : '⚠ Social channel/webhook not set';

  return [
    '🏆 PASIYAOS · FULL SEAL (through Agent-16)',
    '',
    'v5000 A–G: Architect · Hull · Shadow · Cron autonomy ✅',
    'V6000: Debug gate · Surgical · Tool-aware ✅',
    'Agent-1–7: NL execute · chains · macros · confirm ✅',
    'Agent-8–11: Swarm · aggregate · schedule · multi-repo ✅',
    'Agent-12: Multi-repo write + confirm gate ✅',
    'Agent-13: Hull skills expand ✅',
    'Agent-14: Social Path-A (channel/Make) ✅',
    'Agent-15: Production hardening ✅',
    'Agent-16: FB direct + social digest ✅',
    '',
    social,
    fb,
    'Prometheus: OFF (safe)',
    'Vercel Hobby: ≤12 serverless functions',
    '',
    'Commands: prod status · cron health · resume help · social fbcheck · social digest',
  ].join('\n');
}

export default {
  prodStatus,
  cronHealth,
  deployLimitTips,
  saferResumeHelp,
  fullSealChecklist,
};
