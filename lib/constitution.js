/**
 * /constitution — live capability map for founder
 */
export function buildConstitution() {
  return [
    '📜 PASIYAOS CONSTITUTION',
    '',
    'CORE',
    '· /sql · SQL files · Intent Ledger /audit',
    '· /chronos · /rollback · /prfix (surgical)',
    '· Fortress · /secreport (Panopticon)',
    '',
    'SWARM & MEMORY',
    '· /swarm init|status|recall · /spawn · /share_pattern',
    '· /mem · /mem recall (Living Graph)',
    '',
    'BUILD',
    '· /browse (Spider) · /forgedrop · /forgepage (Live Canvas)',
    '· /git status|switch (Multi-Repo)',
    '',
    'AUTOMATION',
    '· /cron list|create|run|delete',
    '· /nightly (Panopticon+Swarm+Health)',
    '· /jarvis (voice pipeline)',
    '',
    'LAW',
    '· Founder-only for heavy ops',
    '· Defense: ban/throttle/heal — no offensive hacks',
    '· Free tier: Vercel + Supabase + GitHub + Groq/Gemini',
  ].join('\n');
}

export default { buildConstitution };
