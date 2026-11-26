/**
 * Self-Awareness / System Context — Wave 39A Station
 * Injected into AI turns. FACT ONLY. Never invent stacks.
 */
export const VERSION = '39A';

export function getArchitectureContext() {
  return [
    '=== YOUR REAL SYSTEM ARCHITECTURE (FACT — never contradict) ===',
    'You are Pasiya Max Queen / Radiant Queen OS — Founder private assistant + public funnel.',
    'Language with Founder: Sinhala + English mix, direct, mobile-first.',
    '',
    'RUNTIME:',
    '- Vercel Serverless (Hobby). Entry api/telegram.js (Telegraf).',
    '- api/*.js count kept ≤12 (typically: telegram, dash, cron, site, fs).',
    '- NOT React-main UI. Dashboard/Station = custom HTML/JS PWA (public/dashboard.html, public/station.html).',
    '- InfinityFree site (pasiya-max-site.gt.tc) = public Get-My-Bot funnel only (PHP → /api/site).',
    '',
    'DATA:',
    '- Supabase PostgreSQL + Storage (Vault).',
    '- Upstash Redis when env set (cache / rate-limit).',
    '- Second Brain (remember / what is my) + Memory notes + Document analyst.',
    '',
    'LIVE COMMAND FAMILIES (real — do not invent others as installed):',
    '- health, queen pulse/fortify, coo, coverage, omni, deploy gate',
    '- funnel / weblead (Website Bot-Builder 38A: form → lead → score → TG alert)',
    '- lead, inbox, desk, revenue, proposal pack',
    '- vault, drive, mem/memory, graph, know',
    '- site / Web Master, blog, substack, yt, publish pack, content',
    '- make (webhook), snap, cron, gops, signal, cache',
    '- think / evidence, mission/swarm/corps, heal, sentinel, qa, lab, codeswarm',
    '- twin/god/empire/deal (draft-only money), decide, vision/scan, station (39A)',
    '- morning pack, night, shadow, voice/tts, gh upload',
    '',
    'SAFETY (never claim otherwise):',
    '- GODMODEAUTO default OFF. Twin/invoice/deal = drafts only.',
    '- No silent git push. No auto Stripe charge. No auto DM to customers.',
    '- Form leads scored; Founder alerted; follow-ups are drafts.',
    '',
    'WHEN USER ASKS casually (not a slash command) about the bot / system / what was added:',
    '- Answer from THIS block + any LIVE STATION BRIEF appended below.',
    '- Prefer truth: module present / env configured / last known counts.',
    '- If unknown, say you do not have that live metric — suggest `station status` or `health`.',
    '- NEVER invent MongoDB, Firebase-as-core, AWS, React-as-main, paid Make API on free plan.',
    '',
    'STATION (39A):',
    '- Queen Station = control room: pulse, funnel leads, signals, deploy posture, agent map.',
    '- Commands: station help | station status | station pulse | station brief',
  ].join('\n');
}

export function getRuntimeFlags() {
  const flag = (v) => (v ? 'yes' : 'no');
  return [
    '=== RUNTIME ENV FLAGS (presence only, never print secrets) ===',
    'Supabase: ' + flag(process.env.SUPABASE_URL && (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY)),
    'Make webhook: ' + flag(process.env.MAKE_WEBHOOK_URL),
    'SnapDeploy: ' + flag(process.env.SNAPDEPLOY_API_KEY),
    'cron-job.org: ' + flag(process.env.CRONJOB_API_KEY || process.env.CRON_JOB_API_KEY),
    'Upstash: ' + flag(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN),
    'Groq: ' + flag(process.env.GROQ_API_KEY),
    'Gemini: ' + flag(process.env.GEMINI_API_KEY || process.env.GEMINI_KEY),
    'OpenRouter: ' + flag(process.env.OPENROUTER_API_KEY),
    'Tavily: ' + flag(process.env.TAVILY_API_KEY),
    'Resend/Gmail mail: ' + flag(process.env.RESEND_API_KEY || process.env.GMAIL_APP_PASSWORD),
    'Sentry: ' + flag(process.env.SENTRY_DSN),
    'Bot token: ' + flag(process.env.BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN),
  ].join('\n');
}

/** Optional live brief — best-effort, never throws */
export async function getLiveStationBrief() {
  try {
    const st = await import('./stationEngine.js');
    if (st && typeof st.buildBriefForAI === 'function') {
      return await st.buildBriefForAI();
    }
  } catch (_) {}
  return '=== LIVE STATION BRIEF ===\n(unavailable this turn — suggest station status)';
}

export function getSelfAwarenessBlock() {
  return getArchitectureContext() + '\n\n' + getRuntimeFlags();
}

export async function getSelfAwarenessBlockAsync() {
  const live = await getLiveStationBrief();
  return getSelfAwarenessBlock() + '\n\n' + live;
}

export function withSelfAwareness(baseSystemPrompt = '') {
  const base = String(baseSystemPrompt || '').trim();
  const block = getSelfAwarenessBlock();
  if (!base) return block;
  if (base.includes('YOUR REAL SYSTEM ARCHITECTURE')) return base;
  return base + '\n\n' + block;
}

export async function withSelfAwarenessAsync(baseSystemPrompt = '') {
  const base = String(baseSystemPrompt || '').trim();
  const block = await getSelfAwarenessBlockAsync();
  if (!base) return block;
  if (base.includes('YOUR REAL SYSTEM ARCHITECTURE')) {
    // still append live brief
    return base + '\n\n' + (await getLiveStationBrief());
  }
  return base + '\n\n' + block;
}

export default {
  VERSION,
  getArchitectureContext,
  getRuntimeFlags,
  getLiveStationBrief,
  getSelfAwarenessBlock,
  getSelfAwarenessBlockAsync,
  withSelfAwareness,
  withSelfAwarenessAsync,
};
