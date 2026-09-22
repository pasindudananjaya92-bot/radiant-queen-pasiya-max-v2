import { Telegraf, Markup } from 'telegraf';
import { GoogleGenAI } from '@google/genai';

const BOT_TOKEN = process.env.BOT_TOKEN || '';
const ADMIN_ID = String(process.env.ADMIN_ID || '').trim();
const GEMINI_KEY = process.env.GEMINI_API_KEY || '';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const GITHUB_REPO = process.env.GITHUB_REPO || 'pasindudananjaya92-bot/radiant-queen-pasiya-max-v2';

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

const STRIDE_LINKS = `StrideClub hub
Live: https://strideclub-platform-6b71a.containers.snapdeploy.app
Open the site for: Dashboard, Logbook, Leaderboard, Events, AI Coach, Agent Logs.`;

const pendingTool = new Map();
const groupSettings = new Map(); // groupId -> { antiLink: boolean, welcome: string }

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

function numberedMainMenuText() {
  return (
    `╔══════════════════════════════╗\n` +
    `║  RADIANT QUEEN • PASIYA MAX\n` +
    `║  VERSION 2.1 | GEMINI AI\n` +
    `╚══════════════════════════════╝\n\n` +
    `WEB     radiant-queen-pasiya-max-v2.vercel.app\n` +
    `STRIDE  strideclub-platform-6b71a.containers.snapdeploy.app\n` +
    `BOT     @PasiyaMaxQueen_bot\n\n` +
    `┌─ MAIN (Reply Number) ────────┐\n` +
    `│  1  OWNER / FOUNDER\n` +
    `│  2  SOCIAL HUB\n` +
    `│  3  AI LAB\n` +
    `│  4  GROUP ADMIN LAB\n` +
    `│  5  CREATOR TOOLS\n` +
    `│  6  EDUCATION LAB\n` +
    `│  7  CHANNELS & LINKS\n` +
    `│  8  STRIDECLUB HUB\n` +
    `│  9  STATUS & HELP\n` +
    `└──────────────────────────────┘\n\n` +
    `Type 1–9 • buttons work too • or ask anything\n` +
    `Group Admin Lab needs bot ADMIN rights.`
  );
}

function ownerMenuText() {
  return (
    `OWNER / FOUNDER MENU\n\n` +
    `1 Health / Status\n` +
    `2 Who am I\n` +
    `3 Model info\n` +
    `4 GitHub status\n` +
    `5 Clear tool mode\n` +
    `6 Links vault\n` +
    `0 Back`
  );
}

function mainMenuKeyboard(ctx) {
  const rows = [
    [
      Markup.button.callback('Ask AI', 'menu_ask'),
      Markup.button.callback('Tools', 'menu_tools'),
    ],
    [
      Markup.button.callback('StrideClub', 'menu_stride_panel'),
      Markup.button.callback('Social', 'menu_social'),
    ],
    [
      Markup.button.callback('Status', 'menu_status'),
      Markup.button.callback('Help', 'menu_help'),
    ],
    [Markup.button.callback('My ID', 'menu_id')],
  ];
  if (isAdmin(ctx)) {
    rows.push([Markup.button.callback('Admin Panel', 'menu_admin')]);
  }
  return Markup.inlineKeyboard(rows);
}

function afterReplyKeyboard(ctx) {
  const rows = [
    [
      Markup.button.callback('Tools', 'menu_tools'),
      Markup.button.callback('Menu', 'menu_home'),
    ],
  ];
  if (isAdmin(ctx)) {
    rows.push([Markup.button.callback('Admin', 'menu_admin')]);
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
      Markup.button.callback('Rewrite pro', 'tool_rewrite'),
      Markup.button.callback('Caption gen', 'tool_caption'),
    ],
    [
      Markup.button.callback('Hashtags', 'tool_hashtags'),
      Markup.button.callback('Bio writer', 'tool_bio'),
    ],
    [
      Markup.button.callback('Running tip', 'tool_run_tip'),
      Markup.button.callback('Ideas', 'tool_ideas'),
    ],
    [
      Markup.button.callback('Photo caption', 'tool_photo_caption'),
    ],
    [Markup.button.callback('Back to menu', 'menu_home')],
  ]);
}

function strideKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.url('Open StrideClub', 'https://strideclub-platform-6b71a.containers.snapdeploy.app')],
    [Markup.button.callback('Stride summary', 'stride_summary')],
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
      Markup.button.callback('Model info', 'admin_model'),
      Markup.button.callback('GitHub status', 'admin_github'),
    ],
    [
      Markup.button.callback('Clear tool mode', 'admin_clear'),
      Markup.button.callback('Links vault', 'admin_links'),
    ],
    [Markup.button.callback('Back', 'menu_home')],
  ]);
}

function statusText(ctx) {
  return (
    `RADIANT QUEEN • PASIYA MAX v2.1\n` +
    `Token: ${BOT_TOKEN ? 'yes' : 'NO'}\n` +
    `Gemini: ${GEMINI_KEY ? 'yes' : 'NO'}\n` +
    `ADMIN_ID: ${ADMIN_ID ? 'yes' : 'NO'}\n` +
    `GitHub token: ${GITHUB_TOKEN ? 'yes' : 'no'}\n` +
    `You are founder: ${isAdmin(ctx) ? 'yes' : 'no'}\n` +
    `Model: ${resolvedModel || 'not used yet'}`
  );
}

function uptimeText() {
  const sec = Math.floor((Date.now() - bootTime) / 1000);
  return `${Math.floor(sec / 60)}m ${sec % 60}s (this warm instance)`;
}

async function ensureGroupAdmin(ctx) {
  if (ctx.chat?.type !== 'group' && ctx.chat?.type !== 'supergroup') {
    await ctx.reply('This command works only inside a group. Add the bot to a group, make it ADMIN, then try again.');
    return false;
  }
  try {
    const me = await ctx.telegram.getChatMember(ctx.chat.id, ctx.botInfo.id);
    if (me.status !== 'administrator' && me.status !== 'creator') {
      await ctx.reply('I need ADMIN rights in this group (restrict members + delete messages recommended).');
      return false;
    }
    return true;
  } catch (err) {
    await ctx.reply('Could not check admin rights. Make me admin and retry.');
    return false;
  }
}

async function isUserGroupAdmin(ctx) {
  try {
    const m = await ctx.telegram.getChatMember(ctx.chat.id, ctx.from.id);
    return m.status === 'administrator' || m.status === 'creator';
  } catch {
    return false;
  }
}

