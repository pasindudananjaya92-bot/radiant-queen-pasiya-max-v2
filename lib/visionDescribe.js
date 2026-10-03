/**
 * lib/visionDescribe.js — P11-fix3 + Pack A Step1
 * Primary: Groq vision (OpenAI-compatible image_url data URI)
 * Fallback: Gemini REST (may 404 on free tier 2026)
 *
 * Models tried (2026):
 * - qwen/qwen3.8-27b
 * - qwen/qwen3.6-27b
 * - meta-llama/llama-4-scout-17b-16e-instruct
 * - meta-llama/llama-4-maverick-17b-128e-instruct
 * - llama-3.2-11b-vision-preview (legacy)
 */
const GROQ_VISION_MODELS = [
  process.env.GROQ_VISION_MODEL || '',
  'qwen/qwen3.8-27b',
  'qwen/qwen3.6-27b',
  'meta-llama/llama-4-scout-17b-16e-instruct',
  'meta-llama/llama-4-maverick-17b-128e-instruct',
  'llama-3.2-11b-vision-preview',
  'llama-3.2-90b-vision-preview',
].filter(Boolean);

const GEMINI_VISION_MODELS = [
  process.env.GEMINI_VISION_MODEL || '',
  'gemini-3.8-flash',
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-3.5-flash-lite',
  'gemini-2.5-flash',
  'gemini-flash-latest',
].filter(Boolean);

function looksLikeNoImage(text) {
  const low = String(text || '').toLowerCase();
  return (
    low.includes('no image') ||
    low.includes('cannot see') ||
    low.includes('not visible') ||
    low.includes('unable to view') ||
    low.includes('නැත') ||
    low.includes('දිස්වන්නේ නැත') ||
    low.includes('resend') ||
    low.includes('නැවත යොමු')
  );
}

/**
 * @param {Buffer|Uint8Array} imageBuf
 * @param {string} mimeType
 * @param {string} [userHint]
 */
export async function describeImageBuffer(imageBuf, mimeType, userHint) {
  const buf = Buffer.isBuffer(imageBuf) ? imageBuf : Buffer.from(imageBuf);
  if (!buf.length || buf.length < 100) {
    return { ok: false, error: 'image buffer too small: ' + buf.length };
  }
  const mime = String(mimeType || 'image/jpeg').split(';')[0].trim() || 'image/jpeg';
  const b64 = buf.toString('base64');
  console.log('[visionDescribe] bytes=', buf.length, 'mime=', mime, 'b64=', b64.slice(0, 32));

  const prompt =
    String(userHint || '').trim() ||
    'Describe ONLY what is visible in this image in under 40 English words: ' +
      'main subject, colors, background. If a flower, name the flower. ' +
      'Do NOT invent people or objects that are not present. Plain text only.';

  const errors = [];

  // ---- 1) GROQ vision (primary) ----
  const groqKey = String(process.env.GROQ_API_KEY || '').trim();
  if (groqKey) {
    const dataUrl = 'data:' + mime + ';base64,' + b64;
    for (const model of GROQ_VISION_MODELS) {
      try {
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: 'Bearer ' + groqKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model,
            temperature: 0.2,
            max_tokens: 200,
            messages: [
              {
                role: 'user',
                content: [
                  { type: 'text', text: prompt },
                  { type: 'image_url', image_url: { url: dataUrl } },
                ],
              },
            ],
          }),
          signal: AbortSignal.timeout(60000),
        });
        const raw = await res.text();
        if (!res.ok) {
          errors.push('groq:' + model + ' HTTP ' + res.status + ' ' + raw.slice(0, 90));
          console.log('[visionDescribe] groq fail', model, res.status, raw.slice(0, 100));
          continue;
        }
        let json;
        try {
          json = JSON.parse(raw);
        } catch (_) {
          errors.push('groq:' + model + ' bad json');
          continue;
        }
        const text = String(json?.choices?.[0]?.message?.content || '').trim();
        if (!text) {
          errors.push('groq:' + model + ' empty');
          continue;
        }
        if (looksLikeNoImage(text)) {
          errors.push('groq:' + model + ' no-image claim');
          continue;
        }
        console.log('[visionDescribe] groq ok', model, text.slice(0, 100));
        return { ok: true, text: text.slice(0, 500), model: 'groq:' + model, bytes: buf.length };
      } catch (e) {
        errors.push('groq:' + model + ' ' + String(e.message || e));
      }
    }
  } else {
    errors.push('GROQ_API_KEY missing');
  }

  // ---- 2) GEMINI REST fallback ----
  const gemKey = String(process.env.GEMINI_API_KEY || '').trim();
  if (gemKey) {
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
      generationConfig: { temperature: 0.2, maxOutputTokens: 180 },
    };
    for (const model of GEMINI_VISION_MODELS) {
      try {
        const url =
          'https://generativelanguage.googleapis.com/v1beta/models/' +
          encodeURIComponent(model) +
          ':generateContent?key=' +
          encodeURIComponent(gemKey);
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(45000),
        });
        const raw = await res.text();
        if (!res.ok) {
          errors.push('gemini:' + model + ' HTTP ' + res.status);
          continue;
        }
        let json;
        try {
          json = JSON.parse(raw);
        } catch (_) {
          continue;
        }
        const text = String(
          json?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || ''
        ).trim();
        if (!text || looksLikeNoImage(text)) {
          errors.push('gemini:' + model + ' empty/no-image');
          continue;
        }
        console.log('[visionDescribe] gemini ok', model, text.slice(0, 100));
        return { ok: true, text: text.slice(0, 500), model: 'gemini:' + model, bytes: buf.length };
      } catch (e) {
        errors.push('gemini:' + model + ' ' + String(e.message || e));
      }
    }
  }

  return {
    ok: false,
    error: errors.slice(0, 5).join(' | ') || 'vision failed',
    bytes: buf.length,
  };
}

export default { describeImageBuffer };
