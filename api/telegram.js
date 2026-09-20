import { Telegraf, Markup } from 'telegraf';
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

const pendingTool = new Map();

let aiClient = null;
let resolvedModel = null;
let bot = null;
let bootTime = Date.now();

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
    return `FOUNDER MODE: This Telegram user is ${name} (id ${ctx.from.id}), owner of RADIANT QUEEN and Pasiya Max. Address him as the founder.`;
  }
  const name = ctx.from?.first_name || ctx.from?.username || 'user';
  return `The user is ${name}. Be helpful. Do not call them the founder.`;
}

function mainMenuKeyboard(ctx) {
  const rows = [
    [
      Markup.button.callback('Ask AI', 'menu_ask'),
      Markup.button.callback('Tools', 'menu_tools'),
    ],
    [
      Markup.button.callback('Social', 'menu_social'),
      Markup.button.callback('Status', 'menu_status'),
    ],
    [
      Markup.button.callback('StrideClub', 'menu_stride'),
      Markup.button.callback('Help', 'menu_help'),
    ],
    [Markup.button.callback('My ID', 'menu_id')],
  ];
  if (isAdmin(ctx)) {
    rows.push([Markup.button.callback('Admin Panel', 'menu_admin')]);
  }
  return Markup.inlineKeyboard(rows);
}

function toolsKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('Translate', 'tool_translate'),
      Markup.button.callback('Summarize', 'tool_summarize'),
    ],
    [
      Markup.button.callback('Running tip', 'tool_run_tip'),
      Markup.button.callback('Rewrite pro', 'tool_rewrite'),
    ],
    [Markup.button.callback('Back to menu', 'menu_home')],
  ]);
}

function adminKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('Health', 'admin_health'),
      Markup.button.callback('Who am I', 'admin_whoami'),
    ],
    [
      Markup.button.callback('Clear tool mode', 'admin_clear'),
      Markup.button.callback('Model info', 'admin_model'),
    ],
    [
      Markup.button.callback('Links vault', 'admin_links'),
      Markup.button.callback('Back', 'menu_home'),
    ],
  ]);
}

function statusText(ctx) {
  return (
    `Bot status\n` +
    `Token: ${BOT_TOKEN ? 'yes' : 'NO'}\n` +
    `Gemini: ${GEMINI_KEY ? 'yes' : 'NO'}\n` +
    `ADMIN_ID: ${ADMIN_ID ? 'yes' : 'NO'}\n` +
    `You are founder: ${isAdmin(ctx) ? 'yes' : 'no'}\n` +
    `Model: ${resolvedModel || 'not used yet'}`
  );
}

