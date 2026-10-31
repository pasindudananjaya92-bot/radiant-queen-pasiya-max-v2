/**
 * toolAware.js — natural language → real bot tools (not chatbot manuals)
 * Founder chat: if message matches a known capability, return actionable reply
 * with the exact command to run OR a structured execute hint.
 */

const TOOL_CATALOG = [
  {
    id: 'mini_hub',
    patterns: [/open\s+hub/i, /mini\s*app/i, /open\s+desktop/i, /open\s+phone/i, /open\s+builder/i],
    label: 'Mini App Hub',
    command: 'hub',
    blurb: 'Stable Mini App entry: hub / open desktop / open phone / open builder',
  },

  {
    id: 'hull_create',
    patterns: [
      /create\s+(a\s+)?(new\s+)?vercel\s+project/i,
      /new\s+vercel\s+project/i,
      /make\s+(a\s+)?vercel\s+project/i,
      /hull\s+create/i,
      /create\s+hull\s*b/i,
      /vercel\s+project\s+හද/i,
      /ප්‍?රොජෙක්ට්\s*(එකක්\s*)?හද/i,
    ],
    command: '/hull create <name>',
    example: '/hull create pasiya-worker-2',
    summary: 'Create a Vercel project via Hull Control (bot API).',
  },
  {
    id: 'hull_status',
    patterns: [/hull\s+status/i, /vercel\s+status/i, /deploy\s+status/i],
    command: '/hull status',
    example: '/hull status',
    summary: 'Show Hull A/B + Vercel token/project status.',
  },
  {
    id: 'researchdeep',
    patterns: [
      /deep\s+research/i,
      /research\s+deep/i,
      /researchdeep/i,
      /ගැබුරු\s*පර්යේෂ/i,
    ],
    command: '/researchdeep <topic>',
    example: '/researchdeep free vector databases 2026',
    summary: 'Queue multi-focus deep research (may use Hull B).',
  },
  {
    id: 'shadow_draft',
    patterns: [/shadow\s+draft/i, /schedule\s+draft/i, /draft\s+for\s+later/i],
    command: '/shadow draft <text>',
    example: '/shadow draft Phase note',
    summary: 'Save a private Shadow Twin draft.',
  },
  {
    id: 'debug_file',
    patterns: [/debug\s+file/i, /patch\s+file/i, /fix\s+file\s+lib\//i],
    command: '/debug file <path> :: <instruction> [--local]',
    example: '/debug file lib/x.js :: add comment seal --local',
    summary: 'Queue a surgical or AI patch for a repo file.',
  },
  {
    id: 'sql',
    patterns: [/^sql\b/i, /run\s+sql/i, /supabase\s+query/i],
    command: '/sql <SELECT ...>',
    example: '/sql SELECT 1 AS ok',
    summary: 'God-mode SQL (founder, validated).',
  },
  {
    id: 'deploy',
    patterns: [/redeploy/i, /trigger\s+deploy/i, /deploy\s+now/i],
    command: '/deploy now',
    example: '/deploy now',
    summary: 'Trigger Vercel deploy hook.',
  },
  {
    id: 'askweb',
    patterns: [/search\s+the\s+web/i, /web\s+search/i, /askweb/i],
    command: '/askweb <question>',
    example: '/askweb what is pgvector',
    summary: 'Live web search + citations (Tavily).',
  },
  {
    id: 'seal',
    patterns: [/project\s+seal/i, /system\s+status/i, /\b\/seal\b/i],
    command: '/seal',
    example: '/seal',
    summary: 'Show sealed capability checklist.',
  },
  {
    id: 'expect',
    patterns: [/expect\s+rule/i, /test\s+contract/i],
    command: '/expect <cmd> :: <rule>',
    example: '/expect /echo :: must include twin',
    summary: 'Save live expect contract in Supabase.',
  },
];

export function listTools() {
  return TOOL_CATALOG.map((t) => ({
    id: t.id,
    command: t.command,
    example: t.example,
    summary: t.summary,
  }));
}

export function matchTool(text) {
  const s = String(text || '').trim();
  if (!s || s.startsWith('/')) return null;
  for (const t of TOOL_CATALOG) {
    for (const re of t.patterns) {
      if (re.test(s)) return t;
    }
  }
  return null;
}

/**
 * Returns reply string if handled, else null.
 * Does NOT execute side effects (safe) — tells founder the exact command.
 * Optional autoExecute later via ctx + router.
 */
export function toolAwareReply(text) {
  const t = matchTool(text);
  if (!t) return null;
  return [
    '🛠 TOOL AWARE · I can do this inside the bot (not a manual tutorial).',
    '',
    `Capability: ${t.summary}`,
    `Run: ${t.command}`,
    `Example: ${t.example}`,
    '',
    'Founder private chat: name the project and I EXECUTE (Agent-1), e.g.',
    '"create vercel project named my-worker-3"',
    'Or send the slash command above.',
  ].join('\n');
}

/** System prompt fragment for powerChat / general AI */
export function toolSystemFragment() {
  const lines = TOOL_CATALOG.map(
    (t) => `- ${t.command} — ${t.summary} (e.g. ${t.example})`
  );
  return [
    'You are PasiyaOS, an autonomous Telegram bot with REAL tools.',
    'NEVER give generic "go to Vercel dashboard" manuals when a bot command exists.',
    'If the user wants an action, tell them the exact slash command to run NOW.',
    'Known tools:',
    ...lines,
    'If unsure, suggest /seal or /hull help.',
  ].join('\n');
}

export default {
  listTools,
  matchTool,
  toolAwareReply,
  toolSystemFragment,
};
