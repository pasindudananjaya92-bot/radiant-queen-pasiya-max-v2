/**
 * Wave 26 — queen help | queen pulse | queen status
 */
import { buildQueenPulse, queenHelp, VERSION } from './queenPulse.js';

export async function tryHandle(text = '', ctx = null) {
  const raw = String(text || '').trim().replace(/^\//, '');
  if (!raw) return null;
  const lower = raw.toLowerCase();
  if (!/^(queen)\b/i.test(lower)) return null;

  try {
    if (/^queen(\s+help|\s+\?|\s*$)/i.test(lower)) return queenHelp();
    if (/^queen\s+(pulse|status|stat)\b/i.test(lower)) return await buildQueenPulse();
    return queenHelp() + '\n\n_Try `queen pulse`._';
  } catch (e) {
    return '❌ Queen: ' + (e.message || e);
  }
}

export default { tryHandle, VERSION };
