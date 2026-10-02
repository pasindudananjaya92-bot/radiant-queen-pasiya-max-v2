/**
 * lib/videoGen.js — P10a-fix
 * Live video models from https://gen.pollinations.ai/video/models (2026)
 * Old alias "seedance" is INVALID → use seedance-2.0-fast / wan-2.7 / etc.
 */
const BASE = 'https://gen.pollinations.ai/video/';

/** Prefer cheaper / shorter first */
const VIDEO_MODELS = [
  'seedance-2.0-fast',
  'seedance-2.0-mini',
  'seedance-2.5',
  'wan-2.7',
  'happyhorse-1.1',
  'bytedance/seedance-2.0-fast',
  'alibaba/wan-2.7',
  'alibaba/happyhorse-1.1',
  'google/gemini-omni-1.1-flash',
  'minimax/minimax-h3',
];

function apiKey() {
  return String(process.env.POLLINATIONS_API_KEY || process.env.POLLINATIONS_KEY || '').trim();
}

async function fetchVideoOnce(prompt, model, imageUrl, timeoutMs) {
  const key = apiKey();
  const params = new URLSearchParams();
  params.set('model', model);
  params.set('key', key);
  // short default — less pollen
  params.set('duration', String(process.env.POLLINATIONS_VIDEO_DURATION || '5'));
  if (imageUrl) {
    params.set('image', imageUrl);
    params.set('image[0]', imageUrl);
  }
  const url = BASE + encodeURIComponent(prompt) + '?' + params.toString();
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'video/*,application/octet-stream,application/json',
      Authorization: 'Bearer ' + key,
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    let detail = 'HTTP ' + res.status;
    try {
      const t = await res.text();
      if (t) detail += ' ' + t.slice(0, 280);
    } catch (_) {}
    return { ok: false, error: detail, model };
  }
  const ctype = String(res.headers.get('content-type') || '');
  const buf = Buffer.from(await res.arrayBuffer());
  if (!buf.length || buf.length < 800) {
    return { ok: false, error: 'empty body', model, ctype };
  }
  // JSON wrapper with URL
  if (ctype.includes('json') || buf[0] === 0x7b) {
    try {
      const j = JSON.parse(buf.toString('utf8'));
      const media =
        j?.data?.[0]?.url || j?.url || j?.video_url || j?.output || null;
      if (media) {
        const r2 = await fetch(String(media), {
          signal: AbortSignal.timeout(60000),
        });
        if (!r2.ok) return { ok: false, error: 'media HTTP ' + r2.status, model };
        const buf2 = Buffer.from(await r2.arrayBuffer());
        return { ok: true, buffer: buf2, prompt, model, via: 'url' };
      }
      if (j?.error || j?.success === false) {
        return {
          ok: false,
          error: JSON.stringify(j.error || j).slice(0, 280),
          model,
        };
      }
    } catch (_) {}
  }
  return { ok: true, buffer: buf, prompt, model, via: 'binary' };
}

export async function generateVideoFromPrompt(prompt, opts = {}) {
  const q = String(prompt || '').trim().slice(0, 500);
  if (!q) return { ok: false, error: 'empty prompt' };
  const key = apiKey();
  if (!key) {
    return {
      ok: false,
      error:
        'POLLINATIONS_API_KEY missing. Get key at enter.pollinations.ai → Vercel env → redeploy. Also claim free Pollen once in the dashboard.',
    };
  }
  const preferred = String(
    opts.model || process.env.POLLINATIONS_VIDEO_MODEL || ''
  ).trim();
  const models = preferred
    ? [preferred, ...VIDEO_MODELS.filter((m) => m !== preferred)]
    : VIDEO_MODELS.slice();
  const timeoutMs = Number(opts.timeoutMs || 110000);
  const errors = [];
  for (const model of models) {
    try {
      const out = await fetchVideoOnce(q, model, opts.imageUrl || null, timeoutMs);
      if (out.ok) return out;
      errors.push(model + ': ' + (out.error || 'fail'));
      // invalid model → try next; insufficient pollen → stop early
      if (/pollen|balance|insufficient|402|payment/i.test(String(out.error || ''))) {
        break;
      }
    } catch (e) {
      errors.push(model + ': ' + String(e.message || e));
    }
  }
  return {
    ok: false,
    error: errors.slice(0, 6).join(' | ') || 'all models failed',
  };
}

export async function generateVideoFromImage(imageUrl, prompt, opts = {}) {
  return generateVideoFromPrompt(prompt || 'animate this image smoothly, natural motion', {
    ...opts,
    imageUrl,
  });
}

export default { generateVideoFromPrompt, generateVideoFromImage, VIDEO_MODELS };
