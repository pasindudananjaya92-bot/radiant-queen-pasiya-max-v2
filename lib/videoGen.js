/**
 * lib/videoGen.js
 * Pollinations text-to-video + image-to-video (FOUNDER tools)
 *
 * Requires POLLINATIONS_API_KEY from https://enter.pollinations.ai
 * (video models are pollen-based / not free forever)
 *
 * Endpoints:
 *   GET https://gen.pollinations.ai/video/{prompt}?model=seedance|veo&key=...
 *   image-to-video: &image=URL or image[0]=URL
 */
const BASE = 'https://gen.pollinations.ai/video/';

function apiKey() {
  return String(process.env.POLLINATIONS_API_KEY || process.env.POLLINATIONS_KEY || '').trim();
}

export async function generateVideoFromPrompt(prompt, opts = {}) {
  const q = String(prompt || '').trim().slice(0, 500);
  if (!q) return { ok: false, error: 'empty prompt' };
  const key = apiKey();
  if (!key) {
    return {
      ok: false,
      error:
        'POLLINATIONS_API_KEY missing. Get key at enter.pollinations.ai → set in Vercel env → redeploy.',
    };
  }
  const model = String(opts.model || process.env.POLLINATIONS_VIDEO_MODEL || 'seedance').trim();
  const params = new URLSearchParams();
  params.set('model', model);
  params.set('key', key);
  if (opts.duration) params.set('duration', String(opts.duration));
  if (opts.imageUrl) {
    params.set('image', opts.imageUrl);
    params.set('image[0]', opts.imageUrl);
  }
  const url = BASE + encodeURIComponent(q) + '?' + params.toString();
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'video/*,application/octet-stream',
        Authorization: 'Bearer ' + key,
      },
      redirect: 'follow',
      // video gen can be slow
      signal: AbortSignal.timeout(Number(opts.timeoutMs || 110000)),
    });
    if (!res.ok) {
      let detail = 'HTTP ' + res.status;
      try {
        const t = await res.text();
        if (t) detail += ' ' + t.slice(0, 200);
      } catch (_) {}
      return { ok: false, error: detail, url: url.replace(key, '***') };
    }
    const ctype = String(res.headers.get('content-type') || '');
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length || buf.length < 1000) {
      return { ok: false, error: 'empty video body', ctype };
    }
    // sometimes API returns JSON with url
    if (ctype.includes('json') || (buf[0] === 0x7b /* { */)) {
      try {
        const j = JSON.parse(buf.toString('utf8'));
        const media =
          j?.data?.[0]?.url || j?.url || j?.video_url || j?.output || null;
        if (media) {
          const r2 = await fetch(media, { signal: AbortSignal.timeout(60000) });
          if (!r2.ok) return { ok: false, error: 'fetch media HTTP ' + r2.status };
          const buf2 = Buffer.from(await r2.arrayBuffer());
          return { ok: true, buffer: buf2, prompt: q, model, via: 'url' };
        }
      } catch (_) {}
    }
    return { ok: true, buffer: buf, prompt: q, model, via: 'binary' };
  } catch (e) {
    return { ok: false, error: String(e && e.message ? e.message : e) };
  }
}

export async function generateVideoFromImage(imageUrl, prompt, opts = {}) {
  return generateVideoFromPrompt(prompt || 'animate this image smoothly', {
    ...opts,
    imageUrl,
  });
}

export default { generateVideoFromPrompt, generateVideoFromImage };
