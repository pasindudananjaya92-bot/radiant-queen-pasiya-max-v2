/**
 * Wave 29A — vision / scan text commands (photo handled in telegram)
 */
import { visionHelp } from './visionManager.js';

export async function tryHandle(text = '', ctx = null) {
  const raw = String(text || '').trim().replace(/^\//, '');
  if (!raw) return null;
  const lower = raw.toLowerCase();
  if (!/^(vision|scan|explain)\b/i.test(lower) && !/^කියවන්න\b/i.test(raw)) return null;

  if (
    /^(vision|scan|explain)(\s+help|\s+\?)?$/i.test(lower) ||
    /^කියවන්න(\s+help)?$/i.test(raw)
  ) {
    return visionHelp();
  }

  return (
    visionHelp() +
    '\n\n_Photo එකක් යවන්න — caption: `scan` හෝ `explain` හෝ `කියවන්න`_'
  );
}

export default { tryHandle };
