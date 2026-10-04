/**
 * lib/packMega.js — megaR-fix
 * embedding: gemini-embedding-001 → gemini-embedding-2 fallback
 * album: longer delays, max 2 sequential single sends recommended
 */
const UA = 'RadiantQueenBot/4.0 (+https://t.me/PasiyaMaxQueen_bot)';

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

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
    signal: AbortSignal.timeout(45000),
    redirect: 'follow',
  });
  if (!res.ok) return { ok: false, error: 'HTTP ' + res.status };
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 800) return { ok: false, error: 'tiny' };
  return { ok: true, buffer: buf };
}

/** Sequential downloads with long delay — returns array of {buffer, seed, caption} */
export async function downloadSeedAlbum(prompt, maxCount = 2) {
  const out = [];
  const n = Math.min(2, Math.max(1, maxCount));
  for (let i = 0; i < n; i++) {
    const seed = Math.floor(Math.random() * 1e9);
    const url = buildSeedImageUrl(
      String(prompt) + (i ? ' , variation ' + (i + 1) + ', different angle' : ''),
      seed
    );
    try {
      const img = await downloadImage(url);
      if (img.ok) {
        out.push({
          buffer: img.buffer,
          seed,
          caption:
            (i === 0 ? String(prompt).slice(0, 160) + '\n' : '') + 'seed ' + seed,
        });
      }
    } catch (_) {}
    if (i < n - 1) await sleep(2500); // Vercel-friendly gap
  }
  return out;
}

/**
 * Gemini embeddings — 2026 models
 * Prefer gemini-embedding-001 (text, stable dims)
 * Fallback gemini-embedding-2
 * text-embedding-004 is DEPRECATED
 */
export async function embedText(text) {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
  if (!key) return { ok: false, error: 'no GEMINI_API_KEY' };

  const models = [
    process.env.GEMINI_EMBED_MODEL || 'gemini-embedding-001',
    'gemini-embedding-001',
    'gemini-embedding-2',
  ];
  const seen = new Set();
  const ordered = models.filter((m) => {
    if (seen.has(m)) return false;
    seen.add(m);
    return true;
  });

  let lastErr = 'embed failed';
  for (const model of ordered) {
    try {
      const url =
        'https://generativelanguage.googleapis.com/v1beta/models/' +
        model +
        ':embedContent?key=' +
        encodeURIComponent(key);
      const body = {
        content: { parts: [{ text: String(text || '').slice(0, 8000) }] },
        outputDimensionality: 768,
      };
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(25000),
      });
      const j = await res.json().catch(() => ({}));
      const values =
        j?.embedding?.values ||
        j?.embeddings?.[0]?.values ||
        j?.embeddings?.[0]?.embedding?.values;
      if (res.ok && values && values.length) {
        return { ok: true, embedding: values, model, dims: values.length };
      }
      lastErr = j.error?.message || j.message || 'HTTP ' + res.status + ' ' + model;
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
    'Write a natural 2-host podcast dialogue about: ' +
    String(topic || 'running').slice(0, 200) +
    '\nHosts: ALEX (curious male host) and RINA (expert female host). ' +
    'Format EXACTLY:\nALEX: line\nRINA: line\n' +
    '8-12 short turns. Conversational. Match language of topic.'
  );
}

export function parsePodcastLines(text) {
  const lines = [];
  for (const raw of String(text || '').split(/\n/)) {
    const t = raw.trim();
    const m = t.match(/^(ALEX|RINA|HOST\s*1|HOST\s*2|A|B)\s*[:：]\s*(.+)$/i);
    if (m) {
      const who = /RINA|HOST\s*2|^B$/i.test(m[1]) ? 'RINA' : 'ALEX';
      lines.push({ who, text: m[2].trim().slice(0, 200) });
    }
  }
  return lines.slice(0, 14);
}

export function newsPodcastPrompt(itemsText) {
  return (
    'Turn these news items into a short 2-host morning podcast (ALEX male, RINA female).\n' +
    'Format:\nALEX: ...\nRINA: ...\n6-10 turns.\n\nITEMS:\n' +
    String(itemsText || '').slice(0, 2500)
  );
}

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

export async function tryTalkingHead(imageUrl, speechText) {
  const model = process.env.HF_SADTALKER_MODEL || process.env.HF_AVATAR_MODEL || '';
  if (!model) {
    return {
      ok: false,
      error:
        'Set HF_TOKEN + HF_SADTALKER_MODEL for video. Fallback: photo + voice.',
    };
  }
  return hfInference(model, { image: imageUrl, text: speechText }, { timeoutMs: 120000 });
}

export async function tryVoiceCloneTts(text, refAudioUrl) {
  const model = process.env.HF_TTS_CLONE_MODEL || process.env.HF_XTTS_MODEL || '';
  if (!model) {
    return { ok: false, error: 'Set HF_TOKEN + HF_TTS_CLONE_MODEL for true clone.' };
  }
  return hfInference(
    model,
    { text: String(text).slice(0, 400), audio_url: refAudioUrl },
    { timeoutMs: 90000 }
  );
}

export function screentracePrompt(notes) {
  return (
    'You are a screen-recording analyst. Produce:\n' +
    '1) Timeline\n2) UI/actions\n3) Issues\n4) Next steps\n\nNOTES:\n' +
    String(notes || '').slice(0, 6000)
  );
}

export function miniAppSetupGuide(botUsername, webAppUrl) {
  return (
    '🚀 MINI APP\n' +
    'Open: ' +
    webAppUrl +
    '\nBotFather menu: 🚀 Open Queen Studio\n' +
    'Inside Telegram: use Telegram login (not Google).\n@' +
    (botUsername || 'bot')
  );
}

export default {
  sleep,
  buildSeedImageUrl,
  downloadImage,
  downloadSeedAlbum,
  embedText,
  cosineSim,
  podcastScriptPrompt,
  parsePodcastLines,
  newsPodcastPrompt,
  hfInference,
  tryTalkingHead,
  tryVoiceCloneTts,
  screentracePrompt,
  miniAppSetupGuide,
};
