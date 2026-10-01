/**
 * lib/stt.js — Groq Whisper speech-to-text
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
      const blob = new Blob([audioBuffer], { type: 'audio/ogg' });
      form.append('file', blob, filename);
      form.append('model', model);
      form.append('response_format', 'text');
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
