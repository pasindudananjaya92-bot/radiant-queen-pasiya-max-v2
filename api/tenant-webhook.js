/**
 * Radiant Queen · Tenant webhook — Phase 5
 * Personality + /help + custom welcome
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

const PERSONALITY =
  'You are Pasiya AI for RADIANT QUEEN · PASIYA MAX. ' +
  'Warm, confident, short answers. Sinhala or English matching the user. ' +
  'Never claim to be another brand. Full power tools live on @PasiyaMaxQueen_bot.';

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
    return 'Radiant Queen engine online. AI key missing on host.';
  }
  const ai = new GoogleGenAI({ apiKey: GEMINI_KEY });
  const prompt = `${PERSONALITY}\n\nUser: ${userText}`;
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
  return 'Radiant Queen AI is busy (free tier). Try again shortly.\nFull tools: @PasiyaMaxQueen_bot';
}

function parseBody(req) {
  let body = req.body;
  if (body == null) return {};
  if (typeof body === 'string') {
    try {
      return JSON.parse(body);
    } catch {
      return {};
    }
  }
  return body;
}

function defaultWelcome(row) {
  return (
    `Ayubowan — powered by RADIANT QUEEN · PASIYA MAX\n\n` +
    `Bot: @${row.bot_username || 'bot'}\n` +
    `Send any text for AI help.\n` +
    `/help — commands\n\n` +
    `Full menu & group tools: @PasiyaMaxQueen_bot`
  );
}

function helpText(row) {
  return (
    `RADIANT QUEEN · TENANT BOT\n` +
    `@${row.bot_username || 'bot'}\n\n` +
    `/start — welcome\n` +
    `/help — this message\n` +
    `Any text — AI reply (Queen personality)\n\n` +
    `Owner tools (on main bot):\n` +
    `@PasiyaMaxQueen_bot → /settenantwelcome /mybot /resyncbot\n\n` +
    `— Radiant Queen engine`
  );
}

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      return res.status(200).json({
        ok: true,
        service: 'radiant-queen-tenant-webhook',
        phase: '5-personality',
        brand: 'Radiant Queen · Pasiya Max',
        hasDb: Boolean(supabase),
        hasGemini: Boolean(GEMINI_KEY),
      });
    }
    if (req.method !== 'POST') {
      return res.status(405).json({ ok: false });
    }

    const owner = Number(req.query?.owner || req.query?.o || 0);
    if (!owner || !supabase) {
      return res.status(200).json({ ok: false, error: 'owner or db missing' });
    }

    const { data: row } = await supabase
      .from('rq_user_bots')
      .select('*')
      .eq('owner_id', owner)
      .eq('is_active', true)
      .maybeSingle();

    if (!row?.bot_token) {
      return res.status(200).json({ ok: false, error: 'tenant bot not found' });
    }

    const update = parseBody(req);
    const msg = update.message || update.edited_message;
    if (!msg) {
      return res.status(200).json({ ok: true, ignored: true });
    }

    const chatId = msg.chat.id;
    const text = (msg.text || msg.caption || '').trim();

    if (text === '/start' || text.startsWith('/start')) {
      const custom = (row.welcome_text || '').trim();
      const body = custom || defaultWelcome(row);
      const out = await tg(row.bot_token, 'sendMessage', {
        chat_id: chatId,
        text: body.slice(0, 4000),
      });
      return res.status(200).json({ ok: true, start: true, telegram: out.ok });
    }

    if (text === '/help' || text.startsWith('/help')) {
      const out = await tg(row.bot_token, 'sendMessage', {
        chat_id: chatId,
        text: helpText(row),
      });
      return res.status(200).json({ ok: true, help: true, telegram: out.ok });
    }

    if (!text) {
      await tg(row.bot_token, 'sendMessage', {
        chat_id: chatId,
        text: 'Send text for Radiant Queen AI.\n/help · Full tools: @PasiyaMaxQueen_bot',
      });
      return res.status(200).json({ ok: true });
    }

    const answer = await aiReply(text);
    const out = await tg(row.bot_token, 'sendMessage', {
      chat_id: chatId,
      text: `${answer}\n\n— Radiant Queen · @PasiyaMaxQueen_bot`,
    });
    return res.status(200).json({ ok: true, telegram: out.ok });
  } catch (err) {
    console.error('tenant-webhook', err);
    return res.status(200).json({ ok: true });
  }
}
