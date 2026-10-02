/**
 * lib/tts.js — Pack A Step 2
 * Free TTS without API key:
 * 1) Google Translate TTS (si / en / ta / hi)
 * 2) Optional custom EDGE_TTS_PROXY_URL if you host edge-tts later
 */
const LANG_MAP = {
  si: 'si',
  sinhala: 'si',
  en: 'en',
  english: 'en',
  ta: 'ta',
  tamil: 'ta',
  hi: 'hi',
  hindi: 'hi',
};

export function detectTtsLang(text, forced) {
  if (forced && LANG_MAP[String(forced).toLowerCase()]) {
    return LANG_MAP[String(forced).toLowerCase()];
  }
  // Sinhala unicode range
  if (/[\u0D80-\u0DFF]/.test(text)) return 'si';
  if (/[\u0B80-\u0BFF]/.test(text)) return 'ta';
  if (/[\u0900-\u097F]/.test(text)) return 'hi';
  return 'en';
}

/**
 * @returns {Promise<{ok:boolean, buffer?:Buffer, lang?:string, error?:string, provider?:string}>}
 */
export async function synthesizeSpeech(text, langHint) {
  const clean = String(text || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180);
  if (!clean) return { ok: false, error: 'Empty text' };
  const lang = detectTtsLang(clean, langHint);

  // Optional self-hosted edge-tts proxy
  const proxy = String(process.env.EDGE_TTS_PROXY_URL || '').trim();
  if (proxy) {
    try {
      const url = proxy.replace(/\/$/, '') + '?lang=' + encodeURIComponent(lang) + '&text=' + encodeURIComponent(clean);
      const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length > 200) return { ok: true, buffer: buf, lang, provider: 'edge-proxy' };
      }
    } catch (e) {
      console.log('[tts] edge-proxy fail', e.message);
    }
  }

  // Google Translate TTS (no key) — split long text
  try {
    const q = encodeURIComponent(clean);
    const url =
      'https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=' +
      encodeURIComponent(lang) +
      '&q=' +
      q;
    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Referer: 'https://translate.google.com/',
      },
      signal: AbortSignal.timeout(25000),
    });
    if (!res.ok) {
      return { ok: false, error: 'TTS HTTP ' + res.status, lang };
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 200) return { ok: false, error: 'TTS empty audio', lang };
    return { ok: true, buffer: buf, lang, provider: 'gtts' };
  } catch (e) {
    return { ok: false, error: String(e.message || e), lang };
  }
}

export default { synthesizeSpeech, detectTtsLang };
