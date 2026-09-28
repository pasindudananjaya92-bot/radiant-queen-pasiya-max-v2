/**
 * Radiant Queen · Tenant webhook
 * URL: /api/tenant-webhook?owner=<telegram_user_id>
 * Each user bot sets webhook here; engine = Radiant Queen (Gemini).
 * Brand: Radiant Queen / Pasiya Max — do not rebrand.
 */
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const GEMINI_KEY = process.env.GEMINI_API_KEY || '';

const supabase =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null;

const MODELS = ['gemini-2.5-flash', 'gemini-flash-latest', 'gemini-2.0-flash'];

async function tg(token, method, body) {
  const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  return r.json();
}

async function aiReply(userText) {
  if (!GEMINI_KEY) {
    return 'Radiant Queen engine: GEMINI_API_KEY not configured on host.';
  }
  const ai = new GoogleGenAI({ apiKey: GEMINI_KEY });
  const prompt =
    `You are Pasiya AI for RADIANT QUEEN · PASIYA MAX. ` +
    `Short helpful reply. User language Sinhala or English.\n\nUser: ${userText}`;
  for (const model of MODELS) {
    try {
      const result = await ai.models.generateContent({
        model,
        contents: prompt,
      });
      const text =
        result?.text ||
        result?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') ||
        '';
      if (text && String(text).trim()) return String(text).trim().slice(0, 3500);
    } catch (_) {}
  }
  return 'Radiant Queen AI is busy (free tier). Try again shortly.';
}

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      return res.status(200).json({
        ok: true,
        service: 'radiant-queen-tenant-webhook',
        brand: 'Radiant Queen · Pasiya Max',
      });
    }
    if (req.method !== 'POST') {
      return res.status(405).json({ ok: false });
    }

    const owner = Number(req.query?.owner || req.query?.o || 0);
    if (!owner || !supabase) {
      return res.status(400).json({ ok: false, error: 'owner or db missing' });
    }

    const { data: row } = await supabase
      .from('rq_user_bots')
      .select('*')
      .eq('owner_id', owner)
      .eq('is_active', true)
      .maybeSingle();

    if (!row?.bot_token) {
      return res.status(404).json({ ok: false, error: 'tenant bot not found' });
    }

    const update = req.body || {};
    const msg = update.message;
    if (!msg) {
      return res.status(200).json({ ok: true, ignored: true });
    }

    const chatId = msg.chat.id;
    const text = (msg.text || '').trim();

    if (text === '/start' || text.startsWith('/start ')) {
      await tg(row.bot_token, 'sendMessage', {
        chat_id: chatId,
        text:
          `Welcome — powered by RADIANT QUEEN · PASIYA MAX\n\n` +
          `Owner linked bot: @${row.bot_username || 'bot'}\n` +
          `Send any message for AI help.\n` +
          `Main official bot: @PasiyaMaxQueen_bot`,
      });
      return res.status(200).json({ ok: true });
    }

    if (!text) {
      await tg(row.bot_token, 'sendMessage', {
        chat_id: chatId,
        text: 'Send text for Radiant Queen AI. (Media support on main bot @PasiyaMaxQueen_bot)',
      });
      return res.status(200).json({ ok: true });
    }

    const answer = await aiReply(text);
    await tg(row.bot_token, 'sendMessage', {
      chat_id: chatId,
      text: `${answer}\n\n— Radiant Queen engine`,
    });
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('tenant-webhook', err);
    return res.status(200).json({ ok: true });
  }
}
