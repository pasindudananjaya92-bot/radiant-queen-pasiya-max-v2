/**
 * lib/packMega.js — QUALITY pack
 * Images: Telegram fetches Pollinations URLs (no Vercel download = no timeout)
 * Embeddings: gemini-embedding-001 → gemini-embedding-2
 */
const UA = 'RadiantQueenBot/4.0 (+https://t.me/PasiyaMaxQueen_bot)';

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export function buildSeedImageUrl(prompt, seed) {
  const q = String(prompt || '').trim().slice(0, 300);
  const params = new URLSearchParams({
    width: '768',
    height: '768',
    model: process.env.POLLINATIONS_MODEL || 'flux',
    nologo: 'true',
    enhance: 'false',
    seed: String(seed ?? Math.floor(Math.random() * 1e9)),
  });
  return (
    'https://image.pollinations.ai/prompt/' +
    encodeURIComponent(q) +
    '?' +
    params.toString()
  );
}

/**
 * Build Telegram mediaGroup items using URL media (Telegram CDN fetches).
 * This is the quality path — avoids serverless download timeouts.
 */
export function buildUrlMediaGroup(prompt, count = 2) {
  const n = Math.min(4, Math.max(1, count));
  const base = String(prompt || 'cinematic scene').trim().slice(0, 240);
  const media = [];
  for (let i = 0; i < n; i++) {
    const seed = Math.floor(Math.random() * 1e9);
    const variation =
      i === 0
        ? base
        : base + ' , variation ' + (i + 1) + ', different composition';
    const url = buildSeedImageUrl(variation, seed);
    media.push({
      type: 'photo',
      media: url,
      caption:
        i === 0
          ? (base + '\nseed ' + seed).slice(0, 900)
          : ('seed ' + seed).slice(0, 200),
    });
  }
  return media;
}

/** Comic panels as URL media group */
export function buildComicMediaGroup(beats) {
  const media = [];
  for (const b of (beats || []).slice(0, 4)) {
    const seed = Math.floor(Math.random() * 1e9);
    const visual = String(b.visual || b.dialogue || 'comic panel').slice(0, 220);
    media.push({
      type: 'photo',
      media: buildSeedImageUrl(visual + ', comic panel illustration', seed),
      caption: String((b.n || media.length + 1) + '. ' + (b.dialogue || '')).slice(0, 200),
    });
  }
  return media;
}

export async function downloadImage(url) {
  const res = await fetch(url, {
    headers: { Accept: 'image/*', 'User-Agent': UA },
    signal: AbortSignal.timeout(40000),
    redirect: 'follow',
  });
  if (!res.ok) return { ok: false, error: 'HTTP ' + res.status };
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 800) return { ok: false, error: 'tiny' };
  return { ok: true, buffer: buf };
}

/** Legacy buffer album — prefer buildUrlMediaGroup */
export async function downloadSeedAlbum(prompt, maxCount = 2) {
  const media = buildUrlMediaGroup(prompt, maxCount);
  const out = [];
  for (const m of media) {
    out.push({
      buffer: null,
      url: m.media,
      seed: (m.caption || '').match(/seed (\d+)/)?.[1],
      caption: m.caption,
    });
  }
  return out;
}

export async function embedText(text) {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
  if (!key) return { ok: false, error: 'no GEMINI_API_KEY' };
  const models = [
    process.env.GEMINI_EMBED_MODEL || 'gemini-embedding-001',
    'gemini-embedding-001',
    'gemini-embedding-2',
  ];
  const seen = new Set();
  let lastErr = 'embed failed';
  for (const model of models) {
    if (seen.has(model)) continue;
    seen.add(model);
    try {
      const url =
        'https://generativelanguage.googleapis.com/v1beta/models/' +
        model +
        ':embedContent?key=' +
        encodeURIComponent(key);
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: { parts: [{ text: String(text || '').slice(0, 8000) }] },
          outputDimensionality: 768,
        }),
        signal: AbortSignal.timeout(25000),
      });
      const j = await res.json().catch(() => ({}));
      const values =
        j?.embedding?.values ||
        j?.embeddings?.[0]?.values ||
        j?.embeddings?.[0]?.embedding?.values;
      if (res.ok && values?.length) {
        return { ok: true, embedding: values, model, dims: values.length };
      }
      lastErr = j.error?.message || 'HTTP ' + res.status + ' ' + model;
    } catch (e) {
      lastErr = String(e.message || e);
    }
  }
  return { ok: false, error: lastErr };
}

