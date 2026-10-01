/**
 * lib/aiRouter.js — P1a-fix Multi-provider text AI
 * Order: Groq (retry on 503) → OpenRouter → Gemini REST
 * Provider labels returned to bot: groq | openrouter | gemini  (never "gemini:xxx")
 */
const GROQ_KEY = process.env.GROQ_API_KEY || '';
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY || '';
const GEMINI_KEY = process.env.GEMINI_API_KEY || '';

const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';

/** OpenRouter free-friendly models (tried in order) */
const OPENROUTER_MODELS = (
  process.env.OPENROUTER_MODEL ||
  [
    'meta-llama/llama-3.3-70b-instruct:free',
    'google/gemma-2-9b-it:free',
    'mistralai/mistral-7b-instruct:free',
    'microsoft/phi-3-mini-128k-instruct:free',
  ].join(',')
)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

/** Gemini REST model ids (no "models/" prefix, no "gemini:" prefix) */
const GEMINI_MODELS = (
  process.env.GEMINI_MODEL ||
  [
    'gemini-2.0-flash',
    'gemini-2.0-flash-lite',
    'gemini-1.5-flash',
    'gemini-1.5-flash-8b',
    'gemini-flash-latest',
  ].join(',')
)
  .split(',')
  .map((s) => s.trim().replace(/^models\//, '').replace(/^gemini:/, ''))
  .filter(Boolean);

let lastProvider = null;
let lastError = null;
const providerLog = [];

export function getAiProviderStatus() {
  return {
    groq: Boolean(GROQ_KEY),
    openrouter: Boolean(OPENROUTER_KEY),
    gemini: Boolean(GEMINI_KEY),
    lastProvider,
    lastError: lastError ? String(lastError).slice(0, 200) : null,
    log: providerLog.slice(-12),
  };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function isBusy(err) {
  const m = String(err?.message || err || '').toLowerCase();
  const status = err?.status || err?.statusCode || 0;
  return (
    status === 503 ||
    status === 429 ||
    m.includes('503') ||
    m.includes('429') ||
    m.includes('high demand') ||
    m.includes('capacity') ||
    m.includes('rate limit') ||
    m.includes('quota') ||
    m.includes('resource_exhausted') ||
    m.includes('overloaded') ||
    m.includes('temporarily')
  );
}

function isNotFound(err) {
  const m = String(err?.message || err || '').toLowerCase();
  return (
    m.includes('404') ||
    m.includes('not found') ||
    m.includes('no longer available') ||
    m.includes('not available to new users')
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
      JSON.stringify(data).slice(0, 240) ||
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

async function tryGroq(system, user) {
  if (!GROQ_KEY) {
    providerLog.push('groq: skip (no key)');
    return null;
  }
  const maxAttempts = 3; // 1 try + 2 retries on 503/busy
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const text = await chatOpenAICompat({
        url: 'https://api.groq.com/openai/v1/chat/completions',
        apiKey: GROQ_KEY,
        model: GROQ_MODEL,
        system,
        user,
      });
      if (text) {
        providerLog.push(`groq: ok attempt=${attempt}`);
        return text;
      }
      providerLog.push(`groq: empty attempt=${attempt}`);
    } catch (e) {
      providerLog.push(`groq: fail attempt=${attempt} status=${e.status || '?'} ${String(e.message).slice(0, 100)}`);
      lastError = e;
      if (isBusy(e) && attempt < maxAttempts) {
        await sleep(800 * attempt);
        continue;
      }
      return null;
    }
  }
  return null;
}

async function tryOpenRouter(system, user) {
  if (!OPENROUTER_KEY) {
    providerLog.push('openrouter: skip (no key)');
    return null;
  }
  for (const model of OPENROUTER_MODELS) {
    try {
      const text = await chatOpenAICompat({
        url: 'https://openrouter.ai/api/v1/chat/completions',
        apiKey: OPENROUTER_KEY,
        model,
        system,
        user,
        headers: {
          'HTTP-Referer':
            process.env.APP_URL || 'https://radiant-queen-pasiya-max-v2.vercel.app',
          'X-Title': 'Radiant Queen Pasiya Max',
        },
      });
      if (text) {
        providerLog.push(`openrouter: ok model=${model}`);
        return text;
      }
      providerLog.push(`openrouter: empty model=${model}`);
    } catch (e) {
      providerLog.push(
        `openrouter: fail model=${model} status=${e.status || '?'} ${String(e.message).slice(0, 100)}`
      );
      lastError = e;
      if (isNotFound(e) || isBusy(e)) continue;
      // auth errors — no point trying more models with same key format issues; still try next model
      continue;
    }
  }
  return null;
}

async function tryGemini(system, user) {
  if (!GEMINI_KEY) {
    providerLog.push('gemini: skip (no key)');
    return null;
  }
  for (const model of GEMINI_MODELS) {
    const modelId = String(model).replace(/^models\//, '').replace(/^gemini:/, '');
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelId)}:generateContent?key=${encodeURIComponent(GEMINI_KEY)}`;
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
        providerLog.push(`gemini: ok model=${modelId}`);
        return text;
      }
      providerLog.push(`gemini: empty model=${modelId}`);
    } catch (e) {
      providerLog.push(
        `gemini: fail model=${modelId} status=${e.status || '?'} ${String(e.message).slice(0, 100)}`
      );
      lastError = e;
      if (isNotFound(e) || isBusy(e)) continue;
      continue;
    }
  }
  return null;
}

/**
 * Text-only multi-provider.
 * Returns { text, provider } where provider is: groq | openrouter | gemini
 * (safe for telegram.js resolvedModel — no "gemini:model" prefix)
 */
export async function routeTextAI({ system, user }) {
  lastError = null;
  providerLog.length = 0;

  const sys = String(system || 'You are a helpful assistant.');
  const q = String(user || '');

  const fromGroq = await tryGroq(sys, q);
  if (fromGroq) {
    lastProvider = 'groq';
    return { text: fromGroq.slice(0, 3500), provider: 'groq' };
  }

  const fromOr = await tryOpenRouter(sys, q);
  if (fromOr) {
    lastProvider = 'openrouter';
    return { text: fromOr.slice(0, 3500), provider: 'openrouter' };
  }

  const fromGem = await tryGemini(sys, q);
  if (fromGem) {
    lastProvider = 'gemini';
    return { text: fromGem.slice(0, 3500), provider: 'gemini' };
  }

  const err = new Error(
    providerLog.slice(-6).join(' | ') || 'No AI provider succeeded'
  );
  lastError = err;
  throw err;
}

export default { routeTextAI, getAiProviderStatus };
