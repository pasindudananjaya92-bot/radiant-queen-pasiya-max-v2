/**
 * lib/jarvis.js — Voice → STT → optional Spider → LLM → TTS buffer
 * Free-first: Groq Whisper (if key), Gemini/Groq text, Edge-like TTS via Google translate TTS fallback
 */

export async function sttFromOggBuffer(buf, filename = 'voice.ogg') {
  const groq = process.env.GROQ_API_KEY || '';
  if (!groq) return { ok: false, error: 'GROQ_API_KEY missing for Whisper STT' };

  const form = new FormData();
  form.append('file', new Blob([buf], { type: 'audio/ogg' }), filename);
  form.append('model', 'whisper-large-v3');
  form.append('response_format', 'json');

  const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + groq },
    body: form,
  });
  const j = await res.json();
  if (!res.ok) return { ok: false, error: j.error?.message || res.status };
  return { ok: true, text: String(j.text || '').trim() };
}

export async function llmReply(prompt, system = 'You are Jarvis for PasiyaOS. Be concise and useful.') {
  const groq = process.env.GROQ_API_KEY || '';
  if (groq) {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + groq,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: String(prompt).slice(0, 8000) },
        ],
        max_tokens: 800,
        temperature: 0.4,
      }),
    });
    const j = await res.json();
    if (res.ok) {
      return { ok: true, text: j.choices?.[0]?.message?.content || '' };
    }
  }
  return { ok: false, error: 'LLM unavailable' };
}

/** Google Translate TTS free endpoint (mp3) — no key */
export async function ttsMp3(text, lang = 'en') {
  const q = encodeURIComponent(String(text).slice(0, 180));
  const url =
    'https://translate.google.com/translate_tts?ie=UTF-8&q=' +
    q +
    '&tl=' +
    encodeURIComponent(lang) +
    '&client=tw-ob';
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
  });
  if (!res.ok) return { ok: false, error: 'TTS HTTP ' + res.status };
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 100) return { ok: false, error: 'TTS empty' };
  return { ok: true, buffer: buf, mime: 'audio/mpeg' };
}

/**
 * Full pipeline. spiderHint: if transcript contains URL or "search/browse"
 */
export async function runJarvisPipeline(voiceBuffer, { supabase, lang = 'en' } = {}) {
  const stt = await sttFromOggBuffer(voiceBuffer);
  if (!stt.ok) return { ok: false, phase: 'stt', error: stt.error };

  let context = '';
  const urlMatch = stt.text.match(/https?:\/\/\S+/i);
  if (urlMatch || /\b(browse|search|look up|website)\b/i.test(stt.text)) {
    try {
      const { browseUrl } = await import('../lib/spider.js');
      const u = urlMatch ? urlMatch[0] : null;
      if (u) {
        const b = await browseUrl(u, { supabase });
        if (b.ok) context = '\n\nWeb:\n' + String(b.markdown || '').slice(0, 3000);
      }
    } catch (_) {}
  }

  const llm = await llmReply(
    (context ? 'Use the web excerpt if relevant.\n' + context + '\n\n' : '') +
      'User said: ' + stt.text
  );
  if (!llm.ok) return { ok: false, phase: 'llm', error: llm.error, transcript: stt.text };

  const tts = await ttsMp3(llm.text, lang);
  return {
    ok: true,
    transcript: stt.text,
    answer: llm.text,
    audio: tts.ok ? tts.buffer : null,
    ttsError: tts.ok ? null : tts.error,
  };
}

export default { sttFromOggBuffer, llmReply, ttsMp3, runJarvisPipeline };
