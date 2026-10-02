/**
 * lib/photoEdit.js
 * Pollinations image-to-image (kontext) — available to all users
 * Uses public image URL + prompt
 * GET https://image.pollinations.ai/prompt/{prompt}?model=kontext&image=URL
 */
export async function editPhotoWithPrompt(imageUrl, instruction) {
  const prompt = String(instruction || 'enhance this image').trim().slice(0, 400);
  const img = String(imageUrl || '').trim();
  if (!img) return { ok: false, error: 'no image url' };
  if (!prompt) return { ok: false, error: 'no instruction' };

  const params = new URLSearchParams({
    model: process.env.POLLINATIONS_EDIT_MODEL || 'kontext',
    image: img,
    width: '1024',
    height: '1024',
    nologo: 'true',
  });
  const key = String(process.env.POLLINATIONS_API_KEY || process.env.POLLINATIONS_KEY || '').trim();
  if (key) params.set('key', key);

  const url =
    'https://image.pollinations.ai/prompt/' +
    encodeURIComponent(prompt) +
    '?' +
    params.toString();

  try {
    const headers = { Accept: 'image/*' };
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
        if (t) detail += ' ' + t.slice(0, 160);
      } catch (_) {}
      return { ok: false, error: detail };
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length || buf.length < 500) {
      return { ok: false, error: 'empty image' };
    }
    return { ok: true, buffer: buf, prompt, url: url.replace(key || 'x', '***') };
  } catch (e) {
    return { ok: false, error: String(e && e.message ? e.message : e) };
  }
}

/** Map short aliases → full edit prompts */
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

export default { editPhotoWithPrompt, expandPhotoEditAlias };