function hasLink(text = '') {
  return /https?:\/\/|t\.me\/|www\.|telegram\.me\//i.test(text);
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
      if (msg.includes('404') || msg.includes('not found') || msg.includes('no longer available')) continue;
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
    return `Translate the following. Sinhala→English or English→natural Sinhala. Output only the translation.\n\n${userText}`;
  }
  if (mode === 'summarize') {
    return `Summarize in short bullet points. Same language as input.\n\n${userText}`;
  }
  if (mode === 'rewrite') {
    return `Rewrite professionally and clearly. Same language. Output only the rewrite.\n\n${userText}`;
  }
  if (mode === 'caption') {
    return `Write 3 social captions for this idea. Each: max 2 lines + 5 hashtags. Confident athletic premium tone (Pasiya Max). Number 1) 2) 3).\n\nIdea:\n${userText}`;
  }
  if (mode === 'hashtags') {
    return `Suggest 15 strong hashtags for this topic (mix global + Sri Lanka if relevant). One line, space-separated, no explanation.\n\nTopic:\n${userText}`;
  }
  if (mode === 'bio') {
    return `Write 3 short social bios (max 150 chars each) for this person/brand. Number 1) 2) 3). Premium creator/athlete tone.\n\nBrief:\n${userText}`;
  }
  if (mode === 'ideas') {
    return `Give 7 content or product ideas based on this theme. Short bullets. Practical for a creator + running brand (Pasiya Max).\n\nTheme:\n${userText}`;
  }
  if (mode === 'photo_caption') {
    return `Look at the image. Write 3 premium social captions (athletic/creator brand). Each max 2 lines + 5 hashtags. Number 1) 2) 3).\nExtra context: ${userText || 'none'}`;
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

async function fetchGitHubStatus() {
  if (!GITHUB_TOKEN) {
    return 'GitHub token not set. Add GITHUB_TOKEN (read-only) and GITHUB_REPO on Vercel.';
  }
  try {
    const headers = {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'radiant-queen-bot',
    };
    const repoRes = await fetch(`https://api.github.com/repos/${GITHUB_REPO}`, { headers });
    if (!repoRes.ok) {
      return `GitHub repo error: HTTP ${repoRes.status}. Check GITHUB_TOKEN permissions (Contents: Read).`;
    }
    const repo = await repoRes.json();
    const commitRes = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/commits?per_page=1`, {
      headers,
    });
    let commitLine = 'No commits';
    if (commitRes.ok) {
      const commits = await commitRes.json();
      if (Array.isArray(commits) && commits[0]) {
        const c = commits[0];
        const msg = (c.commit?.message || '').split('\n')[0].slice(0, 80);
        const sha = (c.sha || '').slice(0, 7);
        const when = c.commit?.author?.date || '';
        commitLine = `${sha} — ${msg}\n${when}`;
      }
    }
    return (
      `GitHub status (read-only)\n` +
      `Repo: ${repo.full_name}\n` +
      `Default branch: ${repo.default_branch}\n` +
      `Stars: ${repo.stargazers_count} | Open issues: ${repo.open_issues_count}\n` +
      `Pushed: ${repo.pushed_at}\n` +
      `Latest commit:\n${commitLine}\n` +
      `URL: ${repo.html_url}`
    );
  } catch (err) {
    return `GitHub fetch failed: ${String(err?.message || err).slice(0, 160)}`;
  }
}

async function handlePhoto(ctx) {
  const uid = String(ctx.from.id);
  const mode = pendingTool.get(uid);
  const photos = ctx.message.photo || [];
  const best = photos[photos.length - 1];
  const caption = ctx.message.caption || '';
  const file = await ctx.telegram.getFile(best.file_id);
  const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`;
  const img = await fetch(fileUrl);
  const buf = Buffer.from(await img.arrayBuffer());
  const b64 = buf.toString('base64');
  const mime = (file.file_path || '').endsWith('.png') ? 'image/png' : 'image/jpeg';

  await ctx.sendChatAction('typing');

  if (mode === 'photo_caption') {
    pendingTool.delete(uid);
    const out = await generateReply(toolPrompt('photo_caption', caption), ctx, b64, mime);
    await ctx.reply(out, afterReplyKeyboard(ctx));
    return;
  }

  pendingTool.delete(uid);
  const prompt =
    caption ||
    'Analyze this image. If running-related, coach me. Be practical.';
  const out = await generateReply(prompt, ctx, b64, mime);
  await ctx.reply(out, afterReplyKeyboard(ctx));
}

function buildBot() {
  if (bot) return bot;
  if (!BOT_TOKEN) return null;

  bot = new Telegraf(BOT_TOKEN);

  bot.start(async (ctx) => {
    try {
      const isGroup =
        ctx.chat?.type === 'group' || ctx.chat?.type === 'supergroup';

      if (isGroup) {
        await ctx.reply(
          `RADIANT QUEEN is active in this group.\n\n` +
            `• Mention @${ctx.botInfo?.username || 'PasiyaMaxQueen_bot'} + question\n` +
            `• Or reply to my messages\n` +
            `• Full tools: open a private chat with me\n\n` +
            `/help for commands`,
          mainMenuKeyboard(ctx)
        );
        return;
      }

      const who = isAdmin(ctx)
        ? 'Ayubowan Nirmathru Pasiya Max'
        : `Hello ${ctx.from?.first_name || 'there'}`;
      await ctx.reply(
        `${who}\n\n` +
          numberedMainMenuText(),
        mainMenuKeyboard(ctx)
      );
    } catch (err) {
      console.error('start', err);
      try {
        await ctx.reply('Welcome. Use /help or the buttons.', mainMenuKeyboard(ctx));
      } catch (_) {}
    }
  });

  bot.command('menu', async (ctx) => {
    await ctx.reply(numberedMainMenuText(), mainMenuKeyboard(ctx));
  });

  bot.command('help', async (ctx) => {
    await ctx.reply(
      `Commands\n` +
        `/start — welcome & menu\n` +
        `/menu — show main buttons\n` +
        `/ask <q> — Gemini\n` +
        `/social /strideclub /id /status\n` +
        (isAdmin(ctx) ? `/admin — founder panel\n` : '') +
        `\nTools: Translate, Summarize, Rewrite, Caption, Hashtags, Bio, Ideas, Photo caption, Running tip\n` +
        `Send a photo anytime for vision.`,
      mainMenuKeyboard(ctx)
    );
  });

  bot.command('admin', async (ctx) => {
    if (!isAdmin(ctx)) {
      await ctx.reply('Admin only.');
      return;
    }
    await ctx.reply(`Founder Admin Panel\nID: ${ctx.from.id}`, adminKeyboard());
  });

  bot.command('id', async (ctx) => {
    await ctx.reply(
      `Your Telegram id: ${ctx.from.id}\nUsername: @${ctx.from.username || 'none'}\nAdmin: ${isAdmin(ctx) ? 'YES' : 'NO'}`,
      mainMenuKeyboard(ctx)
    );
  });

  bot.command('status', async (ctx) => {
    try {
      await ctx.reply(statusText(ctx), mainMenuKeyboard(ctx));
    } catch {
      await ctx.reply('Status unavailable.');
    }
  });

  bot.command('social', async (ctx) => {
    await ctx.reply(LINKS, mainMenuKeyboard(ctx));
  });

  bot.command('strideclub', async (ctx) => {
    await ctx.reply(STRIDE_LINKS, strideKeyboard());
  });

  bot.command('ask', async (ctx) => {
    const q = (ctx.message.text || '').replace(/^\/ask(@\w+)?\s*/i, '').trim();
    if (!q) {
      await ctx.reply('Usage: /ask your question', mainMenuKeyboard(ctx));
      return;
    }
    await ctx.sendChatAction('typing');
    await ctx.reply(await generateReply(q, ctx), afterReplyKeyboard(ctx));
  });

  // menus
  bot.action('menu_home', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply(numberedMainMenuText(), mainMenuKeyboard(ctx));
  });

  bot.action('menu_ask', async (ctx) => {
    await ctx.answerCbQuery();
    pendingTool.delete(String(ctx.from.id));
    await ctx.reply('AI MENU — type your question now (Sinhala or English).');
  });

  bot.action('menu_tools', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply('TOOLS MENU', toolsKeyboard());
  });

  bot.action('menu_social', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply(LINKS, mainMenuKeyboard(ctx));
  });

  bot.action('menu_status', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      await ctx.reply(statusText(ctx), mainMenuKeyboard(ctx));
    } catch {
      try {
        await ctx.answerCbQuery('Error');
        await ctx.reply('Status failed. Try /status');
      } catch (_) {}
    }
  });

  bot.action('menu_stride_panel', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply(STRIDE_LINKS, strideKeyboard());
  });

  bot.action('stride_summary', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.sendChatAction('typing');
    const out = await generateReply(
      'In 5 short lines, explain what StrideClub is (running club platform: log runs, leaderboard, events, AI coach) and why a runner should open the live link.',
      ctx
    );
    await ctx.reply(out, strideKeyboard());
  });

  bot.action('menu_help', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply(
      `GROUP HELP\n` +
        `• In groups: mention @${ctx.botInfo?.username || 'PasiyaMaxQueen_bot'} + question\n` +
        `• Or reply to my messages\n` +
        `• Full tools work best in private chat\n` +
        `• /menu — open this menu again`,
      mainMenuKeyboard(ctx)
    );
  });

  bot.action('menu_id', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply(
      `ID: ${ctx.from.id}\nAdmin: ${isAdmin(ctx) ? 'YES' : 'NO'}`,
      mainMenuKeyboard(ctx)
    );
  });

  bot.action('menu_admin', async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    await ctx.answerCbQuery();
    await ctx.reply(`Founder Admin Panel\nID: ${ctx.from.id}`, adminKeyboard());
  });

  // admin
  bot.action('admin_health', async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    await ctx.answerCbQuery();
    await ctx.reply(
      `Health\nToken: ${BOT_TOKEN ? 'set' : 'MISSING'}\nGemini: ${GEMINI_KEY ? 'set' : 'MISSING'}\nGitHub: ${GITHUB_TOKEN ? 'set' : 'no'}\nUptime: ${uptimeText()}\nPending modes: ${pendingTool.size}`,
      adminKeyboard()
    );
  });

  bot.action('admin_whoami', async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    await ctx.answerCbQuery();
    await ctx.reply(
      `Founder\nName: ${ctx.from.first_name || ''} ${ctx.from.last_name || ''}\n@${ctx.from.username || 'none'}\nID: ${ctx.from.id}\nADMIN match: YES`,
      adminKeyboard()
    );
  });

  bot.action('admin_clear', async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    await ctx.answerCbQuery();
    pendingTool.clear();
    await ctx.reply('Cleared in-memory tool modes on this instance.', adminKeyboard());
  });

  bot.action('admin_model', async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    await ctx.answerCbQuery();
    await ctx.reply(
      `Model\nLast: ${resolvedModel || 'none'}\nCandidates:\n${MODELS.map((m) => `- ${m}`).join('\n')}`,
      adminKeyboard()
    );
  });

  bot.action('admin_links', async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    await ctx.answerCbQuery();
    await ctx.reply(LINKS, adminKeyboard());
  });

  bot.action('admin_github', async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    await ctx.answerCbQuery();
    await ctx.sendChatAction('typing');
    await ctx.reply(await fetchGitHubStatus(), adminKeyboard());
  });

  // tools
  const setTool = (mode, prompt) => async (ctx) => {
    await ctx.answerCbQuery();
    pendingTool.set(String(ctx.from.id), mode);
    await ctx.reply(prompt);
  };

  bot.action('tool_translate', setTool('translate', 'Translate mode — send text.'));
  bot.action('tool_summarize', setTool('summarize', 'Summarize mode — send long text.'));
  bot.action('tool_rewrite', setTool('rewrite', 'Rewrite mode — send text.'));
  bot.action('tool_caption', setTool('caption', 'Caption gen — send your idea / scene.'));
  bot.action('tool_hashtags', setTool('hashtags', 'Hashtags — send topic.'));
  bot.action('tool_bio', setTool('bio', 'Bio writer — send short brief about you/brand.'));
  bot.action('tool_ideas', setTool('ideas', 'Ideas — send a theme.'));
  bot.action(
    'tool_photo_caption',
    setTool('photo_caption', 'Photo caption mode — now send a photo (optional caption text).')
  );

  bot.action('tool_run_tip', async (ctx) => {
    await ctx.answerCbQuery();
    pendingTool.delete(String(ctx.from.id));
    await ctx.sendChatAction('typing');
    const tip = await generateReply(
      'Give one practical running tip for today (max 6 lines). Sri Lankan amateur runner context OK.',
      ctx
    );
    await ctx.reply(tip, toolsKeyboard());
  });

  bot.on('photo', async (ctx) => {
    try {
      await handlePhoto(ctx);
    } catch (err) {
      console.error('photo', err);
      await ctx.reply('Photo analysis failed. Try a smaller image.', afterReplyKeyboard(ctx));
    }
  });

  // New members welcome handler
  bot.on('new_chat_members', async (ctx) => {
    try {
      const chatId = String(ctx.chat.id);
      const settings = groupSettings.get(chatId) || {};
      const welcome =
        settings.welcome ||
        groupSettings.get('welcome_default')?.welcome ||
        `Welcome to ${ctx.chat.title || 'the group'}! Use /menu in private chat with the bot for tools.`;

      const members = ctx.message.new_chat_members || [];
      for (const user of members) {
        if (user.is_bot) continue;
        const name = user.first_name || 'friend';
        await ctx.reply(`${welcome}\n\nHi, ${name}!`);
      }
    } catch (err) {
      console.error('welcome handler', err);
    }
  });

  bot.on('text', async (ctx) => {
    const text = (ctx.message.text || '').trim();
    if (!text || text.startsWith('/')) return;

    // Anti-link moderation (groups only)
    if (ctx.chat?.type === 'group' || ctx.chat?.type === 'supergroup') {
      const gKey = String(ctx.chat.id);
      const settings = groupSettings.get(gKey);
      if (settings?.antiLink && hasLink(text)) {
        try {
          const member = await ctx.telegram.getChatMember(ctx.chat.id, ctx.from.id);
          const isAdm = member.status === 'administrator' || member.status === 'creator';
          if (!isAdm) {
            await ctx.deleteMessage(ctx.message.message_id);
            await ctx.reply('Links are not allowed in this group (Anti-link ON).', {
              reply_parameters: undefined,
            });
            return;
          }
        } catch (err) {
          console.error('anti-link', err);
        }
      }
    }

    // Groups: only when @mentioned or reply-to-bot (saves quota)
    if (ctx.chat?.type === 'group' || ctx.chat?.type === 'supergroup') {
      const botInfo = ctx.botInfo || {};
      const uname = botInfo.username ? `@${botInfo.username}`.toLowerCase() : '';
      const mentioned = uname && text.toLowerCase().includes(uname);
      const isReplyToBot =
        Boolean(ctx.message.reply_to_message?.from?.id) &&
        ctx.message.reply_to_message.from.id === botInfo.id;
      if (!mentioned && !isReplyToBot) return;
    }

    const uid = String(ctx.from.id);
    const mode = pendingTool.get(uid);

    // Numbered main menu (1-9)
    if (/^[1-9]$/.test(text) && !mode) {
      if (text === '1') {
        if (isAdmin(ctx)) {
          pendingTool.set(uid, 'owner_menu');
          await ctx.reply(ownerMenuText());
        } else {
          await ctx.reply('Owner menu is founder-only. Use /id to see your Telegram id.');
        }
        return;
      }
      if (text === '2') {
        await ctx.reply(LINKS, mainMenuKeyboard(ctx));
        return;
      }
      if (text === '3') {
        pendingTool.delete(uid);
        await ctx.reply('AI MENU — type your question now (Sinhala or English).');
        return;
      }
      if (text === '4') {
        pendingTool.set(uid, 'group_lab');
        await ctx.reply(
          `GROUP ADMIN LAB (Run inside group)\n\n` +
          `1 Group info\n` +
          `2 Set welcome text\n` +
          `3 Lock group\n` +
          `4 Unlock group\n` +
          `5 Anti-link ON\n` +
          `6 Anti-link OFF\n` +
          `7 Mention admins\n` +
          `0 Back`
        );
        return;
      }
      if (text === '5') {
        await ctx.reply('TOOLS MENU', toolsKeyboard());
        return;
      }
      if (text === '6') {
        pendingTool.set(uid, 'edu_lab');
        await ctx.reply(
          `EDUCATION LAB\n\n` +
          `1 Daily running tip\n2 5K pacing\n3 Beginner week\n4 Warm-up / cool-down\n5 Injury basics\n0 Back`
        );
        return;
      }
      if (text === '7') {
        await ctx.reply(LINKS, mainMenuKeyboard(ctx));
        return;
      }
      if (text === '8') {
        await ctx.reply(`STRIDECLUB HUB\nhttps://strideclub-platform-6b71a.containers.snapdeploy.app`, strideKeyboard());
        return;
      }
      if (text === '9') {
        await ctx.reply(statusText(ctx), mainMenuKeyboard(ctx));
        return;
      }
    }

    // Handle submenu navigation back / 0
    if (text === '0' || text.toLowerCase() === 'back') {
      pendingTool.delete(uid);
      await ctx.reply(numberedMainMenuText(), mainMenuKeyboard(ctx));
      return;
    }

    if (mode === 'edu_lab') {
      if (text === '0') {
        pendingTool.delete(uid);
        await ctx.reply(numberedMainMenuText(), mainMenuKeyboard(ctx));
        return;
      }

      const eduPrompts = {
        '1':
          'Give ONE practical daily running tip for an amateur runner (max 8 short lines). Clear and actionable. Sinhala or English matching the user if possible; default English is OK.',
        '2':
          'Explain a simple 5K race pacing strategy for a beginner-intermediate runner (max 10 lines). Include easy splits idea. No medical claims.',
        '3':
          'Create a simple 7-day beginner running week plan (max 12 lines). Include rest. Distances conservative. No medical claims.',
        '4':
          'Give a practical warm-up and cool-down routine before/after an easy run (max 10 lines). Simple exercises only.',
        '5':
          'Share basic injury-prevention habits for runners (shoes, rest, surface, listening to pain). Max 10 lines. Not medical advice — say see a professional if pain persists.',
      };

      const prompt = eduPrompts[text];
      if (!prompt) {
        await ctx.reply(
          'Education Lab — reply with:\n1 Daily tip\n2 5K pacing\n3 Beginner week\n4 Warm-up / cool-down\n5 Injury basics\n0 Back'
        );
        return;
      }

      try {
        await ctx.sendChatAction('typing');
        const out = await generateReply(prompt, ctx);
        await ctx.reply(out, mainMenuKeyboard(ctx));
      } catch (err) {
        console.error('edu_lab', err);
        await ctx.reply('Education Lab failed. Try again in a moment.');
      }
      return;
    }

    if (mode === 'group_lab') {
      if (text === '0') {
        pendingTool.delete(uid);
        await ctx.reply(numberedMainMenuText(), mainMenuKeyboard(ctx));
        return;
      }

      if (text === '2') {
        pendingTool.set(uid, 'group_welcome_set');
        await ctx.reply('Send the WELCOME message text now (one message). It will be stored for groups.');
        return;
      }

      if (!(await ensureGroupAdmin(ctx))) return;
      if (!(await isUserGroupAdmin(ctx))) {
        await ctx.reply('Only group admins can use Group Admin Lab actions.');
        return;
      }

      const chatId = ctx.chat.id;

      if (text === '1') {
        try {
          const chat = await ctx.telegram.getChat(chatId);
          const count = await ctx.telegram.getChatMemberCount(chatId);
          await ctx.reply(
            `GROUP INFO\n` +
              `Title: ${chat.title || '-'}\n` +
              `Type: ${chat.type}\n` +
              `Members: ${count}\n` +
              `ID: ${chatId}\n` +
              `Anti-link: ${groupSettings.get(String(chatId))?.antiLink ? 'ON' : 'OFF'}`
          );
        } catch (err) {
          await ctx.reply(`Group info failed: ${String(err?.message || err).slice(0, 120)}`);
        }
        return;
      }

      if (text === '3') {
        try {
          await ctx.telegram.setChatPermissions(chatId, {
            can_send_messages: false,
            can_send_audios: false,
            can_send_documents: false,
            can_send_photos: false,
            can_send_videos: false,
            can_send_video_notes: false,
            can_send_voice_notes: false,
            can_send_polls: false,
            can_send_other_messages: false,
            can_add_web_page_previews: false,
            can_change_info: false,
            can_invite_users: false,
            can_pin_messages: false,
            can_manage_topics: false,
          });
          await ctx.reply('Group LOCKED — members cannot send messages (admins still can).');
        } catch (err) {
          await ctx.reply(`Lock failed: ${String(err?.message || err).slice(0, 150)}. Need permission: Restrict members.`);
        }
        return;
      }

      if (text === '4') {
        try {
          await ctx.telegram.setChatPermissions(chatId, {
            can_send_messages: true,
            can_send_audios: true,
            can_send_documents: true,
            can_send_photos: true,
            can_send_videos: true,
            can_send_video_notes: true,
            can_send_voice_notes: true,
            can_send_polls: true,
            can_send_other_messages: true,
            can_add_web_page_previews: true,
            can_change_info: false,
            can_invite_users: true,
            can_pin_messages: false,
            can_manage_topics: false,
          });
          await ctx.reply('Group UNLOCKED — members can chat again.');
        } catch (err) {
          await ctx.reply(`Unlock failed: ${String(err?.message || err).slice(0, 150)}`);
        }
        return;
      }

      if (text === '5') {
        const cur = groupSettings.get(String(chatId)) || {};
        groupSettings.set(String(chatId), { ...cur, antiLink: true });
        await ctx.reply('Anti-link ON (this instance). Links from non-admins will be deleted.');
        return;
      }

      if (text === '6') {
        const cur = groupSettings.get(String(chatId)) || {};
        groupSettings.set(String(chatId), { ...cur, antiLink: false });
        await ctx.reply('Anti-link OFF.');
        return;
      }

      if (text === '7') {
        try {
          const admins = await ctx.telegram.getChatAdministrators(chatId);
          const mentions = admins
            .filter((a) => !a.user.is_bot)
            .slice(0, 15)
            .map((a) => (a.user.username ? `@${a.user.username}` : a.user.first_name))
            .join(' ');
          await ctx.reply(mentions ? `Admins: ${mentions}` : 'No human admins found.');
        } catch (err) {
          await ctx.reply(`Mention admins failed: ${String(err?.message || err).slice(0, 120)}`);
        }
        return;
      }

      await ctx.reply('Group Lab: use 1–7 or 0 to go back. For lock/unlock, run this inside the group.');
      return;
    }

    if (mode === 'group_welcome_set') {
      pendingTool.delete(uid);
      const msg = text.slice(0, 500);
      if (ctx.chat?.type === 'group' || ctx.chat?.type === 'supergroup') {
        const cur = groupSettings.get(String(ctx.chat.id)) || {};
        groupSettings.set(String(ctx.chat.id), { ...cur, welcome: msg });
        await ctx.reply('Welcome text saved for THIS group.');
      } else {
        groupSettings.set('welcome_default', { welcome: msg });
        await ctx.reply('Welcome text saved as default (this server instance).');
      }
      return;
    }

    await ctx.sendChatAction('typing');

    if (mode && mode !== 'photo_caption') {
      pendingTool.delete(uid);
      const out = await generateReply(toolPrompt(mode, text), ctx);
      await ctx.reply(out, afterReplyKeyboard(ctx));
      return;
    }

    await ctx.reply(await generateReply(text, ctx), afterReplyKeyboard(ctx));
  });

  bot.catch((err) => console.error('telegram bot error', err));
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
            allowed_updates: ['message', 'callback_query', 'chat_member', 'my_chat_member', 'chat_join_request'],
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
        hasGitHub: Boolean(GITHUB_TOKEN),
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
 
