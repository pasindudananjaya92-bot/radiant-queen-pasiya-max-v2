/**
 * lib/packFUtils.js — Pack F free utilities
 * QR via api.qrserver.com (no key)
 */
export async function makeQrPng(text, size = 400) {
  const data = String(text || '').trim();
  if (!data) return { ok: false, error: 'Empty text' };
  const url =
    'https://api.qrserver.com/v1/create-qr-code/?size=' +
    size +
    'x' +
    size +
    '&margin=8&data=' +
    encodeURIComponent(data.slice(0, 1200));
  const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) return { ok: false, error: 'QR HTTP ' + res.status };
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 100) return { ok: false, error: 'QR empty' };
  return { ok: true, buffer: buf, url };
}

export async function fetchLinkMeta(url) {
  let u = String(url || '').trim();
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
  try {
    const { fetchPageBoosted } = await import('./webBoost.js');
    const page = await fetchPageBoosted(u);
    if (!page.ok) return page;
    const text = page.text || '';
    const title =
      (text.match(/^Title:\s*(.+)$/mi) || [])[1] ||
      text.split('\n').find((l) => l.trim().length > 8)?.slice(0, 120) ||
      u;
    const snippet = text.replace(/\s+/g, ' ').slice(0, 280);
    return {
      ok: true,
      finalUrl: page.finalUrl || u,
      title: String(title).slice(0, 140),
      snippet,
      provider: page.provider || 'fetch',
    };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
}

export default { makeQrPng, fetchLinkMeta };
