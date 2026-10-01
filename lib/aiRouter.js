/**
 * lib/aiRouter.js — multi-provider text AI (2026 model IDs)
 * Order: Groq → OpenRouter → Gemini REST
 * Labels returned: groq | openrouter | gemini
 */
const GROQ_KEY = process.env.GROQ_API_KEY || '';
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY || '';
const GEMINI_KEY = process.env.GEMINI_API_KEY || '';

/** Groq production-friendly IDs (try in order) */
const GROQ_MODELS = (
  process.env.GROQ_MODEL ||
  [
    'openai/gpt-oss-20b',
    'llama-3.3-70b-versatile',
    'llama-3.1-8b-instant',
    'openai/gpt-oss-120b',
  ].join(',')
)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

/** OpenRouter free / auto router */
const OPENROUTER_MODELS = (
  process.env.OPENROUTER_MODEL ||
  [
    'openrouter/free',
    'meta-llama/llama-3.3-8b-instruct:free',
    'qwen/qwen3-8b:free',
    'google/gemma-3n-e4b-it:free',
    'deepseek/deepseek-r1-0528-qwen3-8b:free',
  ].join(',')
)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

/** Gemini (2026 free-tier oriented) */
const GEMINI_MODELS = (
  process.env.GEMINI_MODEL ||
  [
    'gemini-3.8-flash',
    'gemini-3.6-flash',
    'gemini-3.5-flash',
    'gemini-3.5-flash-lite',
    'gemini-2.5-flash',
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
    log: providerLog.slice(-16),
    models: { groq: GROQ_MODELS, openrouter: OPENROUTER_MODELS, gemini: GEMINI_MODELS },
  };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function isBusy(err) {
  const m = String(err?.message || err || '').toLowerCase();
  const status = err?.status || 0;
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
    m.includes('overloaded')
  );
}

function isNotFound(err) {
  const m = String(err?.message || err || '').toLowerCase();
  return (
    m.includes('404') ||
    m.includes('not found') ||
    m.includes('no longer available') ||
    m.includes('does not exist') ||
    m.includes('no endpoints') ||
    m.includes('unavailable for free')
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
  for (const model of GROQ_MODELS) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const text = await chatOpenAICompat({
          url: 'https://api.groq.com/openai/v1/chat/completions',
          apiKey: GROQ_KEY,
          model,
          system,
          user,
        });
        if (text) {
          providerLog.push(`groq: ok model=${model}`);
          return text;
        }
      } catch (e) {
        providerLog.push(
          `groq: fail model=${model} try=${attempt} ${String(e.message).slice(0, 90)}`
        );
        lastError = e;
        if (isBusy(e) && attempt < 2) {
          await sleep(400 * attempt);
          continue;
        }
        if (isNotFound(e)) break; // next model
        break;
      }
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
    } catch (e) {
      providerLog.push(
        `openrouter: fail model=${model} ${String(e.message).slice(0, 90)}`
      );
      lastError = e;
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
    } catch (e) {
      providerLog.push(
        `gemini: fail model=${modelId} ${String(e.message).slice(0, 90)}`
      );
      lastError = e;
      continue;
    }
  }
  return null;
}

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

  const err = new Error(providerLog.slice(-8).join(' | ') || 'No AI provider succeeded');
  lastError = err;
  throw err;
}

export default { routeTextAI, getAiProviderStatus };
