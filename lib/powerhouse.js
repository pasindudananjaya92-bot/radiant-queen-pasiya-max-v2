/**
 * PasiyaOS v2000 POWERHOUSE
 * Central AI router + radar + scanner + engine matrix
 * All heavy features (Echo X, DeepMind) call through here.
 */
const PER_MS = 15000;

function trim(x, n = 200) {
  return String(x || '').replace(/\s+/g, ' ').slice(0, n);
}

async function fetchJson(url, options, timeoutMs = PER_MS) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: ctrl.signal });
    const text = await res.text();
    let json = {};
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = { raw: text.slice(0, 200) };
    }
    return { res, json, text };
  } finally {
    clearTimeout(t);
  }
}

/** Multi-engine chat — Groq → Gemini → OpenRouter */
export async function powerChat(prompt, opts = {}) {
  const system = opts.system || 'You are PasiyaOS Powerhouse. Be precise and useful.';
  const maxTokens = opts.maxTokens || 2048;
  const tried = [];

  // Groq
  const groqKey = process.env.GROQ_API_KEY || process.env.GROQ_KEY || '';
  if (groqKey) {
    for (const model of [
      'openai/gpt-oss-20b',
      'openai/gpt-oss-120b',
      'qwen/qwen3.8-27b',
      'llama-3.1-8b-instant',
      'llama-3.3-70b-versatile',
    ].filter(Boolean)) {
      try {
        const { res, json: j } = await fetchJson(
          'https://api.groq.com/openai/v1/chat/completions',
          {
            method: 'POST',
            headers: {
              Authorization: 'Bearer ' + groqKey,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model,
              temperature: opts.temperature ?? 0.3,
              max_tokens: maxTokens,
              messages: [
                { role: 'system', content: system },
                { role: 'user', content: prompt },
              ],
            }),
          },
          PER_MS
        );
        const t = j?.choices?.[0]?.message?.content;
        if (res.ok && t?.trim()) {
          return { ok: true, engine: 'groq', model, text: t.trim(), tried };
        }
        tried.push('groq@' + model + ':' + trim(j?.error?.message || res.status));
      } catch (e) {
        tried.push('groq@' + model + ':' + trim(e.message || e));
      }
    }
  } else tried.push('groq:no-key');

  // Gemini
  const gemKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
  if (gemKey) {
    for (const model of [
      process.env.GEMINI_MODEL,
      'gemini-3.8-flash',
      'gemini-3.6-flash',
      'gemini-3.6-flash',
    ].filter(Boolean)) {
      try {
        const url =
          'https://generativelanguage.googleapis.com/v1beta/models/' +
          encodeURIComponent(model) +
          ':generateContent?key=' +
          encodeURIComponent(gemKey);
        const { res, json: j } = await fetchJson(
          url,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: system + '\n\n' + prompt }] }],
              generationConfig: { maxOutputTokens: maxTokens, temperature: opts.temperature ?? 0.3 },
            }),
          },
          PER_MS
        );
        const parts = j?.candidates?.[0]?.content?.parts || [];
        const t = parts.map((p) => p.text || '').join('');
        if (res.ok && t.trim()) {
          return { ok: true, engine: 'gemini', model, text: t.trim(), tried };
        }
        tried.push('gemini@' + model + ':' + trim(j?.error?.message || res.status));
      } catch (e) {
        tried.push('gemini@' + model + ':' + trim(e.message || e));
      }
    }
  } else tried.push('gemini:no-key');

  // OpenRouter free
  const orKey = process.env.OPENROUTER_API_KEY || '';
  if (orKey) {
    for (const model of [
      'openai/gpt-oss-20b',
      'openai/gpt-oss-120b',
      'qwen/qwen3.8-27b',
      'llama-3.1-8b-instant',
      'llama-3.3-70b-versatile',
    ].filter(Boolean)) {
      try {
        const { res, json: j } = await fetchJson(
          'https://openrouter.ai/api/v1/chat/completions',
          {
            method: 'POST',
            headers: {
              Authorization: 'Bearer ' + orKey,
              'Content-Type': 'application/json',
              'HTTP-Referer':
                process.env.OPENROUTER_REFERER ||
                'https://radiant-queen-pasiya-max-v2.vercel.app',
              'X-Title': 'PasiyaOS Powerhouse',
            },
            body: JSON.stringify({
              model,
              max_tokens: maxTokens,
              messages: [
                { role: 'system', content: system },
                { role: 'user', content: prompt },
              ],
            }),
          },
          PER_MS
        );
        const t = j?.choices?.[0]?.message?.content;
        if (res.ok && t?.trim()) {
          return { ok: true, engine: 'openrouter', model, text: t.trim(), tried };
        }
        tried.push('or@' + model + ':' + trim(j?.error?.message || res.status));
      } catch (e) {
        tried.push('or@' + model + ':' + trim(e.message || e));
      }
    }
  } else tried.push('openrouter:no-key');

  return { ok: false, error: 'All engines failed', tried };
}

