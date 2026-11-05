/**
 * lib/stt.js — Groq Whisper speech-to-text
 * No extra npm packages (uses global FormData + Blob on Vercel Node).
 */
export async function transcribeVoiceGroq(audioBuffer, filename = 'voice.ogg') {
  const key = process.env.GROQ_API_KEY || '';
  if (!key) return { ok: false, error: 'GROQ_API_KEY missing' };

  const models = [
    process.env.GROQ_WHISPER_MODEL || 'whisper-large-v3-turbo',
    'whisper-large-v3',
  ];

  let lastErr = 'no model';
  for (const model of models) {
    try {
      const form = new FormData();
      const bytes = audioBuffer instanceof Buffer ? audioBuffer : Buffer.from(audioBuffer);
      const blob = new Blob([bytes], { type: 'audio/ogg' });
      form.append('file', blob, filename || 'voice.ogg');
      form.append('model', model);
      form.append('response_format', 'text');
      // Optional: help Sinhala + English
      if (process.env.GROQ_WHISPER_LANGUAGE) {
        form.append('language', process.env.GROQ_WHISPER_LANGUAGE);
      }

      const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + key },
        body: form,
      });
      const text = await res.text();
      if (!res.ok) {
        lastErr = 'HTTP ' + res.status + ': ' + text.slice(0, 160);
        continue;
      }
      const cleaned = String(text || '').trim();
      if (cleaned) return { ok: true, text: cleaned, model };
      lastErr = 'empty transcript';
    } catch (e) {
      lastErr = String(e && e.message ? e.message : e);
    }
  }
  return { ok: false, error: lastErr };
}

export default { transcribeVoiceGroq };
