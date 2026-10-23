/**
 * /omniprompt — multi-engine prompt (Groq → Gemini → OpenRouter)
 */
async function callGroq(prompt) {
  const key = process.env.GROQ_API_KEY || '';
  if (!key) return null;
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + key,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
      temperature: 0.3,
      max_tokens: 1200,
      messages: [
        { role: 'system', content: 'PasiyaOS OmniPrompt. Be precise and useful.' },
        { role: 'user', content: prompt },
      ],
    }),
  });
  const j = await res.json();
  const t = j.choices?.[0]?.message?.content;
  return t ? { engine: 'groq', text: t.trim() } : null;
}

async function callGemini(prompt) {
  const key = process.env.GEMINI_API_KEY || '';
  if (!key) return null;
  const url =
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' +
    encodeURIComponent(key);
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
  });
  const j = await res.json();
  const t = j.candidates?.[0]?.content?.parts?.[0]?.text;
  return t ? { engine: 'gemini', text: t.trim() } : null;
}

async function callOpenRouter(prompt) {
  const key = process.env.OPENROUTER_API_KEY || '';
  if (!key) return null;
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + key,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.OPENROUTER_MODEL || 'meta-llama/llama-3.1-8b-instruct:free',
      max_tokens: 1200,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  const j = await res.json();
  const t = j.choices?.[0]?.message?.content;
  return t ? { engine: 'openrouter', text: t.trim() } : null;
}

export async function runOmniPrompt(prompt) {
  const p = String(prompt || '').trim();
  if (!p) return { ok: false, error: 'Usage: /omniprompt <text>' };
  const order = [callGroq, callGemini, callOpenRouter];
  const tried = [];
  for (const fn of order) {
    try {
      const r = await fn(p);
      if (r && r.text) {
        return { ok: true, engine: r.engine, text: r.text, tried };
      }
      tried.push((fn.name || 'engine') + ':empty');
    } catch (e) {
      tried.push((fn.name || 'engine') + ':' + String(e.message || e).slice(0, 40));
    }
  }
  return { ok: false, error: 'All engines failed', tried };
}

export function formatOmni(r) {
  if (!r.ok) {
    return 'OmniPrompt failed: ' + (r.error || '') + (r.tried ? '\n' + r.tried.join('\n') : '');
  }
  return ('OMNIPROMPT · ' + r.engine + '\n\n' + r.text).slice(0, 4000);
}

export default { runOmniPrompt, formatOmni };
