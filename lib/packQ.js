/**
 * lib/packQ.js — Pack Q helpers
 * autopilot track, remix multi-seed, dream path, voicedigest
 */

const UA = 'RadiantQueenBot/4.0 (+https://t.me/PasiyaMaxQueen_bot)';

/**
 * Parse /track <url> <target_price>
 * /track https://example.com/product 15000
 */
export function parseTrackArgs(body) {
  const raw = String(body || '').trim();
  if (!raw) return null;
  const m = raw.match(/^(https?:\/\/\S+)\s+([\d.,]+)\s*$/i);
  if (!m) {
    // url only
    const u = raw.match(/^(https?:\/\/\S+)/i);
    if (u) return { url: u[1], target: null };
    return null;
  }
  const target = parseFloat(m[2].replace(/,/g, ''));
  if (!Number.isFinite(target) || target <= 0) return { url: m[1], target: null };
  return { url: m[1], target };
}

/**
 * Best-effort price extract from HTML text.
 * @param {string} html
 */
export function extractPriceFromHtml(html) {
  const t = String(html || '');
  // JSON-LD offers
  const ld = t.match(/"price"\s*:\s*"?([\d.]+)"?/i);
  if (ld) {
    const n = parseFloat(ld[1]);
    if (Number.isFinite(n) && n > 0) return { price: n, source: 'json-ld' };
  }
  // meta product:price
  const meta = t.match(/property=["']product:price:amount["'][^>]*content=["']([\d.]+)/i)
    || t.match(/content=["']([\d.]+)["'][^>]*property=["']product:price:amount["']/i);
  if (meta) {
    const n = parseFloat(meta[1]);
    if (Number.isFinite(n) && n > 0) return { price: n, source: 'meta' };
  }
  // Rs. 12,500 or LKR 12500 or $99.99
  const money = [
    ...t.matchAll(/(?:Rs\.?|LKR|USD|\$|€)\s*([\d,]+(?:\.\d{1,2})?)/gi),
  ].map((x) => parseFloat(x[1].replace(/,/g, ''))).filter((n) => n > 10 && n < 1e8);
  if (money.length) {
    // median-ish: sort and pick lower quartile to avoid "was 99999"
    money.sort((a, b) => a - b);
    const pick = money[Math.floor(money.length * 0.25)] || money[0];
    return { price: pick, source: 'regex' };
  }
  return { price: null, source: 'none' };
}

/**
 * Fetch page and extract price (no Firecrawl key needed for simple fetch).
 * @param {string} url
 */
export async function fetchPagePrice(url) {
  let u = String(url || '').trim();
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
  try {
    const res = await fetch(u, {
      headers: {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(18000),
      redirect: 'follow',
    });
    if (!res.ok) return { ok: false, error: 'HTTP ' + res.status };
    const html = await res.text();
    const extracted = extractPriceFromHtml(html.slice(0, 400000));
    return {
      ok: true,
      price: extracted.price,
      source: extracted.source,
      title: (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1]
        ?.replace(/\s+/g, ' ')
        .trim()
        .slice(0, 120) || '',
    };
  } catch (e) {
    return { ok: false, error: String(e?.message || e).slice(0, 160) };
  }
}

/**
 * Multi-seed Pollinations URLs (client downloads).
 * @param {string} prompt
 * @param {number} count
 */
export function remixSeedUrls(prompt, count = 4) {
  const q = String(prompt || '').trim().slice(0, 350);
  const n = Math.min(6, Math.max(2, count));
  const urls = [];
  for (let i = 0; i < n; i++) {
    const seed = Math.floor(Math.random() * 1e9);
    const params = new URLSearchParams({
      width: '768',
      height: '768',
      model: process.env.POLLINATIONS_MODEL || 'flux',
      nologo: 'true',
      enhance: 'false',
      seed: String(seed),
    });
    urls.push({
      seed,
      url:
        'https://image.pollinations.ai/prompt/' +
        encodeURIComponent(q) +
        '?' +
        params.toString(),
    });
  }
  return { prompt: q, variants: urls };
}

/**
 * Dream session state machine helpers.
 */
export function dreamStartPrompt(theme) {
  return (
    'You are a choose-your-path adventure narrator for Radiant Queen. ' +
    'Theme: ' +
    String(theme || 'mystery run').slice(0, 200) +
    '\nWrite scene 1 (4-7 short sentences, vivid). End with exactly 3 choices labeled A) B) C). ' +
    'Match language of the theme (Sinhala or English). No spoilers beyond this scene.'
  );
}

export function dreamContinuePrompt(theme, history, choice) {
  return (
    'Continue the choose-your-path adventure.\nTheme: ' +
    String(theme || '').slice(0, 120) +
    '\nPrior scenes summary:\n' +
    String(history || '').slice(0, 1200) +
    '\nPlayer chose: ' +
    String(choice || '').slice(0, 80) +
    '\nWrite next scene (4-7 sentences). End with exactly 3 choices A) B) C) OR if story should end, write ENDING: and a closing paragraph with no choices. ' +
    'Match language. Keep wholesome and adventurous.'
  );
}

/**
 * Parse player choice A/B/C from body.
 */
export function parseDreamChoice(body) {
  const t = String(body || '').trim().toUpperCase();
  if (/^A\b/.test(t) || t === 'A') return 'A';
  if (/^B\b/.test(t) || t === 'B') return 'B';
  if (/^C\b/.test(t) || t === 'C') return 'C';
  const m = t.match(/^[ABC]/);
  return m ? m[0] : null;
}

export default {
  parseTrackArgs,
  extractPriceFromHtml,
  fetchPagePrice,
  remixSeedUrls,
  dreamStartPrompt,
  dreamContinuePrompt,
  parseDreamChoice,
};