function uptimeText() {
  const sec = Math.floor((Date.now() - bootTime) / 1000);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s}s (this warm instance)`;
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

function toolPrompt(mode, userText) {
  if (mode === 'translate') {
    return `Translate the following text. If it is Sinhala, translate to clear English. If English, translate to natural Sinhala. Output only the translation.\n\n${userText}`;
  }
  if (mode === 'summarize') {
    return `Summarize the following text in short bullet points. Use the same language as the input.\n\n${userText}`;
  }
  if (mode === 'rewrite') {
    return `Rewrite the following text to sound more professional and clear. Keep the same language. Output only the rewritten text.\n\n${userText}`;
  }
  return userText;
}

async function requireAdmin(ctx) {
  if (isAdmin(ctx)) return true;
  try {
    await ctx.answerCbQuery('Admin only');
  } catch (_) {}
  await ctx.reply('Admin Panel is only for the founder account.');
  return false;
}

function buildBot() {
  if (bot) return bot;
  if (!BOT_TOKEN) return null;

  bot = new Telegraf(BOT_TOKEN);

  bot.start(async (ctx) => {
    try {
      const who = isAdmin(ctx)
        ? 'Ayubowan Nirmathru Pasiya Max'
        : `Hello ${ctx.from?.first_name || 'there'}`;

      await ctx.reply(
        `${who}\n\n` +
          `RADIANT QUEEN • PASIYA MAX\n` +
          `AI hub — chat, vision, tools & links.\n\n` +
          (isAdmin(ctx) ? `Founder mode ON — Admin Panel unlocked.\n\n` : '') +
          `Pick a button, or type a message.`,
        mainMenuKeyboard(ctx)
      );
    } catch (err) {
      console.error('start handler', err);
      try {
        await ctx.reply('Welcome to RADIANT QUEEN. Use /help or the buttons.', mainMenuKeyboard(ctx));
      } catch (_) {}
    }
  });

  bot.command('help', async (ctx) => {
    await ctx.reply(
      `Commands\n` +
        `/start — main menu\n` +
        `/ask <question> — Gemini\n` +
        `/social — links\n` +
        `/strideclub — running club\n` +
        `/id — your Telegram id\n` +
        `/status — config check\n` +
        (isAdmin(ctx) ? `/admin — founder panel\n` : '') +
        `\nTools: Translate, Summarize, Running tip, Rewrite\n` +
        `Send a photo for vision analysis.`,
      mainMenuKeyboard(ctx)
    );
  });

  bot.command('admin', async (ctx) => {
    if (!isAdmin(ctx)) {
      await ctx.reply('Admin only.');
      return;
    }
    await ctx.reply(
      `Founder Admin Panel\n` +
        `User: ${ctx.from.first_name || ''} (@${ctx.from.username || 'none'})\n` +
        `ID: ${ctx.from.id}`,
      adminKeyboard()
    );
  });

  bot.command('id', async (ctx) => {
    await ctx.reply(
      `Your Telegram id: ${ctx.from.id}\n` +
        `Username: @${ctx.from.username || 'none'}\n` +
        `Admin match: ${isAdmin(ctx) ? 'YES — founder' : 'NO'}`,
      mainMenuKeyboard(ctx)
    );
  });

  bot.command('status', async (ctx) => {
    try {
      await ctx.reply(statusText(ctx), mainMenuKeyboard(ctx));
    } catch (err) {
      console.error('status command', err);
      await ctx.reply('Status unavailable right now.');
    }
  });

  bot.command('social', async (ctx) => {
    await ctx.reply(LINKS, mainMenuKeyboard(ctx));
  });

  bot.command('strideclub', async (ctx) => {
    await ctx.reply(
      'StrideClub:\nhttps://strideclub-platform-6b71a.containers.snapdeploy.app',
      mainMenuKeyboard(ctx)
    );
  });

  bot.command('ask', async (ctx) => {
    const q = (ctx.message.text || '').replace(/^\/ask(@\w+)?\s*/i, '').trim();
    if (!q) {
      await ctx.reply(
        'Usage: /ask your question here\nOr just type your question.',
        mainMenuKeyboard(ctx)
      );
      return;
    }
    await ctx.sendChatAction('typing');
    await ctx.reply(await generateReply(q, ctx), mainMenuKeyboard(ctx));
  });

  bot.action('menu_home', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply('Main menu', mainMenuKeyboard(ctx));
  });

  bot.action('menu_ask', async (ctx) => {
    await ctx.answerCbQuery();
    pendingTool.delete(String(ctx.from.id));
    await ctx.reply('Ask AI mode — type your question now (Sinhala or English).');
  });

  bot.action('menu_tools', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply('Tools panel — pick one:', toolsKeyboard());
  });

  bot.action('menu_social', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply(LINKS, mainMenuKeyboard(ctx));
  });

  bot.action('menu_status', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      await ctx.reply(statusText(ctx), mainMenuKeyboard(ctx));
    } catch (err) {
      console.error('menu_status', err);
      try {
        await ctx.answerCbQuery('Error');
        await ctx.reply('Status check failed. Try /status');
      } catch (_) {}
    }
  });

  bot.action('menu_stride', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply(
      'StrideClub:\nhttps://strideclub-platform-6b71a.containers.snapdeploy.app',
      mainMenuKeyboard(ctx)
    );
  });

  bot.action('menu_help', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply(
      `Help\n` +
        `- Type any message → AI reply\n` +
        `- Send photo → vision\n` +
        `- Tools → translate / summarize / tips\n` +
        `- /ask question → Gemini`,
      mainMenuKeyboard(ctx)
    );
  });

  bot.action('menu_id', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply(
      `Your Telegram id: ${ctx.from.id}\nAdmin: ${isAdmin(ctx) ? 'YES' : 'NO'}`,
      mainMenuKeyboard(ctx)
    );
  });

  bot.action('menu_admin', async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    await ctx.answerCbQuery();
    await ctx.reply(
      `Founder Admin Panel\n` +
        `Only you can see these controls.\n` +
        `ID: ${ctx.from.id}`,
      adminKeyboard()
    );
  });

  bot.action('admin_health', async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    await ctx.answerCbQuery();
    await ctx.reply(
      `Health\n` +
        `Webhook service: radiant-queen-telegram\n` +
        `Token: ${BOT_TOKEN ? 'set' : 'MISSING'}\n` +
        `Gemini: ${GEMINI_KEY ? 'set' : 'MISSING'}\n` +
        `Admin configured: ${ADMIN_ID ? 'yes' : 'no'}\n` +
        `Instance uptime: ${uptimeText()}\n` +
        `Pending tool modes in memory: ${pendingTool.size}`,
      adminKeyboard()
    );
  });

  bot.action('admin_whoami', async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    await ctx.answerCbQuery();
    await ctx.reply(
      `Founder identity\n` +
        `Name: ${ctx.from.first_name || ''} ${ctx.from.last_name || ''}\n` +
        `Username: @${ctx.from.username || 'none'}\n` +
        `Telegram ID: ${ctx.from.id}\n` +
        `Matches ADMIN_ID: YES`,
      adminKeyboard()
    );
  });

  bot.action('admin_clear', async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    await ctx.answerCbQuery();
    pendingTool.clear();
    await ctx.reply('Cleared all in-memory tool modes on this instance.', adminKeyboard());
  });

  bot.action('admin_model', async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    await ctx.answerCbQuery();
    await ctx.reply(
      `Model info\n` +
        `Last resolved: ${resolvedModel || 'none yet'}\n` +
        `Candidates:\n${MODELS.map((m) => `- ${m}`).join('\n')}`,
      adminKeyboard()
    );
  });

  bot.action('admin_links', async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    await ctx.answerCbQuery();
    await ctx.reply(LINKS, adminKeyboard());
  });

  bot.action('tool_translate', async (ctx) => {
    await ctx.answerCbQuery();
    pendingTool.set(String(ctx.from.id), 'translate');
    await ctx.reply('Translate mode — send the text to translate.');
  });

  bot.action('tool_summarize', async (ctx) => {
    await ctx.answerCbQuery();
    pendingTool.set(String(ctx.from.id), 'summarize');
    await ctx.reply('Summarize mode — send the long text to summarize.');
  });

  bot.action('tool_rewrite', async (ctx) => {
    await ctx.answerCbQuery();
    pendingTool.set(String(ctx.from.id), 'rewrite');
    await ctx.reply('Rewrite mode — send the text to make professional.');
  });

  bot.action('tool_run_tip', async (ctx) => {
    await ctx.answerCbQuery();
    pendingTool.delete(String(ctx.from.id));
    await ctx.sendChatAction('typing');
    const tip = await generateReply(
      'Give one practical running tip for today (max 6 lines). Sinhala or English matching a Sri Lankan amateur runner context.',
      ctx
    );
    await ctx.reply(tip, toolsKeyboard());
  });

  bot.on('photo', async (ctx) => {
    try {
      pendingTool.delete(String(ctx.from.id));
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
      await ctx.reply(await generateReply(caption, ctx, b64, mime), mainMenuKeyboard(ctx));
    } catch {
      await ctx.reply('Photo analysis failed. Try a smaller image.', mainMenuKeyboard(ctx));
    }
  });

  bot.on('text', async (ctx) => {
    const text = (ctx.message.text || '').trim();
    if (!text || text.startsWith('/')) return;

    const uid = String(ctx.from.id);
    const mode = pendingTool.get(uid);

    await ctx.sendChatAction('typing');

    if (mode) {
      pendingTool.delete(uid);
      const out = await generateReply(toolPrompt(mode, text), ctx);
      await ctx.reply(out, toolsKeyboard());
      return;
    }

    await ctx.reply(await generateReply(text, ctx), mainMenuKeyboard(ctx));
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
            allowed_updates: ['message', 'callback_query'],
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
 
