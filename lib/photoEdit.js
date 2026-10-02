/**
 * lib/photoEdit.js — P10a-fix
 * "kontext" is no longer a free/public alias on image.pollinations.ai.
 * Use gen.pollinations.ai image models that accept image input (2026 registry).
 */
const EDIT_MODELS = [
  'microsoft/mai-image-2.6-flash',
  'microsoft/mai-image-2.6',
  'openai/gpt-image-2.5-flare',
  'qwen/qwen-image-2.1',
  'tongyi-mai/z-image-turbo',
  'z-image-turbo',
  'zimage',
];

function apiKey() {
  return String(process.env.POLLINATIONS_API_KEY || process.env.POLLINATIONS_KEY || '').trim();
}

export function expandPhotoEditAlias(raw) {
  const s = String(raw || '').trim().toLowerCase();
  const map = {
    enhance: 'enhance this photo, sharper details, natural colors, high quality',
    cartoon: 'turn this photo into a colorful cartoon illustration',
    anime: 'turn this photo into anime style artwork',
    blur: 'apply soft artistic blur background, subject sharp',
    bw: 'convert this photo to dramatic black and white',
    'black and white': 'convert this photo to dramatic black and white',
    sunset: 'add warm sunset lighting and golden hour sky to this photo',
    paint: 'turn this photo into an oil painting',
    sketch: 'turn this photo into a pencil sketch',
  };
  if (map[s]) return map[s];
  return String(raw || '').trim();
}

async function tryEdit(base, prompt, imageUrl, model, key) {
  const params = new URLSearchParams();
  params.set('model', model);
  params.set('image', imageUrl);
  params.set('width', '1024');
  params.set('height', '1024');
  params.set('nologo', 'true');
  if (key) params.set('key', key);

  const url = base + encodeURIComponent(prompt) + '?' + params.toString();
  const headers = { Accept: 'image/*,application/json' };
  if (key) headers.Authorization = 'Bearer ' + key;

  const res = await fetch(url, {
    headers,
    redirect: 'follow',
    signal: AbortSignal.timeout(90000),
  });
  if (!res.ok) {
    let detail = 'HTTP ' + res.status;
    try {
      const t = await res.text();
      if (t) detail += ' ' + t.slice(0, 220);
    } catch (_) {}
    return { ok: false, error: detail, model };
  }
  const ctype = String(res.headers.get('content-type') || '');
  const buf = Buffer.from(await res.arrayBuffer());
  if (ctype.includes('json') || (buf.length && buf[0] === 0x7b)) {
    try {
      const j = JSON.parse(buf.toString('utf8'));
      const media = j?.data?.[0]?.url || j?.url || null;
      if (media) {
        const r2 = await fetch(String(media), { signal: AbortSignal.timeout(60000) });
        if (!r2.ok) return { ok: false, error: 'media HTTP ' + r2.status, model };
        const buf2 = Buffer.from(await r2.arrayBuffer());
        return { ok: true, buffer: buf2, prompt, model, via: 'url' };
      }
      return { ok: false, error: JSON.stringify(j).slice(0, 220), model };
    } catch (_) {}
  }
  if (!buf.length || buf.length < 500) {
    return { ok: false, error: 'empty image', model };
  }
  return { ok: true, buffer: buf, prompt, model, via: 'binary' };
}

export async function editPhotoWithPrompt(imageUrl, instruction) {
  const prompt = String(instruction || 'enhance this image').trim().slice(0, 400);
  const img = String(imageUrl || '').trim();
  if (!img) return { ok: false, error: 'no image url' };
  if (!prompt) return { ok: false, error: 'no instruction' };

  const key = apiKey();
  const preferred = String(process.env.POLLINATIONS_EDIT_MODEL || '').trim();
  const models = preferred
    ? [preferred, ...EDIT_MODELS.filter((m) => m !== preferred)]
    : EDIT_MODELS.slice();

  // Prefer unified API when key present; also try classic image host
  const bases = key
    ? [
        'https://gen.pollinations.ai/image/',
        'https://image.pollinations.ai/prompt/',
      ]
    : ['https://image.pollinations.ai/prompt/', 'https://gen.pollinations.ai/image/'];

  const errors = [];
  for (const base of bases) {
    for (const model of models) {
      try {
        const out = await tryEdit(base, prompt, img, model, key);
        if (out.ok) return out;
        errors.push(model + '@' + base.split('/')[2] + ': ' + (out.error || 'fail'));
        if (/pollen|balance|insufficient|402|payment/i.test(String(out.error || ''))) {
          return {
            ok: false,
            error:
              'Pollen balance low / payment required. Open enter.pollinations.ai and claim free Pollen, then retry. ' +
              (out.error || ''),
          };
        }
      } catch (e) {
        errors.push(model + ': ' + String(e.message || e));
      }
    }
  }

  // Last resort: style rewrite without reference (still useful)
  if (key) {
    try {
      const params = new URLSearchParams({
        model: 'z-image-turbo',
        nologo: 'true',
        width: '1024',
        height: '1024',
        key,
      });
      const url =
        'https://gen.pollinations.ai/image/' +
        encodeURIComponent(prompt + ' (inspired by reference photo)') +
        '?' +
        params.toString();
      const res = await fetch(url, {
        headers: { Authorization: 'Bearer ' + key, Accept: 'image/*' },
        signal: AbortSignal.timeout(90000),
      });
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length > 500) {
          return {
            ok: true,
            buffer: buf,
            prompt,
            model: 'z-image-turbo',
            via: 'text-fallback',
            note: 'reference edit failed; generated from text instruction',
          };
        }
      }
    } catch (_) {}
  }

  return {
    ok: false,
    error:
      (key
        ? ''
        : 'POLLINATIONS_API_KEY missing for photo edit. ') +
      errors.slice(0, 5).join(' | '),
  };
}

export default { editPhotoWithPrompt, expandPhotoEditAlias, EDIT_MODELS };
