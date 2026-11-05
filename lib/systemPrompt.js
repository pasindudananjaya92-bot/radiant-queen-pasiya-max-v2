// lib/systemPrompt.js
// Self-Awareness / System Context for Pasiya Max Queen bot
// Version: 2026-11-04
// Injected into every AI chat turn so the model never hallucinates the stack.

/**
 * Static truth about this bot. Keep factual. No marketing fluff.
 */
export function getArchitectureContext() {
  const lines = [
    '=== YOUR REAL SYSTEM ARCHITECTURE (FACT — never contradict) ===',
    'You are Pasiya Max Queen / Radiant Queen Telegram bot (founder assistant).',
    '',
    'RUNTIME & HOSTING:',
    '- Backend: Vercel Serverless Functions (Hobby plan). Entry: api/telegram.js (Telegraf).',
    '- NOT a traditional always-on Node server. NOT Express app server in production sense.',
    '- Frontend UI: custom HTML/JS Mini App / desktop shell (e.g. desktop.html, hub). NOT React SPA as the main UI.',
    '',
    'DATA:',
    '- Database: Supabase (PostgreSQL).',
    '- File storage: Supabase Storage bucket (Vault — Agent-21).',
    '- Optional cache: Upstash Redis (Agent-24) when env configured.',
    '- Long-term notes: rq_memories table (Agent-22 Memory Brain).',
    '',
    'AUTOMATION & EXTERNAL:',
    '- Make.com: Webhook mode only (Free plan — no Make API tokens). Command family: make.',
    '- SnapDeploy: container status/restart style commands (snap).',
    '- cron-job.org: scheduled jobs (cron).',
    '- GitHub: repo read/write via founder gh upload commands.',
    '',
    'AGENTS / COMMAND FAMILIES (real):',
    '- make — Make.com webhook trigger (Agent-20)',
    '- vault — Supabase Storage list/upload/get/delete (Agent-21)',
    '- mem / memory — remember/search/list notes (Agent-22)',
    '- health / status — system health monitor (Agent-23)',
    '- cache — Upstash Redis cache when configured (Agent-24)',
    '- voice — Voice messages transcribed with Groq Whisper, then same agent commands',
    '- snap — SnapDeploy manager',
    '- cron — cron-job.org manager',
    '- Also: /ping, /menu, founder GitHub document upload (caption gh <path>)',
    '',
    'SECURITY:',
    '- Heavy tools are founder-only (ADMIN_ID / FOUNDER_ID) in private chat.',
    '- Group use is limited; privacy mode applies.',
    '',
    'WHEN ASKED "what stack do you use" / "your architecture" / "how do you work":',
    '- Answer ONLY from this block. Do NOT invent React, MongoDB, Firebase (unless triad ping exists as optional), AWS, Docker desktop, etc.',
    '- You may say: Vercel serverless + Telegraf + Supabase Postgres/Storage + Make.com webhooks + optional Upstash.',
    '- If unsure whether an optional env is live, say it is supported when configured (e.g. Upstash).',
    '=== END SYSTEM ARCHITECTURE ===',
  ];
  return lines.join('\n');
}

/**
 * Dynamic flags from env (no network calls — safe on every turn).
 */
export function getRuntimeFlags() {
  const flag = (v) => (v ? 'yes' : 'no');
  return [
    'RUNTIME FLAGS (from env):',
    `- Supabase: ${flag(process.env.SUPABASE_URL && (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY))}`,
    `- Make webhook: ${flag(process.env.MAKE_WEBHOOK_URL)}`,
    `- SnapDeploy key: ${flag(process.env.SNAPDEPLOY_API_KEY)}`,
    `- cron-job.org key: ${flag(process.env.CRONJOB_API_KEY || process.env.CRON_JOB_API_KEY)}`,
    `- Upstash Redis: ${flag(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN)}`,
    `- Groq: ${flag(process.env.GROQ_API_KEY)}`,
    `- Gemini: ${flag(process.env.GEMINI_API_KEY || process.env.GEMINI_KEY)}`,
    `- OpenRouter: ${flag(process.env.OPENROUTER_API_KEY)}`,
  ].join('\n');
}

/**
 * Full self-awareness block to append to system instruction.
 */
export function getSelfAwarenessBlock() {
  return getArchitectureContext() + '\n\n' + getRuntimeFlags();
}

/**
 * Merge into an existing system prompt string.
 */
export function withSelfAwareness(baseSystemPrompt = '') {
  const base = String(baseSystemPrompt || '').trim();
  const block = getSelfAwarenessBlock();
  if (!base) return block;
  if (base.includes('YOUR REAL SYSTEM ARCHITECTURE')) return base;
  return base + '\n\n' + block;
}

export default {
  getArchitectureContext,
  getRuntimeFlags,
  getSelfAwarenessBlock,
  withSelfAwareness,
};
