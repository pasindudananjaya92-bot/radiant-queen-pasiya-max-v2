/**
 * Wave 28A — queen help | pulse | fortify
 */
import { buildQueenPulse, runFortify, queenHelp, VERSION } from './queenPulse.js';

export async function tryHandle(text = '', ctx = null) {
  const raw = String(text || '').trim().replace(/^\//, '');
  if (!raw) return null;
  const lower = raw.toLowerCase();
  if (!/^(queen)\b/i.test(lower)) return null;

  if (/^queen(\s+help)?$/i.test(lower) || /^queen\s+\?$/i.test(lower)) {
    return queenHelp();
  }
  if (/^queen\s+(pulse|status)$/i.test(lower)) {
    return buildQueenPulse();
  }
  if (/^queen\s+fortify$/i.test(lower)) {
    return runFortify();
  }
  return queenHelp() + '\n\n_Try `queen pulse` or `queen fortify`._';
}

export default { tryHandle, VERSION };