/** Web fetch via Jina reader (no key) */
export async function powerBrowse(url) {
  const u = String(url || '').trim();
  if (!/^https?:\/\//i.test(u)) return { ok: false, error: 'Need http(s) URL' };
  try {
    const { res, text } = await fetchJson('https://r.jina.ai/http://' + u.replace(/^https?:\/\//i, ''), {
      headers: { Accept: 'text/markdown' },
    }, 20000);
    // fetchJson parses JSON — for jina we need raw; retry plain fetch
  } catch (_) {}
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 20000);
    const res = await fetch('https://r.jina.ai/' + u, {
      headers: { Accept: 'text/markdown' },
      signal: ctrl.signal,
    });
    clearTimeout(t);
    const md = await res.text();
    if (!res.ok) return { ok: false, error: 'browse ' + res.status };
    return { ok: true, url: u, markdown: md.slice(0, 120000) };
  } catch (e) {
    return { ok: false, error: trim(e.message || e) };
  }
}

/** Lightweight secret / pattern scanner on text */
export function powerScanText(text) {
  const hits = [];
  const patterns = [
    [/sk-[a-zA-Z0-9]{20,}/g, 'openai-like-key'],
    [/ghp_[a-zA-Z0-9]{20,}/g, 'github-pat'],
    [/xox[baprs]-[a-zA-Z0-9-]{10,}/g, 'slack-token'],
    [/-----BEGIN (RSA |OPENSSH )?PRIVATE KEY-----/g, 'private-key'],
    [/AIza[0-9A-Za-z\-_]{20,}/g, 'google-api-key'],
    [/supabase\.co.*service_role/gi, 'supabase-service-hint'],
  ];
  const s = String(text || '');
  for (const [re, label] of patterns) {
    const m = s.match(re);
    if (m) hits.push({ label, count: m.length, sample: m[0].slice(0, 12) + '…' });
  }
  return { ok: true, hits, clean: hits.length === 0 };
}

/** System radar snapshot */
export async function powerRadar() {
  const env = {
    BOT_TOKEN: Boolean(process.env.BOT_TOKEN),
    ADMIN_ID: Boolean(process.env.ADMIN_ID),
    GROQ: Boolean(process.env.GROQ_API_KEY || process.env.GROQ_KEY),
    GEMINI: Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY),
    OPENROUTER: Boolean(process.env.OPENROUTER_API_KEY),
    GITHUB: Boolean(process.env.GITHUB_TOKEN || process.env.GH_TOKEN),
    SUPABASE: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
  };
  let health = { status: null, ms: null };
  try {
    const t0 = Date.now();
    const base = process.env.VERCEL_URL
      ? 'https://' + process.env.VERCEL_URL
      : 'https://radiant-queen-pasiya-max-v2.vercel.app';
    const r = await fetch(base + '/api/telegram', { method: 'GET' });
    health = { status: r.status, ms: Date.now() - t0 };
  } catch (e) {
    health = { status: 0, ms: null, error: trim(e.message) };
  }
  return { ok: true, env, health, version: 'v2000-powerhouse' };
}

export function formatRadar(r) {
  const e = r.env || {};
  const lines = [
    '⚡ POWERHOUSE RADAR · v2000',
    'Webhook health: ' + (r.health?.status || '?') + (r.health?.ms != null ? ' · ' + r.health.ms + 'ms' : ''),
    'Keys: BOT ' + (e.BOT_TOKEN ? '✅' : '❌') +
      ' ADMIN ' + (e.ADMIN_ID ? '✅' : '❌') +
      ' GROQ ' + (e.GROQ ? '✅' : '❌') +
      ' GEMINI ' + (e.GEMINI ? '✅' : '❌') +
      ' OR ' + (e.OPENROUTER ? '✅' : '❌') +
      ' GH ' + (e.GITHUB ? '✅' : '❌') +
      ' SB ' + (e.SUPABASE ? '✅' : '❌'),
  ];
  return lines.join('\n');
}

export default {
  powerChat,
  powerBrowse,
  powerScanText,
  powerRadar,
  formatRadar,
};