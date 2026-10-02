/**
 * lib/photoEdit.js — P11-fix
 *
 * BUGFIX: Pollinations was returning the same cached "default" image because:
 *  - enhance=true rewrote prompts into a generic scene
 *  - no seed → same URL → CDN cache hit (woman-in-dress etc.)
 *
 * Now:
 *  - enhance=false always
 *  - random seed every request
 *  - private=true when supported
 *  - unique noise token in prompt to bust cache
 *  - dedicated fetch (does NOT call generateImagineImage)
 */
function apiKey() {
  return String(process.env.POLLINATIONS_API_KEY || process.env.POLLINATIONS_KEY || '').trim();
}

export function expandPhotoEditAlias(raw) {
  const s = String(raw || '').trim().toLowerCase();
  const map = {
    enhance: 'sharper details, natural colors, clean photorealistic quality boost',
    cartoon: 'colorful cartoon illustration style, bold outlines, vibrant flat colors',
    anime: 'Japanese anime art style, detailed, studio quality',
    blur: 'soft bokeh background, subject in sharp focus, shallow depth of field',
    bw: 'black and white photography, high contrast, film look',
    'black and white': 'black and white photography, high contrast, film look',
    sunset: 'golden hour warm sunset lighting, orange sky, cinematic',
    paint: 'classical oil painting style, visible brush strokes',
    sketch: 'detailed graphite pencil sketch, shading',
  };
  if (map[s]) return map[s];
  return String(raw || '').trim();
}

function buildEditPrompt(instruction, sceneDescription) {
  const inst = String(instruction || '').trim().slice(0, 280);
  const scene = String(sceneDescription || '').trim().slice(0, 420);
  // unique token so CDN never serves a previous image for "cartoon" alone
  const noise = 'ref' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  if (scene && scene.length > 20) {
    return (
      'Based on this exact scene: ' +
      scene +
      '. Apply only this visual change: ' +
      inst +
      '. Keep the same subject and composition. ' +
      noise
    ).slice(0, 950);
  }
  return (
    'Create an original image: ' + inst + '. High detail, coherent. ' + noise
  ).slice(0, 950);
}

async function fetchFreeImage(prompt) {
  const seed = String(Math.floor(Math.random() * 2147483646) + 1);
  const params = new URLSearchParams({
    width: '1024',
    height: '1024',
    // flux can ignore short prompts; zimage/turbo often more obedient on free host
    model: process.env.POLLINATIONS_EDIT_FREE_MODEL || 'flux',
    nologo: 'true',
    enhance: 'false',
    private: 'true',
    seed,
  });
  // cache-bust query
  params.set('t', Date.now().toString(36));

  const url =
    'https://image.pollinations.ai/prompt/' +
    encodeURIComponent(prompt) +
    '?' +
    params.toString();

  const res = await fetch(url, {
    headers: {
      Accept: 'image/*',
      // avoid intermediary caches
      'Cache-Control': 'no-cache',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(90000),
  });
  if (!res.ok) {
    let detail = 'HTTP ' + res.status;
    try {
      detail += ' ' + (await res.text()).slice(0, 120);
    } catch (_) {}
    return { ok: false, error: detail, url, seed };
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (!buf.length || buf.length < 800) {
    return { ok: false, error: 'empty image body', seed };
  }
  // JSON error body
  if (buf[0] === 0x7b) {
    try {
      const j = JSON.parse(buf.toString('utf8'));
      return { ok: false, error: JSON.stringify(j).slice(0, 200), seed };
    } catch (_) {}
  }
  return { ok: true, buffer: buf, seed, prompt };
}

async function tryPaidImg2Img(prompt, imageUrl, model, key) {
  const seed = String(Math.floor(Math.random() * 2147483646) + 1);
  const params = new URLSearchParams({
    model,
    image: imageUrl,
    width: '1024',
    height: '1024',
    nologo: 'true',
    enhance: 'false',
    seed,
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
      d += ' ' + (await res.text()).slice(0, 140);
    } catch (_) {}
    return { ok: false, error: d };
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 800 || buf[0] === 0x7b) return { ok: false, error: 'bad body' };
  return { ok: true, buffer: buf, model, mode: 'paid-img2img', seed };
}

/**
 * @param {string} imageUrl
 * @param {string} instruction
 * @param {{ sceneDescription?: string, debug?: boolean }} [opts]
 */
export async function editPhotoWithPrompt(imageUrl, instruction, opts = {}) {
  const inst = String(instruction || '').trim().slice(0, 400);
  if (!inst) return { ok: false, error: 'no instruction' };

  const scene = String(opts.sceneDescription || '').trim();
  const prompt = buildEditPrompt(inst, scene);

  // Debug string for Telegram caption (short)
  const debugBits = [];
  debugBits.push(scene ? 'vision:yes' : 'vision:no');
  debugBits.push('promptChars:' + prompt.length);

  // 1) FREE dedicated path (no enhance, random seed)
  const free = await fetchFreeImage(prompt);
  if (free.ok) {
    return {
      ok: true,
      buffer: free.buffer,
      prompt,
      seed: free.seed,
      mode: scene ? 'vision-guided-free' : 'instruction-free',
      note:
        (scene
          ? 'Vision saw your photo → free restyle. '
          : 'Vision miss — used your text only. ') +
        'No Paid Pollen. seed=' +
        free.seed,
      debug: debugBits.join(' · '),
    };
  }

  // 2) Paid img2img only if pollen available
  const key = apiKey();
  if (key && imageUrl) {
    for (const model of [
      'microsoft/mai-image-2.6-flash',
      'microsoft/mai-image-2.6',
      'openai/gpt-image-2.5-flare',
    ]) {
      try {
        const out = await tryPaidImg2Img(inst, imageUrl, model, key);
        if (out.ok) {
          return {
            ...out,
            prompt: inst,
            note: 'Paid img2img (' + model + ')',
          };
        }
        if (/402|pollen|insufficient|balance/i.test(String(out.error || ''))) break;
      } catch (_) {}
    }
  }

  return {
    ok: false,
    error:
      (free.error || 'free gen failed') +
      ' | Retry with a clearer instruction. /imagine still works.',
    debug: debugBits.join(' · '),
  };
}

export default { editPhotoWithPrompt, expandPhotoEditAlias, buildEditPrompt };
