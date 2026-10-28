/**
 * debugLite.js — DEPRECATED shim
 * All /debug traffic must go to phaseADebug.js (hardcoded doctor + surgical file).
 * Kept so old dynamic imports do not revive the AI "repair loop".
 */

import {
  handlePhaseADebug,
  handleDebug as phaseHandleDebug,
  doctorText,
  BUILD,
} from './phaseADebug.js';

/** @deprecated use handlePhaseADebug */
export async function handleDebug(opts = {}) {
  const text = opts.text || opts.ctx?.message?.text || '';
  // Force phaseA path
  const msg = await handlePhaseADebug({ text, ctx: opts.ctx });
  return msg || doctorText();
}

export { handlePhaseADebug, doctorText, BUILD };
export default { handleDebug, handlePhaseADebug, doctorText, BUILD };
