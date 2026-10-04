/**
 * lib/packMega.js — Pack R2+R3 mega helpers
 * podcast, news_podcast, ragmemory, avatar, voiceclone, screentrace, alive, comic/remix harden
 */

const UA = 'RadiantQueenBot/4.0 (+https://t.me/PasiyaMaxQueen_bot)';

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Remix/comic: max 2 images, delay between downloads */
export function buildSeedImageUrl(prompt, seed) {
  const q = String(prompt || '').trim().slice(0, 280);
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

export async function downloadImage(url) {
  const res = await fetch(url, {
    headers: { Accept: 'image/*', 'User-Agent': UA },
    signal: AbortSignal.timeout(35000),
    redirect: 'follow',
  });
  if (!res.ok) return { ok: false, error: 'HTTP ' + res.status };
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 800) return { ok: false, error: 'tiny' };
  return { ok: true, buffer: buf };
}

/** Sequential multi-image: maxCount=2 default for Vercel timeout safety */
export async function downloadSeedAlbum(prompt, maxCount = 2) {
  const media = [];
  const n = Math.min(3, Math.max(1, maxCount));
  for (let i = 0; i < n; i++) {
    const seed = Math.floor(Math.random() * 1e9);
    const url = buildSeedImageUrl(prompt + (i ? ' variation ' + (i + 1) : ''), seed);
    try {
      const img = await downloadImage(url);
      if (img.ok) {
        media.push({
          type: 'photo',
          media: { source: img.buffer },
          caption: media.length === 0 ? String(prompt).slice(0, 200) + '\nseed ' + seed : 'seed ' + seed,
        });
      }
    } catch (_) {}
    if (i < n - 1) await sleep(1200);
  }
  return media;
}

export function podcastScriptPrompt(topic) {
  return (
    'Write a natural 2-host podcast dialogue about: ' +
    String(topic || 'running').slice(0, 200) +
    '\nHosts: ALEX (curious) and RINA (expert). ' +
    'Format EXACTLY:\nALEX: line\nRINA: line\n' +
    '8-12 short turns total. Conversational, no markdown. Match language of topic.'
  );
}

export function parsePodcastLines(text) {
  const lines = [];
  for (const raw of String(text || '').split(/\n/)) {
    const t = raw.trim();
    const m = t.match(/^(ALEX|RINA|HOST\s*1|HOST\s*2|A|B)\s*[:：]\s*(.+)$/i);
    if (m) {
      const who = /RINA|HOST\s*2|^B$/i.test(m[1]) ? 'RINA' : 'ALEX';
      lines.push({ who, text: m[2].trim().slice(0, 220) });
    }
  }
  return lines.slice(0, 14);
}

export function newsPodcastPrompt(itemsText) {
  return (
    'Turn these news items into a short 2-host morning podcast (ALEX and RINA).\n' +
    'Format:\nALEX: ...\nRINA: ...\n6-10 turns. Warm, clear.\n\nITEMS:\n' +
    String(itemsText || '').slice(0, 2500)
  );
}

/** Gemini embedding (text-embedding-004) — free tier with GEMINI_API_KEY */
export async function embedText(text) {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
  if (!key) return { ok: false, error: 'no GEMINI_API_KEY' };
  const model = process.env.GEMINI_EMBED_MODEL || 'text-embedding-004';
  const url =
    'https://generativelanguage.googleapis.com/v1beta/models/' +
    model +
    ':embedContent?key=' +
    encodeURIComponent(key);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: { parts: [{ text: String(text || '').slice(0, 8000) }] },
      }),
      signal: AbortSignal.timeout(25000),
    });
    const j = await res.json().catch(() => ({}));
    const values = j?.embedding?.values || j?.embeddings?.[0]?.values;
    if (!res.ok || !values) {
      return { ok: false, error: j.error?.message || 'embed failed' };
    }
    return { ok: true, embedding: values };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
}

export function cosineSim(a, b) {
  if (!a?.length || !b?.length || a.length !== b.length) return 0;
  let dot = 0,
    na = 0,
    nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (!na || !nb) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/**
 * HuggingFace Inference — optional HF_TOKEN
 * Tries image-to-video / TTS spaces carefully.
 */
export async function hfInference(model, inputs, options = {}) {
  const token = process.env.HF_TOKEN || process.env.HUGGINGFACE_TOKEN || '';
  const headers = { 'Content-Type': 'application/json', 'User-Agent': UA };
  if (token) headers.Authorization = 'Bearer ' + token;
  const url = 'https://api-inference.huggingface.co/models/' + model;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ inputs, ...options }),
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

/** Avatar workaround: HF or clear fallback instructions */
export async function tryTalkingHead(imageUrl, speechText) {
  // Preferred: user-configured space/model
  const model =
    process.env.HF_SADTALKER_MODEL ||
    process.env.HF_AVATAR_MODEL ||
    '';
  if (!model) {
    return {
      ok: false,
      error:
        'Set HF_TOKEN + HF_SADTALKER_MODEL (HuggingFace) for video. Fallback: use /imagine + /voicedigest for photo+voice combo.',
    };
  }
  return hfInference(model, { image: imageUrl, text: speechText }, { timeoutMs: 120000 });
}

export async function tryVoiceCloneTts(text, refAudioUrl) {
  const model = process.env.HF_TTS_CLONE_MODEL || process.env.HF_XTTS_MODEL || '';
  if (!model) {
    return {
      ok: false,
      error:
        'Set HF_TOKEN + HF_TTS_CLONE_MODEL for clone. Until then /say uses standard TTS.',
    };
  }
  return hfInference(
    model,
    { text: String(text).slice(0, 400), audio_url: refAudioUrl },
    { timeoutMs: 90000 }
  );
}

/** Extract up to N frame hints from video file URL — vision captions via Gemini later */
export function screentracePrompt(notes) {
  return (
    'You are a screen-recording analyst. Analyze this video description / frame notes and produce:\n' +
    '1) Timeline (scene by scene)\n2) UI/actions observed\n3) Issues/bugs\n4) Next steps\n\nNOTES:\n' +
    String(notes || '').slice(0, 6000)
  );
}

export function miniAppSetupGuide(botUsername, webAppUrl) {
  return (
    '🚀 MINI APP SETUP\n\n' +
    '1) BotFather → /newapp → select @' +
    (botUsername || 'YourBot') +
    '\n' +
    '2) Title: Queen Studio\n' +
    '3) Description: Bot factory, templates, analytics\n' +
    '4) Photo: 640x360\n' +
    '5) Web App URL:\n' +
    webAppUrl +
    '\n\n' +
    'Menu button:\nBotFather → /mybots → Bot Settings → Menu Button\n' +
    'Text: 🚀 Open Queen Studio\nURL: ' +
    webAppUrl +
    '\n\n' +
    'Code: add telegram-web-app.js to /bot/ pages (see docs/MINIAPP.md).\n' +
    'Browser users keep working — script only enhances inside Telegram.'
  );
}

export default {
  sleep,
  buildSeedImageUrl,
  downloadImage,
  downloadSeedAlbum,
  podcastScriptPrompt,
  parsePodcastLines,
  newsPodcastPrompt,
  embedText,
  cosineSim,
  hfInference,
  tryTalkingHead,
  tryVoiceCloneTts,
  screentracePrompt,
  miniAppSetupGuide,
};
