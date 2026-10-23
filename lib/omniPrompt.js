/**
 * /omniprompt — multi-engine prompt with real error surfacing
 * Order: Groq → Gemini → OpenRouter
 */
function trimErr(x, n = 120) {
  return String(x || '')
    .replace(/\s+/g, ' ')
    .slice(0, n);
}

async function callGroq(prompt) {
  const key = process.env.GROQ_API_KEY || process.env.GROQ_KEY || '';
  if (!key) return { ok: false, engine: 'groq', error: 'GROQ_API_KEY missing' };

  const models = [
    process.env.GROQ_MODEL,
    'llama-3.3-70b-versatile',
    'llama-3.1-70b-versatile',
    'llama-3.1-8b-instant',
    'gemma2-9b-it',
  ].filter(Boolean);

  let last = 'no model';
  for (const model of models) {
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + key,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          temperature: 0.3,
          max_tokens: 1200,
          messages: [
            {
              role: 'system',
              content: 'You are PasiyaOS OmniPrompt. Answer clearly and completely.',
            },
            { role: 'user', content: prompt },
          ],
        }),
      });
      const j = await res.json().catch(() => ({}));
      const t = j?.choices?.[0]?.message?.content;
      if (res.ok && t && String(t).trim()) {
        return { ok: true, engine: 'groq', model, text: String(t).trim() };
      }
      last =
        (j?.error?.message || j?.error || res.status + ' ' + JSON.stringify(j).slice(0, 100)) +
        ' model=' +
        model;
    } catch (e) {
      last = String(e.message || e);
    }
  }
  return { ok: false, engine: 'groq', error: trimErr(last) };
}

async function callGemini(prompt) {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
  if (!key) return { ok: false, engine: 'gemini', error: 'GEMINI_API_KEY missing' };

  const models = [
    process.env.GEMINI_MODEL,
    'gemini-2.5-flash',
    'gemini-2.0-flash',
    'gemini-flash-latest',
    'gemini-1.5-flash',
    'gemini-1.5-flash-latest',
  ].filter(Boolean);

  let last = 'no model';
  for (const model of models) {
    try {
      const url =
        'https://generativelanguage.googleapis.com/v1beta/models/' +
        encodeURIComponent(model) +
        ':generateContent?key=' +
        encodeURIComponent(key);
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 1200 },
        }),
      });
      const j = await res.json().catch(() => ({}));
      const t =
        j?.candidates?.[0]?.content?.parts?.map((p) => p.text).filter(Boolean).join('') ||
        j?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (res.ok && t && String(t).trim()) {
        return { ok: true, engine: 'gemini', model, text: String(t).trim() };
      }
      // blocked / safety
      const block =
        j?.promptFeedback?.blockReason ||
        j?.candidates?.[0]?.finishReason ||
        j?.error?.message ||
        JSON.stringify(j).slice(0, 120);
      last = trimErr(block) + ' model=' + model;
    } catch (e) {
      last = String(e.message || e);
    }
  }
  return { ok: false, engine: 'gemini', error: trimErr(last) };
}

async function callOpenRouter(prompt) {
  const key = process.env.OPENROUTER_API_KEY || '';
  if (!key) return { ok: false, engine: 'openrouter', error: 'OPENROUTER_API_KEY missing' };

  const models = [
    process.env.OPENROUTER_MODEL,
    'meta-llama/llama-3.1-8b-instruct:free',
    'google/gemma-2-9b-it:free',
    'mistralai/mistral-7b-instruct:free',
  ].filter(Boolean);

  let last = 'no model';
  for (const model of models) {
    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + key,
          'Content-Type': 'application/json',
          'HTTP-Referer':
            process.env.OPENROUTER_REFERER ||
            'https://radiant-queen-pasiya-max-v2.vercel.app',
          'X-Title': 'PasiyaOS OmniPrompt',
        },
        body: JSON.stringify({
          model,
          max_tokens: 1200,
          temperature: 0.3,
          messages: [
            { role: 'system', content: 'You are PasiyaOS OmniPrompt.' },
            { role: 'user', content: prompt },
          ],
        }),
      });
      const j = await res.json().catch(() => ({}));
      const t = j?.choices?.[0]?.message?.content;
      if (res.ok && t && String(t).trim()) {
        return { ok: true, engine: 'openrouter', model, text: String(t).trim() };
      }
      last =
        trimErr(j?.error?.message || j?.error || res.status + ' ' + JSON.stringify(j)) +
        ' model=' +
        model;
    } catch (e) {
      last = String(e.message || e);
    }
  }
  return { ok: false, engine: 'openrouter', error: trimErr(last) };
}

export async function runOmniPrompt(prompt) {
  const p = String(prompt || '').trim();
  if (!p) return { ok: false, error: 'Usage: /omniprompt <text>' };

  const engines = [callGroq, callGemini, callOpenRouter];
  const tried = [];

  for (const fn of engines) {
    try {
      const r = await fn(p);
      if (r && r.ok && r.text) {
        return {
          ok: true,
          engine: r.engine,
          model: r.model,
          text: r.text,
          tried,
        };
      }
      tried.push((r && r.engine ? r.engine : fn.name) + ': ' + (r && r.error ? r.error : 'empty'));
    } catch (e) {
      tried.push(fn.name + ': ' + trimErr(e.message || e));
    }
  }

  return {
    ok: false,
    error: 'All engines failed',
    tried,
    hint:
      'Check Vercel env: GROQ_API_KEY, GEMINI_API_KEY, OPENROUTER_API_KEY (at least one). Redeploy after set.',
  };
}

export function formatOmni(r) {
  if (!r.ok) {
    return (
      'OmniPrompt failed: ' +
      (r.error || '') +
      (r.tried && r.tried.length ? '\n' + r.tried.join('\n') : '') +
      (r.hint ? '\n\n' + r.hint : '')
    ).slice(0, 3500);
  }
  return (
    'OMNIPROMPT · ' +
    r.engine +
    (r.model ? ' · ' + r.model : '') +
    '\n\n' +
    r.text
  ).slice(0, 4000);
}

export default { runOmniPrompt, formatOmni };
