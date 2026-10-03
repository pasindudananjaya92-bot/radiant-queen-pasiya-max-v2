/**
 * lib/packJ.js — Pack J helpers
 * translate, wiki-random, giveaway utils
 */
const UA = 'RadiantQueenBot/4.0 (+https://t.me/PasiyaMaxQueen_bot)';

const LANG_MAP = {
  si: 'si',
  sinhala: 'si',
  en: 'en',
  english: 'en',
  ta: 'ta',
  tamil: 'ta',
  hi: 'hi',
  auto: 'auto',
};

export function parseTranslateArgs(text) {
  const raw = String(text || '').trim();
  // /translate si en hello
  // /translate en:si hello
  // /tr si->en hello
  let m = raw.match(/^(\w{2,8})\s*(?:->|:)\s*(\w{2,8})\s+([\s\S]+)$/i);
  if (m) {
    return {
      from: LANG_MAP[m[1].toLowerCase()] || m[1].toLowerCase(),
      to: LANG_MAP[m[2].toLowerCase()] || m[2].toLowerCase(),
      q: m[3].trim(),
    };
  }
  m = raw.match(/^(\w{2,8})\s+(\w{2,8})\s+([\s\S]+)$/i);
  if (m) {
    return {
      from: LANG_MAP[m[1].toLowerCase()] || m[1].toLowerCase(),
      to: LANG_MAP[m[2].toLowerCase()] || m[2].toLowerCase(),
      q: m[3].trim(),
    };
  }
  // default: auto -> en if latin-heavy else auto -> si
  if (raw) {
    const hasSi = /[\u0D80-\u0DFF]/.test(raw);
    return { from: 'auto', to: hasSi ? 'en' : 'si', q: raw };
  }
  return null;
}

export async function translateText(q, from, to) {
  const text = String(q || '').slice(0, 800);
  if (!text) return { ok: false, error: 'empty' };
  const fr = from === 'auto' ? 'auto' : from;
  const url =
    'https://api.mymemory.translated.net/get?q=' +
    encodeURIComponent(text) +
    '&langpair=' +
    encodeURIComponent(fr + '|' + to);
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) return { ok: false, error: 'HTTP ' + res.status };
  const j = await res.json();
  const out = j?.responseData?.translatedText;
  if (!out) return { ok: false, error: j?.responseDetails || 'no translation' };
  // MyMemory sometimes returns QUERY LENGTH LIMIT etc
  if (/INVALID|LIMIT|MYMEMORY WARNING/i.test(out) && out.length < 80) {
    return { ok: false, error: out };
  }
  return {
    ok: true,
    text: out,
    from: j?.responseData?.detectedSourceLanguage || fr,
    to,
    provider: 'mymemory',
  };
}

export async function randomWiki() {
  // random English page title then summary
  const r = await fetch('https://en.wikipedia.org/api/rest_v1/page/random/summary', {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) return { ok: false, error: 'HTTP ' + r.status };
  const j = await r.json();
  return {
    ok: true,
    title: j.title,
    extract: j.extract || j.description || '',
    url: j.content_urls?.desktop?.page || j.content_urls?.mobile?.page || '',
    thumbnail: j.thumbnail?.source || '',
  };
}

export function parseGiveawayStart(text) {
  // prize | minutes
  const raw = String(text || '').trim();
  if (!raw) return null;
  const parts = raw.split('|').map((s) => s.trim());
  const prize = (parts[0] || '').slice(0, 200);
  let mins = 10;
  if (parts[1]) {
    const n = parseInt(parts[1].replace(/[^\d]/g, ''), 10);
    if (n > 0) mins = Math.min(1440, n);
  } else {
    const m = raw.match(/(\d+)\s*m(in)?/i);
    if (m) mins = Math.min(1440, parseInt(m[1], 10));
  }
  if (!prize) return null;
  return { prize, mins };
}

export function pickWinner(entries) {
  const list = Array.isArray(entries) ? entries.filter(Boolean) : [];
  if (!list.length) return null;
  const i = Math.floor(Math.random() * list.length);
  return list[i];
}

export default {
  parseTranslateArgs,
  translateText,
  randomWiki,
  parseGiveawayStart,
  pickWinner,
};
