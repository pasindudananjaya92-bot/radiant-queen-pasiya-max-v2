/**
 * lib/imagine.js — Pollinations.ai image gen (no API key)
 */
export async function generateImagineImage(prompt) {
  const q = String(prompt || '').trim().slice(0, 400);
  if (!q) return { ok: false, error: 'empty prompt' };
  const params = new URLSearchParams({
    width: '1024',
    height: '1024',
    model: process.env.POLLINATIONS_MODEL || 'flux',
    nologo: 'true',
    enhance: 'true',
  });
  const url =
    'https://image.pollinations.ai/prompt/' +
    encodeURIComponent(q) +
    '?' +
    params.toString();
  try {
    const res = await fetch(url, {
      headers: { Accept: 'image/*' },
      redirect: 'follow',
    });
    if (!res.ok) return { ok: false, error: 'HTTP ' + res.status, url };
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length || buf.length < 500) {
      return { ok: false, error: 'empty image', url };
    }
    return { ok: true, buffer: buf, url, prompt: q };
  } catch (e) {
    return { ok: false, error: String(e && e.message ? e.message : e), url };
  }
}

export default { generateImagineImage };
