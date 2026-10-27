/** Hull B minimal powerChat — Groq first */
export async function powerChat(prompt, opts = {}) {
  const key = process.env.GROQ_API_KEY || process.env.GROQ_KEY;
  if (!key) return { ok: false, error: 'no GROQ_API_KEY' };
  const model =
    process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + key,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: opts.system || 'Be concise. Cite sources as [n].' },
        { role: 'user', content: String(prompt).slice(0, 12000) },
      ],
      temperature: 0.2,
      max_tokens: opts.max_tokens || 1200,
    }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) {
    return {
      ok: false,
      error: j?.error?.message || 'HTTP ' + res.status,
    };
  }
  const text = j.choices?.[0]?.message?.content || '';
  return { ok: true, text, engine: 'groq' };
}
export default { powerChat };
