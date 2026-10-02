/**
 * lib/ocrSpace.js — Pack A Step 3
 * Free OCR via OCR.space (optional OCR_SPACE_API_KEY; free demo key works with limits)
 */
const ENDPOINT = 'https://api.ocr.space/parse/image';

/**
 * @param {Buffer} imageBuf
 * @param {string} [mime]
 * @param {string} [lang] eng | sin | etc
 */
export async function ocrImageBuffer(imageBuf, mime, lang) {
  const key = String(process.env.OCR_SPACE_API_KEY || 'K87899142388957').trim();
  const buf = Buffer.isBuffer(imageBuf) ? imageBuf : Buffer.from(imageBuf);
  const m = String(mime || 'image/jpeg').split(';')[0];
  const b64 = 'data:' + m + ';base64,' + buf.toString('base64');
  const body = new URLSearchParams();
  body.set('apikey', key);
  body.set('base64Image', b64);
  body.set('language', lang || 'eng');
  body.set('isOverlayRequired', 'false');
  body.set('OCREngine', '2');
  body.set('scale', 'true');
  body.set('detectOrientation', 'true');

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
    signal: AbortSignal.timeout(45000),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json?.IsErroredOnProcessing) {
    const err =
      (Array.isArray(json?.ErrorMessage) ? json.ErrorMessage.join(' ') : json?.ErrorMessage) ||
      json?.ErrorMessage ||
      ('HTTP ' + res.status);
    return { ok: false, error: String(err).slice(0, 200) };
  }
  const text = String(json?.ParsedResults?.[0]?.ParsedText || '').trim();
  if (!text) return { ok: false, error: 'No text found in image' };
  return {
    ok: true,
    text: text.slice(0, 3500),
    engine: 'ocr.space',
  };
}

export default { ocrImageBuffer };
