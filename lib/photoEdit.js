/**
 * lib/photoEdit.js — P10a-free
 * Priority:
 *  1) Free image.pollinations.ai (NO pollen, NO key) — always works
 *  2) Optional paid img2img if POLLINATIONS_API_KEY + paid pollen available
 */
import { generateImagineImage } from './imagine.js';

const PAID_EDIT_MODELS = [
  'microsoft/mai-image-2.6-flash',
  'microsoft/mai-image-2.6',
  'openai/gpt-image-2.5-flare',
  'qwen/qwen-image-2.1',
];

function apiKey() {
  return String(process.env.POLLINATIONS_API_KEY || process.env.POLLINATIONS_KEY || '').trim();
}

export function expandPhotoEditAlias(raw) {
  const s = String(raw || '').trim().toLowerCase();
  const map = {
    enhance: 'enhance this photo, sharper details, natural colors, high quality, photorealistic',
    cartoon: 'colorful cartoon illustration style, clean lines, vibrant',
    anime: 'anime style artwork, detailed, studio quality',
    blur: 'soft bokeh background, subject sharp, portrait photography',
    bw: 'dramatic black and white photography, high contrast',
    'black and white': 'dramatic black and white photography, high contrast',
    sunset: 'warm golden hour sunset lighting, orange sky, cinematic',
    paint: 'oil painting style, rich brush strokes, artistic',
    sketch: 'detailed pencil sketch, shading, artistic line art',
  };
  if (map[s]) return map[s];
  return String(raw || '').trim();
}

async function tryPaidEdit(prompt, imageUrl, model, key) {
  const params = new URLSearchParams({
    model,
    image: imageUrl,
    width: '1024',
    height: '1024',
    nologo: 'true',
    key,
  });
  const url =
    'https://gen.pollinations.ai/image/' +
    encodeURIComponent(prompt) +
    '?' +
    params.toString();
  const res = await fetch(url, {
    headers: {
      Accept: 'image/*,application/json',
      Authorization: 'Bearer ' + key,
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(90000),
  });
  if (!res.ok) {
    let detail = 'HTTP ' + res.status;
    try {
      const t = await res.text();
      if (t) detail += ' ' + t.slice(0, 180);
    } catch (_) {}
    return { ok: false, error: detail };
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 500) return { ok: false, error: 'empty' };
  if (buf[0] === 0x7b) {
    try {
      const j = JSON.parse(buf.toString('utf8'));
      if (j?.error) return { ok: false, error: JSON.stringify(j.error).slice(0, 180) };
    } catch (_) {}
  }
  return { ok: true, buffer: buf, model, mode: 'paid-img2img' };
}

export async function editPhotoWithPrompt(imageUrl, instruction) {
  const prompt = String(instruction || 'enhance this image').trim().slice(0, 400);
  if (!prompt) return { ok: false, error: 'no instruction' };

  // 1) FREE path first — no pollen, uses same engine as /imagine
  const freePrompt =
    prompt +
    ', high quality, detailed, masterpiece composition';
  try {
    const free = await generateImagineImage(freePrompt);
    if (free.ok && free.buffer) {
      return {
        ok: true,
        buffer: free.buffer,
        prompt,
        model: 'flux-free',
        mode: 'free-style',
        note: 'Free edit (style from instruction). No paid pollen used.',
      };
    }
  } catch (e) {
    /* continue to paid */
  }

  // 2) Optional paid true img2img if key + pollen
  const key = apiKey();
  if (key && imageUrl) {
    for (const model of PAID_EDIT_MODELS) {
      try {
        const out = await tryPaidEdit(prompt, imageUrl, model, key);
        if (out.ok) return { ...out, prompt };
        if (/402|pollen|insufficient|balance|payment/i.test(String(out.error || ''))) {
          break; // no point trying more paid models
        }
      } catch (_) {}
    }
  }

  return {
    ok: false,
    error:
      'Free edit failed. Retry /photoedit or use /imagine. (Paid img2img needs Paid Pollen on enter.pollinations.ai)',
  };
}

export default { editPhotoWithPrompt, expandPhotoEditAlias };
