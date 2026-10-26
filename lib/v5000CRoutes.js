/**
 * v5000 Phase C command router (import from founder middleware or bot.command)
 */
import {
  handlePhaseCExtra,
  suggestRetest,
} from './phaseCExtra.js';

const CMDS = new Set(['/patchlog', '/healcheck', '/doctor']);

export function isPhaseCCommand(cmd) {
  return CMDS.has(String(cmd || '').toLowerCase());
}

export async function handlePhaseCRoute({ cmd, text, ctx, supabase, bot }) {
  if (!isPhaseCCommand(cmd)) return null;
  return handlePhaseCExtra({ text, ctx });
}

/** Call after successful /debug apply */
export function applySuccessMessage(filePath, commit) {
  const retest = suggestRetest(filePath);
  return (
    '✅ Applied `' +
    (filePath || '') +
    '`' +
    (commit ? ' · ' + String(commit).slice(0, 7) : '') +
    '\n\n▶️ Suggested verify:\n' +
    retest +
    '\n\nPrometheus: OFF (manual apply only)'
  );
}

export default { isPhaseCCommand, handlePhaseCRoute, applySuccessMessage };
