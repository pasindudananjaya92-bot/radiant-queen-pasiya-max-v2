/**
 * lib/tts.js — megaR-fix
 * Free TTS: Google Translate TTS + optional EDGE_TTS_PROXY
 * voiceHint: 'male' | 'female' | 'alex' | 'rina' → distinct accents
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

/** Distinct Google TTS language codes (closest free "voices") */
const VOICE_TL = {
  male: 'en-GB', // British — deeper
  alex: 'en-GB',
  female: 'en-US', // US
  rina: 'en-AU', // Australian — clearly different
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

/**
 * @param {string} text
 * @param {string} [langOrVoice] lang code OR male/female/alex/rina
 */
export async function synthesizeSpeech(text, langOrVoice) {
  const clean = String(text || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180);
  if (!clean) return { ok: false, error: 'Empty text' };

  const key = String(langOrVoice || '').toLowerCase().trim();
  let tl;
  if (VOICE_TL[key]) {
    tl = VOICE_TL[key];
  } else if (LANG_MAP[key]) {
    tl = LANG_MAP[key];
  } else {
    tl = detectTtsLang(clean, langOrVoice);
  }

  // Optional edge-tts proxy (true male/female neural voices)
  // EDGE_TTS_PROXY_URL?lang=en&voice=en-GB-RyanNeural&text=
  const proxy = String(process.env.EDGE_TTS_PROXY_URL || '').trim();
  if (proxy) {
    try {
      let voice = '';
      if (key === 'male' || key === 'alex') voice = process.env.EDGE_TTS_MALE || 'en-GB-RyanNeural';
      if (key === 'female' || key === 'rina') voice = process.env.EDGE_TTS_FEMALE || 'en-US-AriaNeural';
      const url =
        proxy.replace(/\/$/, '') +
        '?lang=' +
        encodeURIComponent(tl) +
        (voice ? '&voice=' + encodeURIComponent(voice) : '') +
        '&text=' +
        encodeURIComponent(clean);
      const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length > 200) return { ok: true, buffer: buf, lang: tl, provider: 'edge-proxy', voice };
      }
    } catch (e) {
      console.log('[tts] edge-proxy fail', e.message);
    }
  }

  try {
    const url =
      'https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=' +
      encodeURIComponent(tl) +
      '&q=' +
      encodeURIComponent(clean);
    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Referer: 'https://translate.google.com/',
      },
      signal: AbortSignal.timeout(25000),
    });
    if (!res.ok) return { ok: false, error: 'TTS HTTP ' + res.status, lang: tl };
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 200) return { ok: false, error: 'TTS empty audio', lang: tl };
    return { ok: true, buffer: buf, lang: tl, provider: 'gtts' };
  } catch (e) {
    return { ok: false, error: String(e.message || e), lang: tl };
  }
}

export default { synthesizeSpeech, detectTtsLang };
