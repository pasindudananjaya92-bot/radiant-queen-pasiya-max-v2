/**
 * Wave 29B — vision text routes
 */
import { visionHelp } from './visionManager.js';

export async function tryHandle(text = '', ctx = null) {
  const raw = String(text || '').trim().replace(/^\//, '');
  if (!raw) return null;
  const lower = raw.toLowerCase();
  if (!/^(vision|scan|explain)\b/i.test(lower) && !/^කියවන්න\b/i.test(raw)) return null;

  if (
    /^(vision)(\s+help|\s+\?)?$/i.test(lower) ||
    /^(scan|explain|කියවන්න)(\s+help|\s+\?)$/i.test(lower)
  ) {
    return visionHelp();
  }

  // Bare scan/explain without photo
  if (/^(scan|explain|කියවන්න|vision\s+scan)$/i.test(lower) || /^කියවන්න$/i.test(raw)) {
    return (
      '👁 *No image attached*\n' +
      'Send a *photo* with caption:\n' +
      '• `scan` — full structured read\n' +
      '• `explain` — same\n' +
      '• `කියවන්න` — same\n\n' +
      '_Crop large screenshots for Vercel Hobby speed._'
    );
  }

  return visionHelp();
}

export default { tryHandle };
