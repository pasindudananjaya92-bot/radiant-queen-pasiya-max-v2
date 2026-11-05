// lib/ttsManager.js — Agent-26 TTS wrapper (free Google Translate TTS via existing lib/tts.js)
// Best free option on Vercel: gTTS (already in project). Optional EDGE_TTS_PROXY_URL for neural.
// Chunks long text (gTTS ~160-180 char limit per request).

import { synthesizeSpeech } from './tts.js';

const CHUNK = 150;

export function isVoiceEnabledFromEnv() {
  return String(process.env.NIGHT_VOICE || process.env.VOICE_REPLIES || '1') !== '0';
}

/** Split into speakable chunks without cutting mid-word when possible */
export function chunkForTts(text, max = CHUNK) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  const parts = [];
  let rest = clean;
  while (rest.length > max) {
    let cut = rest.lastIndexOf(' ', max);
    if (cut < max * 0.5) cut = max;
    parts.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) parts.push(rest);
  return parts.slice(0, 12); // safety: max ~12 audio clips
}

/**
 * Synthesize full briefing; returns first solid buffer + meta
 * (Telegram can only attach one voice easily — we speak condensed version)
 */
export async function speakText(text, voice = 'female') {
  const condensed = String(text || '')
    .replace(/[*_`#\[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 900);
  if (!condensed) return { ok: false, error: 'empty' };

  // Prefer single pass on condensed briefing
  const one = await synthesizeSpeech(condensed.slice(0, 160), voice);
  if (one.ok && one.buffer) {
    // Try extend by concatenating a few chunks (simple sequential — send first only for reliability)
    return {
      ok: true,
      buffer: one.buffer,
      provider: one.provider || 'gtts',
      note: 'condensed_160',
      preview: condensed.slice(0, 160),
    };
  }

  // Retry english
  const two = await synthesizeSpeech(condensed.slice(0, 160), 'en');
  if (two.ok && two.buffer) return { ok: true, buffer: two.buffer, provider: two.provider || 'gtts' };
  return { ok: false, error: one.error || two.error || 'tts failed' };
}

/**
 * Longer spoken summary: multiple chunks joined as best-effort single buffer (first chunk if join hard)
 */
export async function speakBriefing(text, voice = 'female') {
  const parts = chunkForTts(
    String(text || '')
      .replace(/[*_`#]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
    150
  );
  if (!parts.length) return { ok: false, error: 'empty' };

  const buffers = [];
  for (const p of parts.slice(0, 5)) {
    const r = await synthesizeSpeech(p, voice);
    if (r.ok && r.buffer) buffers.push(r.buffer);
    await new Promise((r) => setTimeout(r, 250));
  }
  if (!buffers.length) return { ok: false, error: 'all chunks failed' };
  // Concatenate MP3 chunks (gTTS mpeg frames usually concat OK enough for Telegram)
  const joined = Buffer.concat(buffers);
  return { ok: true, buffer: joined, parts: buffers.length, provider: 'gtts' };
}

export default { speakText, speakBriefing, chunkForTts };
