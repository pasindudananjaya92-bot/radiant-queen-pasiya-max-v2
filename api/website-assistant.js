/**
 * api/website-assistant.js — Official website chat (PUBLIC)
 * POST { message, history? }
 * CORS enabled for site origin
 */
import { createClient } from '@supabase/supabase-js';

const GROQ_KEY = process.env.GROQ_API_KEY || '';
const GEMINI_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
const ALLOW_ORIGIN = process.env.WEB_ORIGIN || '*';

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', ALLOW_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

async function groqChat(system, user) {
  if (!GROQ_KEY) return null;
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + GROQ_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
      temperature: 0.4,
      max_tokens: 500,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
    signal: AbortSignal.timeout(30000),
  });
  const j = await res.json().catch(() => ({}));
  return j.choices?.[0]?.message?.content || null;
}

async function geminiChat(system, user) {
  if (!GEMINI_KEY) return null;
  const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
  const url =
    'https://generativelanguage.googleapis.com/v1beta/models/' +
    model +
    ':generateContent?key=' +
    encodeURIComponent(GEMINI_KEY);
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: { temperature: 0.4, maxOutputTokens: 500 },
    }),
    signal: AbortSignal.timeout(30000),
  });
  const j = await res.json().catch(() => ({}));
  return j.candidates?.[0]?.content?.parts?.[0]?.text || null;
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'POST only' });
    return;
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    const message = String(body.message || body.text || '').trim().slice(0, 1500);
    if (!message) {
      res.status(400).json({ ok: false, error: 'empty message' });
      return;
    }

    const { isInScope, websiteSystemPrompt, declineMessage, welcomeMessage } = await import(
      '../lib/websiteBrain.js'
    );

    if (/^(hi|hello|hey|ayubowan)\b/i.test(message) && message.length < 24) {
      res.status(200).json({ ok: true, reply: welcomeMessage(), scoped: true });
      return;
    }

    if (!isInScope(message)) {
      res.status(200).json({ ok: true, reply: declineMessage(message), scoped: false });
      return;
    }

    const system = websiteSystemPrompt();
    let reply = (await groqChat(system, message)) || (await geminiChat(system, message));
    if (!reply) {
      reply =
        'Thanks for asking. Radiant Queen lets you create free Telegram AI bots. ' +
        'Open Studio to start, or ask: How do I create a bot?';
    }

    // light log (optional)
    try {
      const url = process.env.SUPABASE_URL;
      const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
      if (url && key) {
        const sb = createClient(url, key, { auth: { persistSession: false } });
        await sb.from('rq_bot_settings').upsert({
          key: 'webchat_' + Date.now().toString(36),
          value: JSON.stringify({
            q: message.slice(0, 300),
            a: String(reply).slice(0, 300),
            at: new Date().toISOString(),
          }),
          updated_at: new Date().toISOString(),
        });
      }
    } catch (_) {}

    res.status(200).json({ ok: true, reply: String(reply).slice(0, 2500), scoped: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
}
