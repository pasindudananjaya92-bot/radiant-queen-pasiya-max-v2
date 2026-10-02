/**
 * lib/videoGen.js — P10a-free
 * 1) Try real Pollinations video if Paid Pollen available
 * 2) Else FREE storyboard: 3 still frames via image.pollinations.ai
 */
import { generateImagineImage } from './imagine.js';

const VIDEO_MODELS = [
  'seedance-2.0-fast',
  'seedance-2.0-mini',
  'wan-2.7',
  'happyhorse-1.1',
  'bytedance/seedance-2.0-fast',
  'alibaba/wan-2.7',
];

function apiKey() {
  return String(process.env.POLLINATIONS_API_KEY || process.env.POLLINATIONS_KEY || '').trim();
}

async function tryPaidVideo(prompt, model, imageUrl, timeoutMs) {
  const key = apiKey();
  if (!key) return { ok: false, error: 'no key' };
  const params = new URLSearchParams({
    model,
    key,
    duration: String(process.env.POLLINATIONS_VIDEO_DURATION || '5'),
  });
  if (imageUrl) {
    params.set('image', imageUrl);
    params.set('image[0]', imageUrl);
  }
  const url =
    'https://gen.pollinations.ai/video/' +
    encodeURIComponent(prompt) +
    '?' +
    params.toString();
  const res = await fetch(url, {
    headers: {
      Accept: 'video/*,application/json',
      Authorization: 'Bearer ' + key,
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    let detail = 'HTTP ' + res.status;
    try {
      const t = await res.text();
      if (t) detail += ' ' + t.slice(0, 200);
    } catch (_) {}
    return { ok: false, error: detail, model };
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 1000) return { ok: false, error: 'empty', model };
  if (buf[0] === 0x7b) {
    try {
      const j = JSON.parse(buf.toString('utf8'));
      const media = j?.data?.[0]?.url || j?.url;
      if (media) {
        const r2 = await fetch(String(media), { signal: AbortSignal.timeout(60000) });
        if (!r2.ok) return { ok: false, error: 'media HTTP ' + r2.status, model };
        return {
          ok: true,
          buffer: Buffer.from(await r2.arrayBuffer()),
          model,
          mode: 'paid-video',
        };
      }
      return { ok: false, error: JSON.stringify(j).slice(0, 200), model };
    } catch (_) {}
  }
  return { ok: true, buffer: buf, model, mode: 'paid-video' };
}

/** FREE: 3 cinematic frames (no pollen) */
export async function generateFreeStoryboard(prompt) {
  const q = String(prompt || '').trim().slice(0, 300);
  if (!q) return { ok: false, error: 'empty prompt' };
  const frames = [
    q + ', cinematic wide establishing shot, frame 1 of 3, photorealistic',
    q + ', medium action shot, motion, frame 2 of 3, photorealistic',
    q + ', dramatic close-up finale, frame 3 of 3, photorealistic',
  ];
  const images = [];
  for (const fp of frames) {
    const img = await generateImagineImage(fp);
    if (img.ok && img.buffer) {
      images.push({ buffer: img.buffer, prompt: fp });
    }
  }
  if (!images.length) return { ok: false, error: 'storyboard frames failed' };
  return {
    ok: true,
    mode: 'free-storyboard',
    frames: images,
    prompt: q,
    note: 'Free storyboard (3 frames). Real MP4 needs Paid Pollen on Pollinations.',
  };
}

export async function generateVideoFromPrompt(prompt, opts = {}) {
  const q = String(prompt || '').trim().slice(0, 500);
  if (!q) return { ok: false, error: 'empty prompt' };

  const forceFree = String(process.env.VIDEO_FREE_ONLY || '').trim() === '1';
  const key = apiKey();
  const preferred = String(
    opts.model || process.env.POLLINATIONS_VIDEO_MODEL || 'seedance-2.0-fast'
  ).trim();

  if (!forceFree && key) {
    const models = [preferred, ...VIDEO_MODELS.filter((m) => m !== preferred)];
    for (const model of models) {
      try {
        const out = await tryPaidVideo(q, model, opts.imageUrl || null, Number(opts.timeoutMs || 110000));
        if (out.ok) return { ...out, prompt: q };
        if (/402|pollen|insufficient|balance|payment/i.test(String(out.error || ''))) {
          break; // fall through to free storyboard
        }
        if (/invalid model|BAD_REQUEST/i.test(String(out.error || ''))) {
          continue;
        }
      } catch (_) {}
    }
  }

  // FREE fallback — always available
  const board = await generateFreeStoryboard(q);
  if (board.ok) return board;
  return {
    ok: false,
    error:
      board.error ||
      'Video needs Paid Pollen (enter.pollinations.ai) or free storyboard failed. /imagine still works free.',
  };
}

export async function generateVideoFromImage(imageUrl, prompt, opts = {}) {
  // animate: try paid with image, else free storyboard from prompt
  return generateVideoFromPrompt(prompt || 'animate this scene with natural motion', {
    ...opts,
    imageUrl,
  });
}

export default {
  generateVideoFromPrompt,
  generateVideoFromImage,
  generateFreeStoryboard,
  VIDEO_MODELS,
};
