/**
 * lib/tts.js — QUALITY
 * Voice map: alex/male → en-GB, rina/female → en-AU, fallback en
 * Delay-friendly; empty audio → retry with en
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

const VOICE_TL = {
  male: 'en-GB',
  alex: 'en-GB',
  female: 'en-US',
  rina: 'en-AU',
  en: 'en',
  si: 'si',
  ta: 'ta',
  hi: 'hi',
};

export function detectTtsLang(text, forced) {
  if (forced && LANG_MAP[String(forced).toLowerCase()]) {
    return LANG_MAP[String(forced).toLowerCase()];
  }
  if (/[\u0D80-\u0DFF]/.test(text)) return 'si';
  if (/[\u0B80-\u0BFF]/.test(text)) return 'ta';
  if (/[\u0900-\u097F]/.test(text)) return 'hi';
  return 'en';
}

async function gttsFetch(text, tl) {
  const url =
    'https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=' +
    encodeURIComponent(tl) +
    '&q=' +
    encodeURIComponent(text);
  const res = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Referer: 'https://translate.google.com/',
      Accept: 'audio/mpeg, audio/*',
    },
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) return { ok: false, error: 'HTTP ' + res.status };
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 500) return { ok: false, error: 'empty/short audio ' + buf.length };
  return { ok: true, buffer: buf, lang: tl, provider: 'gtts' };
}

/**
 * @param {string} text
 * @param {string} [langOrVoice] male|female|alex|rina|en|si|...
 */
export async function synthesizeSpeech(text, langOrVoice) {
  const clean = String(text || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);
  if (!clean) return { ok: false, error: 'Empty text' };

  const key = String(langOrVoice || '').toLowerCase().trim();
  let primary;
  if (VOICE_TL[key]) primary = VOICE_TL[key];
  else if (LANG_MAP[key]) primary = LANG_MAP[key];
  else primary = detectTtsLang(clean, langOrVoice);

  // Edge proxy (optional neural)
  const proxy = String(process.env.EDGE_TTS_PROXY_URL || '').trim();
  if (proxy) {
    try {
      let voice = '';
      if (key === 'male' || key === 'alex')
        voice = process.env.EDGE_TTS_MALE || 'en-GB-RyanNeural';
      if (key === 'female' || key === 'rina')
        voice = process.env.EDGE_TTS_FEMALE || 'en-US-AriaNeural';
      const url =
        proxy.replace(/\/$/, '') +
        '?lang=' +
        encodeURIComponent(primary) +
        (voice ? '&voice=' + encodeURIComponent(voice) : '') +
        '&text=' +
        encodeURIComponent(clean);
      const res = await fetch(url, { signal: AbortSignal.timeout(35000) });
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length > 500)
          return { ok: true, buffer: buf, lang: primary, provider: 'edge-proxy', voice };
      }
    } catch (e) {
      console.log('[tts] edge-proxy', e.message);
    }
  }

  // Try primary tl, then en fallback
  const tryList = [primary];
  if (primary !== 'en') tryList.push('en');
  if (primary !== 'en-GB') tryList.push('en-GB');

  let lastErr = 'tts fail';
  for (const tl of tryList) {
    try {
      const r = await gttsFetch(clean, tl);
      if (r.ok) return r;
      lastErr = r.error || lastErr;
    } catch (e) {
      lastErr = String(e.message || e);
    }
  }
  return { ok: false, error: lastErr, lang: primary };
}

export default { synthesizeSpeech, detectTtsLang };
