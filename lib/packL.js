/**
 * lib/packL.js — Pack L helpers
 * User block list helpers + quote image prompt
 */

/**
 * @param {string} body
 * @returns {string|null} numeric user id
 */
export function parseUserIdArg(body) {
  const t = String(body || '').trim();
  if (/^\d{5,}$/.test(t)) return t;
  const m = t.match(/id[:\s]*(\d{5,})/i);
  if (m) return m[1];
  return null;
}

/**
 * @param {string} text
 */
export function quoteImagePrompt(text) {
  const q = String(text || 'Dream big. Run farther.').slice(0, 180);
  return (
    'Inspirational quote poster, clean modern typography, elegant background, ' +
    'high contrast readable text, premium minimal design, no watermark, quote: ' +
    JSON.stringify(q)
  );
}

export default { parseUserIdArg, quoteImagePrompt };
