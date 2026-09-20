import { Telegraf } from 'telegraf';
import { GoogleGenAI } from '@google/genai';

const BOT_TOKEN = process.env.BOT_TOKEN || '';
const ADMIN_ID = String(process.env.ADMIN_ID || '').trim();
const GEMINI_KEY = process.env.GEMINI_API_KEY || '';

const MODELS = [
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-3.6-flash',
  'gemini-3.8-flash',
  'gemini-flash-latest',
];

const LINKS = `RADIANT QUEEN • PASIYA MAX
Web: https://radiant-queen-pasiya-max-v2.vercel.app
StrideClub: https://strideclub-platform-6b71a.containers.snapdeploy.app
YouTube: https://youtube.com/@pasyamaxofficial
Instagram: https://www.instagram.com/pasindu5598
Facebook: https://www.facebook.com/share/18xRGhYVUo/
TikTok: https://tiktok.com/@pasindudananjaya619
Telegram: https://t.me/goldenbotmdchannel
GitHub: https://github.com/pasindudananjaya92-bot/radiant-queen-pasiya-max-v2`;

let aiClient = null;
let resolvedModel = null;
let bot = null;

function getAI() {
  if (!GEMINI_KEY) return null;
  if (!aiClient) aiClient = new GoogleGenAI({ apiKey: GEMINI_KEY });
  return aiClient;
}

function isAdmin(ctx) {
  const id = String(ctx.from?.id ?? '');
  return Boolean(ADMIN_ID && id === ADMIN_ID);
}

function identityLine(ctx) {
  if (isAdmin(ctx)) {
    const name = ctx.from?.username || ctx.from?.first_name || 'Pasiya Max';
    return `FOUNDER MODE: This Telegram user is ${name} (id ${ctx.from.id}), owner of RADIANT QUEEN and Pasiya Max. Address him as නිර්මාතෘ.`;
  }
  const name = ctx.from?.first_name || ctx.from?.username || 'user';
  return `The user is ${name}. Be helpful. Do not call them the founder.`;
}

async function generateReply(prompt, ctx, imageBase64, mimeType) {
  const ai = getAI();
  if (!ai) return 'Gemini key missing. Set GEMINI_API_KEY on Vercel.';

  const systemInstruction = `You are Pasiya AI, assistant of Pasiya Max, for RADIANT QUEEN.
Answer in the user's language (Sinhala or English). Be practical. No fake supercomputer stats.
${identityLine(ctx)}
Official links when asked:
${LINKS}`;

  const parts = [{ text: prompt }];
  if (imageBase64 && mimeType) {
    parts.push({ inlineData: { data: imageBase64, mimeType } });
  }

  const models = resolvedModel
    ? [resolvedModel, ...MODELS.filter((m) => m !== resolvedModel)]
    : MODELS;

  let lastErr;
  for (const model of models) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: [{ role: 'user', parts }],
        config: { systemInstruction, temperature: 0.7 },
      });
      resolvedModel = model;
      const text = (response.text || '').trim();
      if (text) return text.slice(0, 3500);
    } catch (err) {
      lastErr = err;
      const msg = String(err?.message || err).toLowerCase();
      if (msg.includes('404') || msg.includes('not found') || msg.includes('no longer available')) {
        continue;
      }
      if (msg.includes('429') || msg.includes('quota')) {
        return 'Gemini free-tier quota resting. Wait a minute and try a shorter question.';
      }
      break;
    }
  }

  return `AI error: ${String(lastErr?.message || lastErr).slice(0, 180)}`;
}

