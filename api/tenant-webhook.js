/**
 * Radiant Queen · Tenant webhook — Factory Phase 3
 * Pack flags + template welcome + AI gate
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

function defaultWelcome(row, pack) {
  const p = pack ? `Pack: ${pack}\n` : '';
  return (
    `Ayubowan — powered by RADIANT QUEEN · PASIYA MAX\n` +
    p +
    `\nBot: @${row.bot_username || 'bot'}\n` +
    `Send any text for AI help.\n` +
    `/help — commands\n\n` +
    `Full menu & group tools: @PasiyaMaxQueen_bot`
  );
}

function helpText(row, flags, pack) {
  const ai = flags?.ai !== false;
  return (
    `RADIANT QUEEN · TENANT BOT\n` +
    `@${row.bot_username || 'bot'}\n` +
    (pack ? `Pack: ${pack}\n` : '') +
    `Flags: ai=${ai} group=${flags?.group === true} gold=${flags?.gold === true}\n\n` +
    `/start — welcome\n` +
    `/help — this message\n` +
    (ai ? `Any text — AI reply\n` : `AI disabled for this pack\n`) +
    `\nOwner (main bot):\n` +
    `@PasiyaMaxQueen_bot → /factorystatus /settenantwelcome /mybot\n\n` +
    `— Radiant Queen engine · Phase 3`
  );
}

async function loadOwnerFlags(ownerId, botUsername) {
  if (!supabase) return { flags: { ai: true }, template_id: null, version_channel: 'stable' };
  try {
    let q = await supabase
      .from('rq_tenant_flags')
      .select('flags,template_id,version_channel')
      .eq('owner_id', Number(ownerId))
      .eq('bot_username', String(botUsername || ''))
      .maybeSingle();
    if (!q.data) {
      q = await supabase
        .from('rq_tenant_flags')
        .select('flags,template_id,version_channel')
        .eq('owner_id', Number(ownerId))
        .eq('bot_username', '')
        .maybeSingle();
    }
    return {
      flags: q.data?.flags || { ai: true },
      template_id: q.data?.template_id || null,
      version_channel: q.data?.version_channel || 'stable',
    };
  } catch (_) {
    return { flags: { ai: true }, template_id: null, version_channel: 'stable' };
  }
}

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      return res.status(200).json({
        ok: true,
        service: 'radiant-queen-tenant-webhook',
        phase: 'factory-p3',
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

    const state = await loadOwnerFlags(owner, row.bot_username);
    const flags = state.flags || {};
    const pack = state.template_id || null;

    const update = parseBody(req);
    const msg = update.message || update.edited_message;
    if (!msg) {
      return res.status(200).json({ ok: true, ignored: true });
    }

    const chatId = msg.chat.id;
    const text = (msg.text || msg.caption || '').trim();

    if (text === '/start' || text.startsWith('/start')) {
      const custom = (row.welcome_text || '').trim();
      const body = custom || defaultWelcome(row, pack);
      const out = await tg(row.bot_token, 'sendMessage', {
        chat_id: chatId,
        text: body.slice(0, 4000),
      });
      return res.status(200).json({ ok: true, start: true, pack, telegram: out.ok });
    }

    if (text === '/help' || text.startsWith('/help')) {
      const out = await tg(row.bot_token, 'sendMessage', {
        chat_id: chatId,
        text: helpText(row, flags, pack),
      });
      return res.status(200).json({ ok: true, help: true, telegram: out.ok });
    }

    if (text === '/pack' || text.startsWith('/pack')) {
      const out = await tg(row.bot_token, 'sendMessage', {
        chat_id: chatId,
        text:
          `Pack: ${pack || 'none'}\n` +
          `Channel: ${state.version_channel || 'stable'}\n` +
          `Flags: ${JSON.stringify(flags)}\n` +
          `Main: @PasiyaMaxQueen_bot /factorystatus`,
      });
      return res.status(200).json({ ok: true, pack: true, telegram: out.ok });
    }

    if (!text) {
      await tg(row.bot_token, 'sendMessage', {
        chat_id: chatId,
        text: 'Send text for Radiant Queen AI.\n/help · Full tools: @PasiyaMaxQueen_bot',
      });
      return res.status(200).json({ ok: true });
    }

    if (flags.ai === false) {
      await tg(row.bot_token, 'sendMessage', {
        chat_id: chatId,
        text:
          'AI is off for this pack.\n' +
          `Pack: ${pack || 'none'}\n` +
          'Owner: apply another pack on @PasiyaMaxQueen_bot\n' +
          '/factoryapply club',
      });
      return res.status(200).json({ ok: true, ai: false });
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
