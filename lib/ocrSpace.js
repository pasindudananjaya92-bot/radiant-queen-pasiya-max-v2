/**
 * lib/ocrSpace.js — Pack M CODE TRAINING refactor
 * Free OCR via OCR.space
 *
 * Env:
 * - OCR_SPACE_API_KEY (optional; demo key has limits)
 *
 * Improvements (Pack M):
 * - Stricter input validation
 * - Retry once on transient network errors
 * - Clearer error messages for founder debugging
 * - JSDoc on all exports
 */

const ENDPOINT = 'https://api.ocr.space/parse/image';
const DEFAULT_KEY = 'K87899142388957'; // public demo key (rate-limited)

/**
 * @param {unknown} imageBuf
 * @returns {Buffer|null}
 */
function toBuffer(imageBuf) {
  if (Buffer.isBuffer(imageBuf)) return imageBuf;
  if (imageBuf instanceof ArrayBuffer) return Buffer.from(imageBuf);
  if (ArrayBuffer.isView(imageBuf)) {
    return Buffer.from(imageBuf.buffer, imageBuf.byteOffset, imageBuf.byteLength);
  }
  try {
    return Buffer.from(imageBuf);
  } catch (_) {
    return null;
  }
}

/**
 * Run OCR on an image buffer.
 * @param {Buffer|ArrayBuffer|Uint8Array} imageBuf
 * @param {string} [mime] e.g. image/jpeg
 * @param {string} [lang] eng | sin | etc (OCR.space codes)
 * @returns {Promise<{ok:boolean, text?:string, engine?:string, error?:string}>}
 */
export async function ocrImageBuffer(imageBuf, mime, lang) {
  const key = String(process.env.OCR_SPACE_API_KEY || DEFAULT_KEY).trim();
  const buf = toBuffer(imageBuf);
  if (!buf || buf.length < 64) {
    return { ok: false, error: 'Image too small or invalid' };
  }
  if (buf.length > 8 * 1024 * 1024) {
    return { ok: false, error: 'Image over 8MB limit' };
  }

  const m = String(mime || 'image/jpeg').split(';')[0] || 'image/jpeg';
  const b64 = 'data:' + m + ';base64,' + buf.toString('base64');
  const body = new URLSearchParams();
  body.set('apikey', key);
  body.set('base64Image', b64);
  body.set('language', lang || 'eng');
  body.set('isOverlayRequired', 'false');
  body.set('OCREngine', '2');
  body.set('scale', 'true');
  body.set('detectOrientation', 'true');

  let lastErr = 'OCR failed';
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
        signal: AbortSignal.timeout(45000),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.IsErroredOnProcessing) {
        const err =
          (Array.isArray(json?.ErrorMessage)
            ? json.ErrorMessage.join(' ')
            : json?.ErrorMessage) ||
          json?.ErrorMessage ||
          'HTTP ' + res.status;
        lastErr = String(err).slice(0, 200);
        // retry only on network-ish / 5xx
        if (res.status >= 500 && attempt === 0) continue;
        return { ok: false, error: lastErr };
      }
      const text = String(json?.ParsedResults?.[0]?.ParsedText || '').trim();
      if (!text) return { ok: false, error: 'No text found in image' };
      return {
        ok: true,
        text: text.slice(0, 3500),
        engine: 'ocr.space',
      };
    } catch (e) {
      lastErr = String(e?.message || e).slice(0, 200);
      if (attempt === 0) continue;
    }
  }
  return { ok: false, error: lastErr };
}

export default { ocrImageBuffer };
