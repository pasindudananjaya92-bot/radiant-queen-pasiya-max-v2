/**
 * Wave 29B — Code Forge (draft-only)
 * Founder describes a bug/feature → LLM produces a patch plan + file draft.
 * NEVER git push. NEVER overwrite production silently.
 * Uses existing free aiRouter (Groq → OpenRouter → Gemini).
 */
export const VERSION = '29B';

export function forgeHelp() {
  return [
    '⚒️ *Code Forge · ' + VERSION + '*',
    'Draft code like a senior engineer — *never auto-push*',
    '',
    '• `forge help` — this menu',
    '• `forge plan <goal>` — architecture + steps + risks',
    '• `forge fix <error or symptom>` — root cause + patch plan',
    '• `forge file <path> | <what to write>` — single-file draft',
    '',
    'Workflow: forge → review → you upload via `gh` caption → ONE redeploy',
    '_Same safety as GOD-MODE: Founder approve only._',
  ].join('\n');
}

async function llm(system, user) {
  const ai = await import('./aiRouter.js');
  const r = await ai.routeTextAI({ system, user });
  return { text: (r.text || '').slice(0, 3500), provider: r.provider || 'ai' };
}

const SYS =
  'You are Code Forge for Radiant Queen OS (Telegram bot on Vercel Hobby + Supabase). ' +
  'Constraints: max 12 serverless functions, ~10s timeout, mobile Founder, ESM, no silent git push. ' +
  'Reply structured Markdown. Prefer minimal diffs. Never invent private keys. ' +
  'Sinhala+English mix OK for explanations.';

export async function forgePlan(goal) {
  const r = await llm(
    SYS,
    'Make a concrete implementation plan.\nGoal:\n' +
      goal +
      '\n\nInclude: files to touch, Vercel risk, rollback, test commands.'
  );
  return '⚒️ *Forge plan · ' + r.provider + '*\n\n' + r.text;
}

export async function forgeFix(symptom) {
  const r = await llm(
    SYS,
    'Debug and propose a safe fix (draft only).\nSymptom/error:\n' +
      symptom +
      '\n\nInclude: likely root cause, exact files, patch outline, test commands. No full 500-line dumps.'
  );
  return '⚒️ *Forge fix · ' + r.provider + '*\n\n' + r.text;
}

export async function forgeFile(path, brief) {
  const r = await llm(
    SYS,
    'Draft ONE file only.\nPath: ' +
      path +
      '\nRequirements:\n' +
      brief +
      '\n\nOutput: short note + a single fenced code block for the full file. ESM export style matching Queen OS.'
  );
  return (
    '⚒️ *Forge file · `' +
    path +
    '`*\n_' +
    r.provider +
    ' · draft only — upload via gh after review_\n\n' +
    r.text
  );
}

export default { VERSION, forgeHelp, forgePlan, forgeFix, forgeFile };
