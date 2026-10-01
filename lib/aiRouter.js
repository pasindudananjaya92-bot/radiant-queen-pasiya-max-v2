/**
 * lib/aiRouter.js — P1a Multi-provider text AI
 * Order: Groq → OpenRouter → Gemini (via @google/genai if available)
 * Images still handled by caller with Gemini when needed.
 */
const GROQ_KEY = process.env.GROQ_API_KEY || '';
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY || '';
const GEMINI_KEY = process.env.GEMINI_API_KEY || '';

const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
const OPENROUTER_MODEL =
  process.env.OPENROUTER_MODEL || 'meta-llama/llama-3.3-70b-instruct:free';

let lastProvider = null;
let lastError = null;

export function getAiProviderStatus() {
  return {
    groq: Boolean(GROQ_KEY),
    openrouter: Boolean(OPENROUTER_KEY),
    gemini: Boolean(GEMINI_KEY),
    lastProvider,
    lastError: lastError ? String(lastError).slice(0, 160) : null,
  };
}

function isQuotaOrLimit(err) {
  const m = String(err?.message || err || '').toLowerCase();
  return (
    m.includes('429') ||
    m.includes('quota') ||
    m.includes('rate limit') ||
    m.includes('resource_exhausted') ||
    m.includes('too many') ||
    m.includes('capacity')
  );
}

async function chatOpenAICompat({ url, apiKey, model, system, user, headers = {} }) {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify({
      model,
      temperature: 0.7,
      max_tokens: 1200,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      data?.error?.message ||
      data?.message ||
      JSON.stringify(data).slice(0, 200) ||
      `HTTP ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  const text =
    data?.choices?.[0]?.message?.content ||
    data?.choices?.[0]?.text ||
    '';
  return String(text || '').trim();
}

/** Text-only multi-provider. Returns { text, provider } or throws last error. */
export async function routeTextAI({ system, user }) {
  lastError = null;
  const errors = [];

  // 1) Groq
  if (GROQ_KEY) {
    try {
      const text = await chatOpenAICompat({
        url: 'https://api.groq.com/openai/v1/chat/completions',
        apiKey: GROQ_KEY,
        model: GROQ_MODEL,
        system,
        user,
      });
      if (text) {
        lastProvider = 'groq';
        return { text: text.slice(0, 3500), provider: 'groq' };
      }
    } catch (e) {
      lastError = e;
      errors.push(`groq: ${e.message}`);
      if (!isQuotaOrLimit(e) && e.status && e.status >= 500 === false && e.status !== 429) {
        // still try next providers
      }
    }
  }

  // 2) OpenRouter
  if (OPENROUTER_KEY) {
    try {
      const text = await chatOpenAICompat({
        url: 'https://openrouter.ai/api/v1/chat/completions',
        apiKey: OPENROUTER_KEY,
        model: OPENROUTER_MODEL,
        system,
        user,
        headers: {
          'HTTP-Referer': process.env.APP_URL || 'https://radiant-queen-pasiya-max-v2.vercel.app',
          'X-Title': 'Radiant Queen Pasiya Max',
        },
      });
      if (text) {
        lastProvider = 'openrouter';
        return { text: text.slice(0, 3500), provider: 'openrouter' };
      }
    } catch (e) {
      lastError = e;
      errors.push(`openrouter: ${e.message}`);
    }
  }

  // 3) Gemini REST (no SDK required here — works even if @google/genai fails)
  if (GEMINI_KEY) {
    const models = [
      process.env.GEMINI_MODEL || 'gemini-2.0-flash',
      'gemini-2.5-flash',
      'gemini-flash-latest',
      'gemini-1.5-flash',
    ];
    for (const model of models) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(GEMINI_KEY)}`;
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: system }] },
            contents: [{ role: 'user', parts: [{ text: user }] }],
            generationConfig: { temperature: 0.7, maxOutputTokens: 1200 },
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          const msg = data?.error?.message || `HTTP ${res.status}`;
          const err = new Error(msg);
          err.status = res.status;
          throw err;
        }
        const text = (data?.candidates?.[0]?.content?.parts || [])
          .map((p) => p.text || '')
          .join('')
          .trim();
        if (text) {
          lastProvider = `gemini:${model}`;
          return { text: text.slice(0, 3500), provider: lastProvider };
        }
      } catch (e) {
        lastError = e;
        errors.push(`gemini(${model}): ${e.message}`);
        const m = String(e.message || '').toLowerCase();
        if (m.includes('404') || m.includes('not found')) continue;
        if (isQuotaOrLimit(e)) continue;
      }
    }
  }

  const err = new Error(errors.join(' | ') || 'No AI provider configured');
  lastError = err;
  throw err;
}

export default { routeTextAI, getAiProviderStatus };
