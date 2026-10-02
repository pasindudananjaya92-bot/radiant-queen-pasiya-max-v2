/**
 * lib/photoEdit.js — P11 vision-guided free edit
 *
 * Flow:
 *  1) Optional sceneDescription from Gemini vision (telegram passes it)
 *  2) Build strong prompt: keep subject + apply instruction
 *  3) Free image.pollinations.ai (no Paid Pollen)
 *  4) If POLLINATIONS paid pollen exists, try true img2img too
 */
import { generateImagineImage } from './imagine.js';

const PAID_EDIT_MODELS = [
  'microsoft/mai-image-2.6-flash',
  'microsoft/mai-image-2.6',
  'openai/gpt-image-2.5-flare',
];

function apiKey() {
  return String(process.env.POLLINATIONS_API_KEY || process.env.POLLINATIONS_KEY || '').trim();
}

export function expandPhotoEditAlias(raw) {
  const s = String(raw || '').trim().toLowerCase();
  const map = {
    enhance: 'enhance quality, sharper details, natural colors, clean photorealistic',
    cartoon: 'colorful cartoon illustration, clean outlines, vibrant flat colors',
    anime: 'anime style, detailed eyes, studio lighting, high quality anime art',
    blur: 'soft bokeh background, subject sharp, shallow depth of field',
    bw: 'dramatic black and white, high contrast, film grain',
    'black and white': 'dramatic black and white, high contrast, film grain',
    sunset: 'golden hour sunset lighting, warm orange sky, cinematic',
    paint: 'oil painting, visible brush strokes, rich colors',
    sketch: 'detailed pencil sketch, cross-hatching, artistic',
  };
  if (map[s]) return map[s];
  return String(raw || '').trim();
}

function buildEditPrompt(instruction, sceneDescription) {
  const inst = String(instruction || '').trim();
  const scene = String(sceneDescription || '').trim().slice(0, 500);
  if (scene) {
    return (
      'Edit this scene faithfully. Keep the same subject, pose, composition and identity. ' +
      'Scene now: ' +
      scene +
      '. Apply this change only: ' +
      inst +
      '. Photorealistic unless style change requested. High detail.'
    ).slice(0, 900);
  }
  return (
    inst +
    ', high quality, detailed, coherent composition, masterpiece'
  ).slice(0, 900);
}

async function tryPaidImg2Img(prompt, imageUrl, model, key) {
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
      Accept: 'image/*',
      Authorization: 'Bearer ' + key,
    },
    signal: AbortSignal.timeout(90000),
  });
  if (!res.ok) {
    let d = 'HTTP ' + res.status;
    try {
      d += ' ' + (await res.text()).slice(0, 120);
    } catch (_) {}
    return { ok: false, error: d };
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 500 || buf[0] === 0x7b) return { ok: false, error: 'bad body' };
  return { ok: true, buffer: buf, model, mode: 'paid-img2img' };
}

/**
 * @param {string} imageUrl
 * @param {string} instruction
 * @param {{ sceneDescription?: string }} [opts]
 */
export async function editPhotoWithPrompt(imageUrl, instruction, opts = {}) {
  const inst = String(instruction || 'enhance this image').trim().slice(0, 400);
  if (!inst) return { ok: false, error: 'no instruction' };

  const prompt = buildEditPrompt(inst, opts.sceneDescription);

  // FREE path (primary) — no Paid Pollen
  try {
    const free = await generateImagineImage(prompt);
    if (free.ok && free.buffer) {
      return {
        ok: true,
        buffer: free.buffer,
        prompt,
        mode: opts.sceneDescription ? 'vision-guided-free' : 'free-style',
        note: opts.sceneDescription
          ? 'Vision-guided free edit (Gemini saw your photo → restyle). No Paid Pollen.'
          : 'Free style edit. No Paid Pollen.',
      };
    }
  } catch (e) {
    /* fall through */
  }

  // Optional paid true img2img
  const key = apiKey();
  if (key && imageUrl) {
    for (const model of PAID_EDIT_MODELS) {
      try {
        const out = await tryPaidImg2Img(inst, imageUrl, model, key);
        if (out.ok) return { ...out, prompt: inst };
        if (/402|pollen|insufficient|balance/i.test(String(out.error || ''))) break;
      } catch (_) {}
    }
  }

  return {
    ok: false,
    error: 'Edit failed. Retry /photoedit or /imagine.',
  };
}

export default { editPhotoWithPrompt, expandPhotoEditAlias, buildEditPrompt };
