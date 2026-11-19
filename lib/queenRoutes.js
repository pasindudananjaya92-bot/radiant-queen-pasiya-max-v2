import { buildQueenPulse, runFortify, queenHelp, VERSION } from './queenPulse.js';

export async function tryHandle(text = '', ctx = null) {
  const raw = String(text || '').trim().replace(/^\//, '');
  if (!raw || !/^(queen)\b/i.test(raw)) return null;
  const lower = raw.toLowerCase();
  if (/^queen(\s+help)?$/i.test(lower)) return queenHelp();
  if (/^queen\s+(pulse|status)$/i.test(lower)) return buildQueenPulse();
  if (/^queen\s+fortify$/i.test(lower)) return runFortify();
  return queenHelp();
}
export default { tryHandle, VERSION };