export function cosineSim(a, b) {
  if (!a?.length || !b?.length) return 0;
  const n = Math.min(a.length, b.length);
  let dot = 0,
    na = 0,
    nb = 0;
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (!na || !nb) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export function podcastScriptPrompt(topic) {
  return (
    'Write a natural 2-host podcast about: ' +
    String(topic || 'running').slice(0, 200) +
    '\nHosts: ALEX (curious) and RINA (expert).\n' +
    'Format EXACTLY:\nALEX: line\nRINA: line\n' +
    '8-10 short turns. Match language of topic. No markdown.'
  );
}

export function parsePodcastLines(text) {
  const lines = [];
  for (const raw of String(text || '').split(/\n/)) {
    const t = raw.trim();
    const m = t.match(/^(ALEX|RINA|HOST\s*1|HOST\s*2|A|B)\s*[:：]\s*(.+)$/i);
    if (m) {
      const who = /RINA|HOST\s*2|^B$/i.test(m[1]) ? 'RINA' : 'ALEX';
      lines.push({ who, text: m[2].trim().slice(0, 160) });
    }
  }
  return lines.slice(0, 12);
}

export function newsPodcastPrompt(itemsText) {
  return (
    'Morning podcast (ALEX + RINA) from headlines.\n' +
    'Format:\nALEX: ...\nRINA: ...\n6-8 turns.\n\n' +
    String(itemsText || '').slice(0, 2500)
  );
}

export function comicBeatsPrompt(theme) {
  return (
    'Create a 4-panel comic about: ' +
    String(theme || 'hero').slice(0, 200) +
    '\nEXACTLY 4 lines:\n1|visual for image gen|short dialogue\n2|...|...\n3|...|...\n4|...|...\n' +
    'Visuals cinematic, self-contained. English visuals OK.'
  );
}

export function parseComicBeats(text) {
  const beats = [];
  for (const line of String(text || '').split(/\n/)) {
    const m = line.trim().match(/^(\d+)\|([^|]+)\|(.+)$/);
    if (m) {
      beats.push({
        n: parseInt(m[1], 10),
        visual: m[2].trim().slice(0, 200),
        dialogue: m[3].trim().slice(0, 120),
      });
    }
  }
  return beats.slice(0, 4);
}

export async function hfInference(model, inputs, options = {}) {
  const token = process.env.HF_TOKEN || process.env.HUGGINGFACE_TOKEN || '';
  const headers = { 'Content-Type': 'application/json', 'User-Agent': UA };
  if (token) headers.Authorization = 'Bearer ' + token;
  try {
    const res = await fetch('https://api-inference.huggingface.co/models/' + model, {
      method: 'POST',
      headers,
      body: JSON.stringify({ inputs, options: options.options || {} }),
      signal: AbortSignal.timeout(options.timeoutMs || 90000),
    });
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      const j = await res.json().catch(() => ({}));
      if (!res.ok) return { ok: false, error: j.error || j.message || 'HF ' + res.status };
      return { ok: true, json: j };
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (!res.ok) return { ok: false, error: 'HF HTTP ' + res.status };
    return { ok: true, buffer: buf, contentType: ct };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
}

export async function tryTalkingHead(imageUrl, speechText) {
  const model = process.env.HF_SADTALKER_MODEL || process.env.HF_AVATAR_MODEL || '';
  if (!model || !(process.env.HF_TOKEN || process.env.HUGGINGFACE_TOKEN)) {
    return {
      ok: false,
      error: 'Set HF_TOKEN + HF_SADTALKER_MODEL (see docs/HUGGINGFACE_SETUP.md)',
    };
  }
  return hfInference(model, { image: imageUrl, text: speechText }, { timeoutMs: 120000 });
}

export async function tryVoiceCloneTts(text, refAudioUrl) {
  const model = process.env.HF_TTS_CLONE_MODEL || '';
  if (!model || !(process.env.HF_TOKEN || process.env.HUGGINGFACE_TOKEN)) {
    return { ok: false, error: 'Set HF_TOKEN + HF_TTS_CLONE_MODEL' };
  }
  return hfInference(
    model,
    { text: String(text).slice(0, 400), audio_url: refAudioUrl },
    { timeoutMs: 90000 }
  );
}

export function screentracePrompt(notes) {
  return (
    'Screen-recording analyst. Timeline, UI actions, issues, next steps.\n\n' +
    String(notes || '').slice(0, 6000)
  );
}

export function miniAppSetupGuide(botUsername, webAppUrl) {
  return (
    '🚀 MINI APP\n' +
    webAppUrl +
    '\nMenu: 🚀 Open Queen Studio\n' +
    'Inside Telegram: Telegram login (Google hidden).\n@' +
    (botUsername || 'bot')
  );
}

export default {
  sleep,
  buildSeedImageUrl,
  buildUrlMediaGroup,
  buildComicMediaGroup,
  downloadImage,
  downloadSeedAlbum,
  embedText,
  cosineSim,
  podcastScriptPrompt,
  parsePodcastLines,
  newsPodcastPrompt,
  comicBeatsPrompt,
  parseComicBeats,
  hfInference,
  tryTalkingHead,
  tryVoiceCloneTts,
  screentracePrompt,
  miniAppSetupGuide,
};
