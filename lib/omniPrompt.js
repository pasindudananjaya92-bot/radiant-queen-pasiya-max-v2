/**
 * /omniprompt — multi-engine with active models + 15s AbortController per call
 * Order: Groq → Gemini → OpenRouter
 */

const PER_ENGINE_MS = 15000;

function trimErr(x, n = 140) {
  return String(x || '')
    .replace(/\s+/g, ' ')
    .slice(0, n);
}

async function fetchJson(url, options, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: ctrl.signal });
    const text = await res.text();
    let json = {};
    try {
      json = text ? JSON.parse(text) : {};
    } catch (_) {
      json = { raw: text.slice(0, 200) };
    }
    return { res, json };
  } finally {
    clearTimeout(timer);
  }
}

async function callGroq(prompt) {
  const key = process.env.GROQ_API_KEY || process.env.GROQ_KEY || '';
  if (!key) return { ok: false, engine: 'groq', error: 'GROQ_API_KEY missing' };

  // Active Groq models only (no decommissioned gemma2-9b-it)
  const models = [
    process.env.GROQ_MODEL,
    'llama-3.3-70b-versatile',
    'llama-3.1-8b-instant',
    'llama3-8b-8192',
    'llama3-70b-8192',
  ].filter(Boolean);

  // unique preserve order
  const seen = new Set();
  const list = models.filter((m) => (seen.has(m) ? false : (seen.add(m), true)));

  let last = 'no model';
  for (const model of list) {
    try {
      const { res, json: j } = await fetchJson(
        'https://api.groq.com/openai/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            Authorization: 'Bearer ' + key,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model,
            temperature: 0.3,
            max_tokens: 1024,
            messages: [
              {
                role: 'system',
                content: 'You are PasiyaOS OmniPrompt. Answer clearly and completely.',
              },
              { role: 'user', content: prompt },
            ],
          }),
        },
        PER_ENGINE_MS
      );
      const t = j?.choices?.[0]?.message?.content;
      if (res.ok && t && String(t).trim()) {
        return { ok: true, engine: 'groq', model, text: String(t).trim() };
      }
      last =
        trimErr(j?.error?.message || j?.error || res.status + ' ' + JSON.stringify(j)) +
        ' model=' +
        model;
    } catch (e) {
      last =
        e && e.name === 'AbortError'
          ? 'timeout ' + PER_ENGINE_MS + 'ms model=' + model
          : trimErr(e.message || e) + ' model=' + model;
    }
  }
  return { ok: false, engine: 'groq', error: last };
}

async function callGemini(prompt) {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
  if (!key) return { ok: false, engine: 'gemini', error: 'GEMINI_API_KEY missing' };

  // No -latest suffix; prefer flash family that works on v1beta
  const models = [
    process.env.GEMINI_MODEL,
    'gemini-2.0-flash',
    'gemini-2.5-flash',
    'gemini-1.5-flash',
    'gemini-1.5-flash-8b',
  ].filter(Boolean);

  const seen = new Set();
  const list = models.filter((m) => (seen.has(m) ? false : (seen.add(m), true)));

  let last = 'no model';
  for (const model of list) {
    try {
      const url =
        'https://generativelanguage.googleapis.com/v1beta/models/' +
        encodeURIComponent(model) +
        ':generateContent?key=' +
        encodeURIComponent(key);
      const { res, json: j } = await fetchJson(
        url,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.3, maxOutputTokens: 1024 },
          }),
        },
        PER_ENGINE_MS
      );
      const parts = j?.candidates?.[0]?.content?.parts;
      const t = Array.isArray(parts)
        ? parts
            .map((p) => p.text)
            .filter(Boolean)
            .join('')
        : j?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (res.ok && t && String(t).trim()) {
        return { ok: true, engine: 'gemini', model, text: String(t).trim() };
      }
      last =
        trimErr(
          j?.error?.message ||
            j?.promptFeedback?.blockReason ||
            j?.candidates?.[0]?.finishReason ||
            res.status + ' ' + JSON.stringify(j)
        ) +
        ' model=' +
        model;
    } catch (e) {
      last =
        e && e.name === 'AbortError'
          ? 'timeout ' + PER_ENGINE_MS + 'ms model=' + model
          : trimErr(e.message || e) + ' model=' + model;
    }
  }
  return { ok: false, engine: 'gemini', error: last };
}

async function callOpenRouter(prompt) {
  const key = process.env.OPENROUTER_API_KEY || '';
  if (!key) return { ok: false, engine: 'openrouter', error: 'OPENROUTER_API_KEY missing' };

  // Prefer currently listed free instruct models
  const models = [
    process.env.OPENROUTER_MODEL,
    'meta-llama/llama-3.2-3b-instruct:free',
    'meta-llama/llama-3.1-8b-instruct:free',
    'google/gemma-2-9b-it:free',
    'huggingfaceh4/zephyr-7b-beta:free',
  ].filter(Boolean);

  const seen = new Set();
  const list = models.filter((m) => (seen.has(m) ? false : (seen.add(m), true)));

  let last = 'no model';
  for (const model of list) {
    try {
      const { res, json: j } = await fetchJson(
        'https://openrouter.ai/api/v1/chat/completions',
        {
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
            max_tokens: 1024,
            temperature: 0.3,
            messages: [
              { role: 'system', content: 'You are PasiyaOS OmniPrompt.' },
              { role: 'user', content: prompt },
            ],
          }),
        },
        PER_ENGINE_MS
      );
      const t = j?.choices?.[0]?.message?.content;
      if (res.ok && t && String(t).trim()) {
        return { ok: true, engine: 'openrouter', model, text: String(t).trim() };
      }
      last =
        trimErr(j?.error?.message || j?.error || res.status + ' ' + JSON.stringify(j)) +
        ' model=' +
        model;
    } catch (e) {
      last =
        e && e.name === 'AbortError'
          ? 'timeout ' + PER_ENGINE_MS + 'ms model=' + model
          : trimErr(e.message || e) + ' model=' + model;
    }
  }
  return { ok: false, engine: 'openrouter', error: last };
}

export async function runOmniPrompt(prompt) {
  const p = String(prompt || '').trim();
  if (!p) return { ok: false, error: 'Usage: /omniprompt <text>' };

  const engines = [callGroq, callGemini, callOpenRouter];
  const tried = [];

  for (const fn of engines) {
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
    tried.push((r && r.engine ? r.engine : 'engine') + ': ' + (r && r.error ? r.error : 'empty'));
  }

  return {
    ok: false,
    error: 'All engines failed',
    tried,
    hint: 'Set GROQ_API_KEY and/or GEMINI_API_KEY on Vercel. Optional: GROQ_MODEL / GEMINI_MODEL override.',
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
