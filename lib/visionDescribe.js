/**
 * lib/visionDescribe.js — P11-fix2
 * Direct Gemini REST vision (snake_case inline_data).
 * Does NOT use Telegraf generateReply / persona / Sinhala coach path
 * (those caused "no image visible" false replies).
 */
const REST_MODELS = [
  process.env.GEMINI_VISION_MODEL || '',
  'gemini-2.0-flash',
  'gemini-2.5-flash',
  'gemini-1.5-flash',
  'gemini-flash-latest',
  'gemini-2.0-flash-lite',
].filter(Boolean);

function geminiKey() {
  return String(process.env.GEMINI_API_KEY || '').trim();
}

/**
 * @param {Buffer|Uint8Array} imageBuf
 * @param {string} mimeType
 * @param {string} [userHint]
 * @returns {Promise<{ok:boolean, text?:string, model?:string, error?:string, bytes?:number}>}
 */
export async function describeImageBuffer(imageBuf, mimeType, userHint) {
  const key = geminiKey();
  if (!key) return { ok: false, error: 'GEMINI_API_KEY missing' };

  const buf = Buffer.isBuffer(imageBuf) ? imageBuf : Buffer.from(imageBuf);
  if (!buf.length || buf.length < 100) {
    return { ok: false, error: 'image buffer too small: ' + buf.length };
  }
  const mime = String(mimeType || 'image/jpeg').split(';')[0].trim() || 'image/jpeg';
  const b64 = buf.toString('base64');
  console.log(
    '[visionDescribe] bytes=',
    buf.length,
    'mime=',
    mime,
    'b64prefix=',
    b64.slice(0, 40)
  );

  const prompt =
    String(userHint || '').trim() ||
    'Describe ONLY what is visible in this image in under 40 English words: ' +
      'main subject, colors, background. If a flower name it. ' +
      'Do NOT invent people or objects that are not clearly present. Plain text only.';

  // Official REST shape: inline_data + mime_type (snake_case)
  const body = {
    contents: [
      {
        role: 'user',
        parts: [
          { text: prompt },
          { inline_data: { mime_type: mime, data: b64 } },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 180,
    },
  };

  const errors = [];
  for (const model of REST_MODELS) {
    const url =
      'https://generativelanguage.googleapis.com/v1beta/models/' +
      encodeURIComponent(model) +
      ':generateContent?key=' +
      encodeURIComponent(key);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(45000),
      });
      const raw = await res.text();
      if (!res.ok) {
        errors.push(model + ': HTTP ' + res.status + ' ' + raw.slice(0, 100));
        console.log('[visionDescribe] fail', model, res.status, raw.slice(0, 120));
        continue;
      }
      let json;
      try {
        json = JSON.parse(raw);
      } catch (_) {
        errors.push(model + ': bad json');
        continue;
      }
      const text = String(
        json?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') ||
          json?.candidates?.[0]?.content?.parts?.[0]?.text ||
          ''
      ).trim();
      if (!text) {
        errors.push(model + ': empty text');
        continue;
      }
      // Reject known "no image" hallucinations
      const low = text.toLowerCase();
      if (
        low.includes('no image') ||
        low.includes('cannot see') ||
        low.includes('not visible') ||
        low.includes('නැත') ||
        low.includes('දිස්වන්නේ නැත') ||
        low.includes('resend') ||
        low.includes('නැවත යොමු')
      ) {
        errors.push(model + ': model claims no image — ' + text.slice(0, 80));
        console.log('[visionDescribe] reject no-image reply', text.slice(0, 100));
        continue;
      }
      console.log('[visionDescribe] ok', model, text.slice(0, 120));
      return { ok: true, text: text.slice(0, 500), model, bytes: buf.length };
    } catch (e) {
      errors.push(model + ': ' + String(e.message || e));
    }
  }

  return {
    ok: false,
    error: errors.slice(0, 4).join(' | ') || 'vision failed',
    bytes: buf.length,
  };
}

export default { describeImageBuffer };