function buildBot() {
  if (bot) return bot;
  if (!BOT_TOKEN) return null;

  bot = new Telegraf(BOT_TOKEN);

  bot.start(async (ctx) => {
    const who = isAdmin(ctx)
      ? 'ආයුබෝවන් නිර්මාතෘ Pasiya Max.'
      : `Hello ${ctx.from?.first_name || ''}`.trim();
    await ctx.reply(
      `${who}\n\nRADIANT QUEEN • PASIYA MAX bot is live.\n\n/help — commands\n/ask — Gemini chat\n/social — links\n/id — your Telegram id\n\nPhoto එකක් යවන්න — vision analysis.`
    );
  });

  bot.command('help', async (ctx) => {
    await ctx.reply(
      `Commands\n/start — welcome\n/ask <question> — Gemini\n/social — official links\n/strideclub — running platform\n/id — your Telegram user id\n/status — config check\n\nOr just type a message.`
    );
  });

  bot.command('id', async (ctx) => {
    await ctx.reply(
      `Your Telegram id: ${ctx.from.id}\nUsername: @${ctx.from.username || 'none'}\nAdmin match: ${isAdmin(ctx) ? 'YES — founder' : 'NO — set ADMIN_ID on Vercel'}`
    );
  });

  bot.command('status', async (ctx) => {
    await ctx.reply(
      `Token: ${BOT_TOKEN ? 'yes' : 'NO'}\nGemini key: ${GEMINI_KEY ? 'yes' : 'NO'}\nADMIN_ID set: ${ADMIN_ID ? 'yes' : 'NO'}\nYou are founder: ${isAdmin(ctx) ? 'yes' : 'no'}\nModel: ${resolvedModel || 'not used yet'}`
    );
  });

  bot.command('social', async (ctx) => {
    await ctx.reply(LINKS);
  });

  bot.command('strideclub', async (ctx) => {
    await ctx.reply(
      'StrideClub:\nhttps://strideclub-platform-6b71a.containers.snapdeploy.app'
    );
  });

  bot.command('ask', async (ctx) => {
    const q = (ctx.message.text || '').replace(/^\/ask(@\w+)?\s*/i, '').trim();
    if (!q) {
      await ctx.reply('Usage: /ask Zone 2 කියන්නේ මොකක්ද?');
      return;
    }
    await ctx.sendChatAction('typing');
    await ctx.reply(await generateReply(q, ctx));
  });

  bot.on('photo', async (ctx) => {
    try {
      await ctx.sendChatAction('typing');
      const photos = ctx.message.photo || [];
      const best = photos[photos.length - 1];
      const caption =
        ctx.message.caption ||
        'Analyze this image. If it is running-related, coach me.';
      const file = await ctx.telegram.getFile(best.file_id);
      const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`;
      const img = await fetch(fileUrl);
      const buf = Buffer.from(await img.arrayBuffer());
      const b64 = buf.toString('base64');
      const mime = (file.file_path || '').endsWith('.png') ? 'image/png' : 'image/jpeg';
      await ctx.reply(await generateReply(caption, ctx, b64, mime));
    } catch {
      await ctx.reply('Photo analysis failed. Try a smaller image.');
    }
  });

  bot.on('text', async (ctx) => {
    const text = (ctx.message.text || '').trim();
    if (!text || text.startsWith('/')) return;
    await ctx.sendChatAction('typing');
    await ctx.reply(await generateReply(text, ctx));
  });

  bot.catch((err) => {
    console.error('telegram bot error', err);
  });

  return bot;
}

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      if (req.query?.setup === '1') {
        if (!BOT_TOKEN) {
          return res.status(500).json({ ok: false, error: 'BOT_TOKEN missing' });
        }
        const host = req.headers['x-forwarded-host'] || req.headers.host;
        const url = `https://${host}/api/telegram`;
        const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/setWebhook`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url,
            allowed_updates: ['message'],
            drop_pending_updates: true,
          }),
        });
        const data = await r.json();
        return res.status(200).json({ webhook: url, telegram: data });
      }
      return res.status(200).json({
        ok: true,
        service: 'radiant-queen-telegram',
        hasToken: Boolean(BOT_TOKEN),
        hasGemini: Boolean(GEMINI_KEY),
        hasAdmin: Boolean(ADMIN_ID),
      });
    }

    const instance = buildBot();
    if (!instance) {
      return res.status(500).json({ ok: false, error: 'BOT_TOKEN missing' });
    }
    await instance.handleUpdate(req.body);
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('telegram webhook', err);
    return res.status(200).json({ ok: true });
  }
} 
