/**
 * lib/packR1.js — Pack R1 helpers
 * debate, comic, watch (page monitor), detective, remix fix, voice split
 */

const UA = 'RadiantQueenBot/4.0 (+https://t.me/PasiyaMaxQueen_bot)';

/**
 * Split long text into chunks for TTS (Google TTS ~200 char safe).
 * @param {string} text
 * @param {number} [maxLen]
 * @returns {string[]}
 */
export function splitForTts(text, maxLen = 180) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (!t) return [];
  const max = Math.max(80, maxLen);
  if (t.length <= max) return [t];
  const parts = [];
  let rest = t;
  while (rest.length > 0 && parts.length < 4) {
    if (rest.length <= max) {
      parts.push(rest);
      break;
    }
    let cut = rest.lastIndexOf('. ', max);
    if (cut < max * 0.4) cut = rest.lastIndexOf(' ', max);
    if (cut < max * 0.3) cut = max;
    parts.push(rest.slice(0, cut + 1).trim());
    rest = rest.slice(cut + 1).trim();
  }
  return parts.filter(Boolean);
}

/**
 * Remix: generate N seed URLs + download with retries.
 * @param {string} prompt
 * @param {number} count
 */
export function buildRemixVariants(prompt, count = 3) {
  const q = String(prompt || '').trim().slice(0, 320);
  const n = Math.min(4, Math.max(2, count));
  const variants = [];
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
    variants.push({
      seed,
      url:
        'https://image.pollinations.ai/prompt/' +
        encodeURIComponent(q) +
        '?' +
        params.toString(),
    });
  }
  return { prompt: q, variants };
}

/**
 * Download image buffer from URL with timeout.
 * @param {string} url
 */
export async function downloadImage(url) {
  const res = await fetch(url, {
    headers: { Accept: 'image/*', 'User-Agent': UA },
    signal: AbortSignal.timeout(40000),
    redirect: 'follow',
  });
  if (!res.ok) return { ok: false, error: 'HTTP ' + res.status };
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 800) return { ok: false, error: 'tiny image' };
  return { ok: true, buffer: buf };
}

/**
 * Debate: 3 persona system prompts.
 */
export function debatePersonas() {
  return [
    {
      id: 'optimist',
      name: 'Optimist',
      system:
        'You are Optimist in a friendly debate. Argue the positive, hopeful side. 3-5 short sentences. No markdown headers.',
    },
    {
      id: 'skeptic',
      name: 'Skeptic',
      system:
        'You are Skeptic in a friendly debate. Challenge assumptions, demand evidence. 3-5 short sentences. No markdown headers.',
    },
    {
      id: 'judge',
      name: 'Judge',
      system:
        'You are Judge. Summarize both sides fairly and give a balanced verdict + one action tip. 4-6 short sentences.',
    },
  ];
}

/**
 * Comic: 6 panel story beats from theme.
 * @param {string} theme
 */
export function comicBeatsPrompt(theme) {
  return (
    'Create a 6-panel comic story outline about: ' +
    String(theme || 'a runner').slice(0, 200) +
    '\nReturn EXACTLY 6 lines in this format:\n' +
    '1|visual description for image gen|short dialogue\n' +
    '2|...|...\n' +
    'Through 6. Visual descriptions must be self-contained, cinematic, no text-in-image. English visuals OK even if dialogue Sinhala.'
  );
}

/**
 * Parse comic beats lines.
 * @param {string} text
 */
export function parseComicBeats(text) {
  const lines = String(text || '').split(/\n/).map((l) => l.trim()).filter(Boolean);
  const beats = [];
  for (const line of lines) {
    const m = line.match(/^(\d+)\|([^|]+)\|(.+)$/);
    if (m) {
      beats.push({
        n: parseInt(m[1], 10),
        visual: m[2].trim().slice(0, 200),
        dialogue: m[3].trim().slice(0, 120),
      });
    }
  }
  return beats.slice(0, 6);
}

/**
 * Simple text fingerprint for page change detection.
 * @param {string} html
 */
export function pageFingerprint(html) {
  const t = String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 50000);
  // djb2
  let h = 5381;
  for (let i = 0; i < t.length; i++) h = ((h << 5) + h) ^ t.charCodeAt(i);
  return {
    hash: (h >>> 0).toString(16),
    sample: t.slice(0, 280),
    len: t.length,
  };
}

/**
 * Fetch page for watch.
 * @param {string} url
 */
export async function fetchPageForWatch(url) {
  let u = String(url || '').trim();
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
  const res = await fetch(u, {
    headers: { 'User-Agent': UA, Accept: 'text/html' },
    signal: AbortSignal.timeout(18000),
    redirect: 'follow',
  });
  if (!res.ok) return { ok: false, error: 'HTTP ' + res.status };
  const html = await res.text();
  const fp = pageFingerprint(html);
  const title =
    (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1]
      ?.replace(/\s+/g, ' ')
      .trim()
      .slice(0, 120) || '';
  return { ok: true, ...fp, title, url: u };
}

/**
 * Detective mystery start prompt.
 */
export function detectiveStartPrompt(theme) {
  return (
    'You are a mystery game master. Theme: ' +
    String(theme || 'Colombo night run').slice(0, 160) +
    '\nSet the scene (4-6 sentences). Give the player 3 investigation options labeled A) B) C). ' +
    'Hide the culprit. Match language of theme. Wholesome, no gore.'
  );
}

export function detectiveContinuePrompt(theme, history, choice) {
  return (
    'Continue mystery. Theme: ' +
    String(theme || '').slice(0, 100) +
    '\nHistory:\n' +
    String(history || '').slice(0, 1400) +
    '\nPlayer chose: ' +
    String(choice || '') +
    '\nWrite next beat (4-6 sentences). End with A) B) C) options OR if solved write SOLVED: and reveal. Max 12 turns total.'
  );
}

export function parseABC(body) {
  const t = String(body || '').trim().toUpperCase();
  if (t === 'A' || /^A\b/.test(t)) return 'A';
  if (t === 'B' || /^B\b/.test(t)) return 'B';
  if (t === 'C' || /^C\b/.test(t)) return 'C';
  return null;
}

/**
 * Stride agent bridge client.
 * @param {string} system
 * @param {object} payload
 */
export async function callStrideAgent(system, payload) {
  const base = String(process.env.STRIDE_API_BASE || '').replace(/\/$/, '');
  const key = String(process.env.STRIDE_AGENT_KEY || '').trim();
  if (!base || !key) {
    return {
      ok: false,
      error:
        'STRIDE_API_BASE or STRIDE_AGENT_KEY not set. Add bridge on StrideClub first (see docs/STRIDE_BRIDGE.md).',
    };
  }
  try {
    const res = await fetch(base + '/api/agents/run', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + key,
        'User-Agent': UA,
      },
      body: JSON.stringify({ system, payload: payload || {} }),
      signal: AbortSignal.timeout(60000),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: j.error || 'HTTP ' + res.status };
    return { ok: true, data: j };
  } catch (e) {
    return { ok: false, error: String(e?.message || e).slice(0, 160) };
  }
}

export default {
  splitForTts,
  buildRemixVariants,
  downloadImage,
  debatePersonas,
  comicBeatsPrompt,
  parseComicBeats,
  pageFingerprint,
  fetchPageForWatch,
  detectiveStartPrompt,
  detectiveContinuePrompt,
  parseABC,
  callStrideAgent,
};
