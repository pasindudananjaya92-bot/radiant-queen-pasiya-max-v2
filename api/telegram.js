import { Telegraf, Markup } from 'telegraf';
import { GoogleGenAI } from '@google/genai';
import { createClient } from '@supabase/supabase-js';

const BOT_TOKEN = process.env.BOT_TOKEN || '';
const ADMIN_ID = String(process.env.ADMIN_ID || '').trim();
const GEMINI_KEY = process.env.GEMINI_API_KEY || '';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const GITHUB_REPO = process.env.GITHUB_REPO || 'pasindudananjaya92-bot/radiant-queen-pasiya-max-v2';

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabase =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null;

const MODELS = [
  'gemini-2.5-flash',
  'gemini-2.5-pro',
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
const rateMap = new Map(); // memory fallback for rate limit
const RATE_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_MAX_HITS = 8; // max AI calls per user per window

function toChatId(chatId) {
  const n = Number(chatId);
  return Number.isFinite(n) ? n : chatId;
}

const STRIDE_BASE =
  process.env.STRIDE_API_BASE ||
  'https://strideclub-platform-6b71a.containers.snapdeploy.app';

function xpLevel(xp) {
  const x = Math.max(0, xp || 0);
  const level = Math.floor(Math.sqrt(x / 10)) + 1;
  const nextAt = 10 * level * level;
  return { level, nextAt, xp: x };
}

async function addRunXp(user, delta, chatId, reason, opts = {}) {
  if (!supabase) return { ok: false, error: 'No Supabase' };
  const userId = Number(user.id);
  let prev = null;
  {
    const q1 = await supabase
      .from('rq_run_xp')
      .select('xp, runs_logged, streak, last_logrun_date')
      .eq('user_id', userId)
      .maybeSingle();
    if (q1.error) {
      const q0 = await supabase
        .from('rq_run_xp')
        .select('xp, runs_logged')
        .eq('user_id', userId)
        .maybeSingle();
      if (q0.error) return { ok: false, error: q0.error.message };
      prev = q0.data;
    } else {
      prev = q1.data;
    }
  }

  const xp = (prev?.xp || 0) + delta;
  const runs = (prev?.runs_logged || 0) + (delta > 0 ? 1 : 0);

  let streak = prev?.streak || 0;
  let lastDate = prev?.last_logrun_date || null;
  const today = new Date().toISOString().slice(0, 10);

  if (opts.updateStreak && delta > 0) {
    if (lastDate === today) {
      // same day — keep streak, still allow XP
    } else {
      const y = new Date();
      y.setUTCDate(y.getUTCDate() - 1);
      const yesterday = y.toISOString().slice(0, 10);
      if (lastDate === yesterday) streak = (streak || 0) + 1;
      else streak = 1;
      lastDate = today;
    }
  }

  const row = {
    user_id: userId,
    username: user.username || user.first_name || String(userId),
    xp,
    runs_logged: runs,
    updated_at: new Date().toISOString(),
  };
  if (opts.updateStreak) {
    row.streak = streak;
    row.last_logrun_date = lastDate;
  }

  let { error } = await supabase.from('rq_run_xp').upsert(row);
  if (error && opts.updateStreak) {
    // retry without streak columns if migration partial
    const basic = {
      user_id: row.user_id,
      username: row.username,
      xp: row.xp,
      runs_logged: row.runs_logged,
      updated_at: row.updated_at,
    };
    const r2 = await supabase.from('rq_run_xp').upsert(basic);
    error = r2.error;
  }
  if (error) return { ok: false, error: error.message };

  await supabase.from('rq_run_xp_log').insert({
    user_id: userId,
    chat_id: chatId ? toChatId(chatId) : null,
    delta,
    reason: (reason || '').slice(0, 120),
  });

  return {
    ok: true,
    xp,
    runs,
    streak: opts.updateStreak ? streak : prev?.streak || 0,
    ...xpLevel(xp),
  };
}

async function fetchStrideJson(path) {
  try {
    const r = await fetch(`${STRIDE_BASE}${path}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(12000),
    });
    const text = await r.text();
    if (!r.ok || text.trim().startsWith('<')) {
      return { ok: false, error: `HTTP ${r.status} (sleep or HTML)` };
    }
    return { ok: true, data: JSON.parse(text) };
  } catch (e) {
    return { ok: false, error: String(e?.message || e).slice(0, 120) };
  }
}


async function checkRateLimit(userId) {
  const id = String(userId);
  const now = Date.now();

  if (!supabase) {
    const row = rateMap.get(id) || { windowStart: now, hits: 0 };
    if (now - row.windowStart > RATE_WINDOW_MS) {
      row.windowStart = now;
      row.hits = 0;
    }
    row.hits += 1;
    rateMap.set(id, row);
    if (row.hits > RATE_MAX_HITS) {
      return {
        ok: false,
        waitSec: Math.ceil((RATE_WINDOW_MS - (now - row.windowStart)) / 1000),
      };
    }
    return { ok: true };
  }

  const { data } = await supabase
    .from('rq_rate_limits')
    .select('window_start, hit_count')
    .eq('user_id', id)
    .maybeSingle();

  let windowStart = data?.window_start ? new Date(data.window_start).getTime() : now;
  let hits = data?.hit_count || 0;

  if (now - windowStart > RATE_WINDOW_MS) {
    windowStart = now;
    hits = 0;
  }
  hits += 1;

  await supabase.from('rq_rate_limits').upsert({
    user_id: id,
    window_start: new Date(windowStart).toISOString(),
    hit_count: hits,
  });

  if (hits > RATE_MAX_HITS) {
    return {
      ok: false,
      waitSec: Math.ceil((RATE_WINDOW_MS - (now - windowStart)) / 1000),
    };
  }
  return { ok: true };
}

async function loadGroupSettings(chatId) {
  const key = String(chatId);
  if (groupSettings.has(key)) return groupSettings.get(key);
  if (!supabase) return {};

  const { data, error } = await supabase
    .from('group_settings')
    .select('welcome, rate_limit_enabled, group_mode, anti_link, rules_text')
    .eq('chat_id', toChatId(chatId))
    .maybeSingle();

  if (error) {
    console.error('loadGroupSettings', error.message);
    return {};
  }

  const row = {
    welcome: data?.welcome || '',
    antiLink:
      Boolean(data?.anti_link) ||
      data?.group_mode === 'antilink' ||
      data?.group_mode === 'anti_link',
    rateLimit: Boolean(data?.rate_limit_enabled),
    groupMode: data?.group_mode || '',
    rulesText: data?.rules_text || '',
  };
  groupSettings.set(key, row);
  return row;
}

async function saveGroupSettings(chatId, patch) {
  const key = String(chatId);
  const prev = (await loadGroupSettings(chatId)) || {};
  const antiLink =
    patch.antiLink !== undefined ? patch.antiLink : Boolean(prev.antiLink);
  const next = {
    welcome: patch.welcome !== undefined ? patch.welcome : prev.welcome || '',
    antiLink,
    rateLimit:
      patch.rateLimit !== undefined ? patch.rateLimit : Boolean(prev.rateLimit),
    groupMode:
      patch.groupMode !== undefined
        ? patch.groupMode
        : antiLink
          ? 'antilink'
          : prev.groupMode || 'normal',
    rulesText: patch.rulesText !== undefined ? patch.rulesText : prev.rulesText || '',
  };
  groupSettings.set(key, next);

  if (!supabase) {
    return { ok: false, error: 'Supabase env missing on Vercel' };
  }

  const row = {
    chat_id: toChatId(chatId),
    welcome: next.welcome || null,
    group_mode: next.groupMode || (next.antiLink ? 'antilink' : 'normal'),
    rate_limit_enabled: Boolean(next.rateLimit),
    rules_text: next.rulesText || null,
  };

  const { error } = await supabase
    .from('group_settings')
    .upsert(row, { onConflict: 'chat_id' });

  if (error) {
    console.error('saveGroupSettings', error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

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
    `║  VERSION 2.2 | GEMINI AI\n` +
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
    `│  8  CONNECTED PLATFORMS\n` +
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

function platformsPanelText() {
  return (
    `CONNECTED PLATFORMS\n\n` +
    `1  Open Website\n` +
    `2  Open StrideClub\n` +
    `3  Social / Channel links\n` +
    `4  Bot status\n` +
    `5  GitHub status (founder only)\n` +
    `0  Back to main\n\n` +
    `Reply with a number.`
  );
}

function platformsKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.url('Website', 'https://radiant-queen-pasiya-max-v2.vercel.app')],
    [Markup.button.url('StrideClub', 'https://strideclub-platform-6b71a.containers.snapdeploy.app')],
    [Markup.button.url('GitHub', 'https://github.com/pasindudananjaya92-bot/radiant-queen-pasiya-max-v2')],
    [Markup.button.callback('Main menu', 'menu_home')],
  ]);
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
    `RADIANT QUEEN • PASIYA MAX v2.2\n` +
    `Token: ${BOT_TOKEN ? 'yes' : 'NO'}\n` +
    `Gemini: ${GEMINI_KEY ? 'yes' : 'NO'}\n` +
    `ADMIN_ID: ${ADMIN_ID ? 'yes' : 'NO'}\n` +
    `GitHub token: ${GITHUB_TOKEN ? 'yes' : 'no'}\n` +
    `Supabase: ${supabase ? 'yes' : 'NO'}\n` +
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

  if (!isAdmin(ctx)) {
    const rate = await checkRateLimit(uid);
    if (!rate.ok) {
      await ctx.reply(`Slow down. Retry in ~${rate.waitSec}s (free-tier protection).`);
      return;
    }
  }

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
        `/setwelcome <text> — set group welcome (Admin)\n` +
        `/setrules <text> — set group rules (Admin)\n` +
        `/rules — read group rules\n` +
        `/groupinfo — group + Supabase settings\n` +
        `/modcheck — check bot admin perms & features\n` +
        `/antilink on|off — link filter (admins)\n` +
        `/warn — warn a user (reply, admins)\n` +
        `/unwarn — remove one warn (reply, admins)\n` +
        `/usage — founder usage snapshot\n` +
        (isAdmin(ctx) ? `/admin — founder panel\n` : '') +
        `\nTools: Translate, Summarize, Rewrite, Caption, Hashtags, Bio, Ideas, Photo caption, Running tip\n` +
        `Send a photo anytime for vision.`,
      mainMenuKeyboard(ctx)
    );
  });

  bot.command('setwelcome', async (ctx) => {
    try {
      if (ctx.chat?.type !== 'group' && ctx.chat?.type !== 'supergroup') {
        await ctx.reply('Use /setwelcome inside a group.\nExample:\n/setwelcome Welcome to our official group!');
        return;
      }
      if (!(await ensureGroupAdmin(ctx))) return;
      if (!(await isUserGroupAdmin(ctx))) {
        await ctx.reply('Only group admins can set welcome.');
        return;
      }

      const raw = (ctx.message.text || '').replace(/^\/setwelcome(@\w+)?\s*/i, '').trim();
      if (!raw) {
        await ctx.reply('Usage:\n/setwelcome Welcome to our official group!');
        return;
      }

      const result = await saveGroupSettings(ctx.chat.id, { welcome: raw.slice(0, 500) });
      await ctx.reply(
        result.ok
          ? `Welcome saved to Supabase for this group.\n\nPreview:\n${raw.slice(0, 200)}`
          : `Save failed: ${result.error}`
      );
    } catch (err) {
      console.error('setwelcome', err);
      await ctx.reply('setwelcome failed.');
    }
  });

  bot.command('setrules', async (ctx) => {
    try {
      if (ctx.chat?.type !== 'group' && ctx.chat?.type !== 'supergroup') {
        await ctx.reply('Use in a group:\n/setrules No spam. Be respectful. No links without admin OK.');
        return;
      }
      if (!(await ensureGroupAdmin(ctx))) return;
      if (!(await isUserGroupAdmin(ctx))) {
        await ctx.reply('Only group admins can set rules.');
        return;
      }
      const raw = (ctx.message.text || '').replace(/^\/setrules(@\w+)?\s*/i, '').trim();
      if (!raw) {
        await ctx.reply('Usage:\n/setrules Your group rules here...');
        return;
      }
      if (!supabase) {
        await ctx.reply('Supabase not connected.');
        return;
      }
      const chatId = toChatId(ctx.chat.id);
      const { error } = await supabase.from('group_settings').upsert(
        {
          chat_id: chatId,
          rules_text: raw.slice(0, 3500),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'chat_id' }
      );
      if (error) {
        const r2 = await supabase.from('group_settings').upsert(
          { chat_id: chatId, rules_text: raw.slice(0, 3500) },
          { onConflict: 'chat_id' }
        );
        if (r2.error) {
          await ctx.reply(`Save failed: ${r2.error.message}`);
          return;
        }
      }
      await ctx.reply('Rules saved. Members can use /rules');
    } catch (err) {
      console.error('setrules', err);
      await ctx.reply('setrules failed.');
    }
  });

  bot.command('rules', async (ctx) => {
    try {
      if (ctx.chat?.type !== 'group' && ctx.chat?.type !== 'supergroup') {
        await ctx.reply('Use /rules inside a group.');
        return;
      }
      if (!supabase) {
        await ctx.reply('Supabase not connected.');
        return;
      }
      const { data } = await supabase
        .from('group_settings')
        .select('rules_text, welcome')
        .eq('chat_id', toChatId(ctx.chat.id))
        .maybeSingle();

      const text =
        (data?.rules_text && data.rules_text.trim()) ||
        'No rules set yet. Admins: /setrules Your rules here';
      await ctx.reply(`GROUP RULES\n\n${text.slice(0, 3500)}`);
    } catch (err) {
      console.error('rules', err);
      await ctx.reply('rules failed.');
    }
  });

  bot.command('groupinfo', async (ctx) => {
    try {
      if (ctx.chat?.type !== 'group' && ctx.chat?.type !== 'supergroup') {
        await ctx.reply('Use /groupinfo inside a group.');
        return;
      }

      const chatId = ctx.chat.id;
      const chat = await ctx.telegram.getChat(chatId);

      let count = '?';
      try {
        count = await ctx.telegram.callApi('getChatMemberCount', {
          chat_id: chatId,
        });
      } catch (e1) {
        try {
          count = await ctx.telegram.callApi('getChatMembersCount', {
            chat_id: chatId,
          });
        } catch (e2) {
          count = 'n/a';
        }
      }

      const settings = await loadGroupSettings(chatId);

      let botAdmin = 'unknown';
      try {
        const me = await ctx.telegram.getChatMember(chatId, ctx.botInfo.id);
        botAdmin = me.status;
      } catch (_) {}

      await ctx.reply(
        `GROUP INFO\n` +
          `Title: ${chat.title || '-'}\n` +
          `Chat ID: ${chatId}\n` +
          `Members: ${count}\n` +
          `Bot status: ${botAdmin}\n` +
          `Anti-link: ${settings.antiLink ? 'ON' : 'OFF'}\n` +
          `Welcome: ${settings.welcome ? settings.welcome.slice(0, 120) : '(not set)'}\n\n` +
          `Commands:\n/setwelcome <text>\n/setrules <text>\n/rules\n/groupinfo\n/antilink on|off`
      );
    } catch (err) {
      console.error('groupinfo', err);
      await ctx.reply(`groupinfo failed: ${String(err?.message || err).slice(0, 160)}`);
    }
  });

  bot.command('modcheck', async (ctx) => {
    try {
      if (ctx.chat?.type !== 'group' && ctx.chat?.type !== 'supergroup') {
        await ctx.reply('Use /modcheck inside a group to check bot configuration & permissions.');
        return;
      }

      const chatId = ctx.chat.id;
      let me;
      try {
        me = await ctx.telegram.getChatMember(chatId, ctx.botInfo.id);
      } catch (err) {
        await ctx.reply('Could not query bot membership.');
        return;
      }

      const isAdm = me.status === 'administrator' || me.status === 'creator';
      const settings = await loadGroupSettings(chatId);

      let statusEmoji = isAdm ? '✅' : '❌';
      let deleteMsg = me.can_delete_messages ? '✅' : '❌';
      let restrictMem = me.can_restrict_members ? '✅' : '❌';
      let inviteMem = me.can_invite_users ? '✅' : '❌';

      await ctx.reply(
        `🛡️ **RADIANT QUEEN MODCHECK** 🛡️\n\n` +
        `• Bot Admin Status: ${statusEmoji} (${me.status})\n` +
        `• Delete Messages: ${deleteMsg}\n` +
        `• Restrict / Ban Members: ${restrictMem}\n` +
        `• Add Users / Invite: ${inviteMem}\n` +
        `• Anti-Link Protection: ${settings.antiLink ? '✅ ON' : '⚠️ OFF'}\n` +
        `• Welcome & Captcha: ${settings.welcome ? '✅ Configured' : '⚠️ Default'}\n` +
        `• Supabase DB Sync: ${supabase ? '✅ Connected' : '❌ Missing'}\n\n` +
        `Tip: Make sure all permissions show ✅ for full automated protection!`
      );
    } catch (err) {
      console.error('modcheck', err);
      await ctx.reply('modcheck failed.');
    }
  });

  bot.command('antilink', async (ctx) => {
    try {
      if (ctx.chat?.type !== 'group' && ctx.chat?.type !== 'supergroup') {
        await ctx.reply(
          'Use inside a group:\n/antilink on\n/antilink off\n/antilink'
        );
        return;
      }
      if (!(await ensureGroupAdmin(ctx))) return;
      if (!(await isUserGroupAdmin(ctx))) {
        await ctx.reply('Only group admins can change anti-link.');
        return;
      }

      const arg = (ctx.message.text || '')
        .replace(/^\/antilink(@\w+)?\s*/i, '')
        .trim()
        .toLowerCase();

      if (!arg) {
        const s = await loadGroupSettings(ctx.chat.id);
        await ctx.reply(
          `Anti-link: ${s.antiLink ? 'ON' : 'OFF'}\n\n/antilink on\n/antilink off`
        );
        return;
      }

      if (arg !== 'on' && arg !== 'off') {
        await ctx.reply('Usage:\n/antilink on\n/antilink off\n/antilink');
        return;
      }

      const on = arg === 'on';
      const result = await saveGroupSettings(ctx.chat.id, {
        antiLink: on,
        groupMode: on ? 'antilink' : 'normal',
      });

      await ctx.reply(
        result.ok
          ? `Anti-link ${on ? 'ON' : 'OFF'} (Supabase).`
          : `Failed: ${result.error}`
      );
    } catch (err) {
      console.error('antilink', err);
      await ctx.reply('antilink failed.');
    }
  });

  bot.command('warn', async (ctx) => {
    try {
      if (ctx.chat?.type !== 'group' && ctx.chat?.type !== 'supergroup') {
        await ctx.reply('Use /warn in a group. Reply to a user message:\n/warn spam');
        return;
      }
      if (!(await ensureGroupAdmin(ctx))) return;
      if (!(await isUserGroupAdmin(ctx))) {
        await ctx.reply('Only group admins can warn.');
        return;
      }

      const target = ctx.message.reply_to_message?.from;
      if (!target || target.is_bot) {
        await ctx.reply('Reply to the user message, then send:\n/warn reason');
        return;
      }

      const reason =
        (ctx.message.text || '').replace(/^\/warn(@\w+)?\s*/i, '').trim() ||
        'No reason';

      const chatId = toChatId(ctx.chat.id);
      const userId = Number(target.id);

      if (!supabase) {
        await ctx.reply('Supabase not connected — cannot store warns.');
        return;
      }

      const { data: prev } = await supabase
        .from('rq_warns')
        .select('warn_count')
        .eq('chat_id', chatId)
        .eq('user_id', userId)
        .maybeSingle();

      const nextCount = (prev?.warn_count || 0) + 1;

      const { error } = await supabase.from('rq_warns').upsert(
        {
          chat_id: chatId,
          user_id: userId,
          warn_count: nextCount,
          last_reason: reason.slice(0, 200),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'chat_id,user_id' }
      );

      if (error) {
        await ctx.reply(`Warn save failed: ${error.message}`);
        return;
      }

      let extra = '';
      if (nextCount >= 3) {
        try {
          const until = Math.floor(Date.now() / 1000) + 60 * 60; // 1 hour
          await ctx.telegram.restrictChatMember(ctx.chat.id, userId, {
            permissions: {
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
            },
            until_date: until,
          });
          extra = '\nAuto-mute: 1 hour (3+ warns).';
        } catch (muteErr) {
          extra =
            '\nAuto-mute failed (bot needs Restrict members): ' +
            String(muteErr?.message || muteErr).slice(0, 80);
        }
      }

      const name = target.username
        ? `@${target.username}`
        : target.first_name || String(userId);

      await ctx.reply(
        `Warning issued.\nUser: ${name}\nCount: ${nextCount}\nReason: ${reason.slice(0, 120)}${extra}`
      );
    } catch (err) {
      console.error('warn', err);
      await ctx.reply('warn failed.');
    }
  });

  bot.command('unwarn', async (ctx) => {
    try {
      if (ctx.chat?.type !== 'group' && ctx.chat?.type !== 'supergroup') {
        await ctx.reply('Use /unwarn in a group. Reply to the user.');
        return;
      }
      if (!(await ensureGroupAdmin(ctx))) return;
      if (!(await isUserGroupAdmin(ctx))) {
        await ctx.reply('Only group admins can unwarn.');
        return;
      }

      const target = ctx.message.reply_to_message?.from;
      if (!target) {
        await ctx.reply('Reply to the user, then send /unwarn');
        return;
      }

      const chatId = toChatId(ctx.chat.id);
      const userId = Number(target.id);

      if (!supabase) {
        await ctx.reply('Supabase not connected.');
        return;
      }

      const { data: prev } = await supabase
        .from('rq_warns')
        .select('warn_count')
        .eq('chat_id', chatId)
        .eq('user_id', userId)
        .maybeSingle();

      const nextCount = Math.max(0, (prev?.warn_count || 0) - 1);

      await supabase.from('rq_warns').upsert(
        {
          chat_id: chatId,
          user_id: userId,
          warn_count: nextCount,
          last_reason: 'unwarn',
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'chat_id,user_id' }
      );

      try {
        await ctx.telegram.restrictChatMember(ctx.chat.id, userId, {
          permissions: {
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
          },
        });
      } catch (_) {}

      const name = target.username
        ? `@${target.username}`
        : target.first_name || String(userId);

      await ctx.reply(
        `Unwarn: ${name}\nWarn count now: ${nextCount}\nUnmuted if restricted.`
      );
    } catch (err) {
      console.error('unwarn', err);
      await ctx.reply('unwarn failed.');
    }
  });

  bot.command('usage', async (ctx) => {
    try {
      if (!isAdmin(ctx)) {
        await ctx.reply('Founder only.');
        return;
      }

      if (!supabase) {
        await ctx.reply('Supabase not connected.');
        return;
      }

      const { count: groupCount, error: gErr } = await supabase
        .from('group_settings')
        .select('*', { count: 'exact', head: true });

      const { data: rates, error: rErr } = await supabase
        .from('rq_rate_limits')
        .select('user_id, hit_count, window_start')
        .order('hit_count', { ascending: false })
        .limit(5);

      if (gErr) console.error(gErr);
      if (rErr) console.error(rErr);

      const top =
        (rates || [])
          .map((r, i) => `${i + 1}. ${r.user_id} — ${r.hit_count} hits`)
          .join('\n') || '(no rate rows yet)';

      await ctx.reply(
        `FOUNDER USAGE SNAPSHOT\n` +
          `Groups configured: ${groupCount ?? 0}\n` +
          `Supabase: yes\n` +
          `Uptime (this instance): ${Math.round((Date.now() - bootTime) / 1000)}s\n\n` +
          `Top rate rows:\n${top}`
      );
    } catch (err) {
      console.error('usage', err);
      await ctx.reply(`usage failed: ${String(err?.message || err).slice(0, 120)}`);
    }
  });


  bot.command('runxp', async (ctx) => {
    try {
      if (!supabase) {
        await ctx.reply('Supabase not connected.');
        return;
      }

      const arg = (ctx.message.text || '')
        .replace(/^\/runxp(@\w+)?\s*/i, '')
        .trim();

      // Admin award: reply + /runxp 5
      if (arg && /^-?\d+$/.test(arg) && ctx.message.reply_to_message?.from) {
        if (!(await isUserGroupAdmin(ctx)) && !isAdmin(ctx)) {
          await ctx.reply('Only admins can award XP.');
          return;
        }
        const delta = Math.max(-50, Math.min(50, parseInt(arg, 10)));
        const target = ctx.message.reply_to_message.from;
        const res = await addRunXp(
          target,
          delta,
          ctx.chat?.id,
          `admin award by ${ctx.from.id}`
        );
        if (!res.ok) {
          await ctx.reply(`XP failed: ${res.error}`);
          return;
        }
        await ctx.reply(
          `XP ${delta >= 0 ? '+' : ''}${delta} → ${target.first_name || target.id}\n` +
            `Total XP: ${res.xp} | Level ${res.level} | Runs: ${res.runs}`
        );
        return;
      }

      const userId = Number(ctx.from.id);
      const { data } = await supabase
        .from('rq_run_xp')
        .select('xp, runs_logged, username')
        .eq('user_id', userId)
        .maybeSingle();

      const xp = data?.xp || 0;
      const runs = data?.runs_logged || 0;
      const lv = xpLevel(xp);

      await ctx.reply(
        `RUNNER XP\n` +
          `Name: ${data?.username || ctx.from.first_name}\n` +
          `XP: ${lv.xp}\n` +
          `Level: ${lv.level}\n` +
          `Next level at: ${lv.nextAt} XP\n` +
          `Honor runs logged: ${runs}\n\n` +
          `Admins: reply to user → /runxp 5\n` +
          `Top: /xptop\n` +
          `StrideClub: /stride`
      );
    } catch (err) {
      console.error('runxp', err);
      await ctx.reply('runxp failed.');
    }
  });

  bot.command('xptop', async (ctx) => {
    try {
      if (!supabase) {
        await ctx.reply('Supabase not connected.');
        return;
      }
      const { data, error } = await supabase
        .from('rq_run_xp')
        .select('username, xp, runs_logged')
        .order('xp', { ascending: false })
        .limit(10);
      if (error) {
        await ctx.reply(`xptop failed: ${error.message}`);
        return;
      }
      const lines = (data || [])
        .map(
          (r, i) =>
            `${i + 1}. ${r.username || 'runner'} — ${r.xp} XP (L${xpLevel(r.xp).level})`
        )
        .join('\n');
      await ctx.reply(`RUNNER XP TOP 10\n\n${lines || '(empty)'}`);
    } catch (err) {
      console.error('xptop', err);
      await ctx.reply('xptop failed.');
    }
  });

  bot.command('stride', async (ctx) => {
    try {
      const arg = (ctx.message.text || '')
        .replace(/^\/stride(@\w+)?\s*/i, '')
        .trim()
        .toLowerCase();

      if (arg === 'agents' || arg === 'agent') {
        await ctx.reply(
          `STRIDECLUB + TELEGRAM = 6 AGENTS\n\n` +
            `Web agents (StrideClub site):\n` +
            `1) Pasiya AI Coach — training plans\n` +
            `2) Community Moderator — spam scan\n` +
            `3) Events & Reminders — group runs\n` +
            `4) Data Sync — activities\n` +
            `5) Social Poster — captions / posts\n\n` +
            `6) Telegram Bridge (this bot)\n` +
            `   /runxp /xptop /dailytip /modcheck\n` +
            `   /warn /antilink /setwelcome\n\n` +
            `Open hub:\n${STRIDE_BASE}\n\n` +
            `/stride — live health + leaderboard`
        );
        return;
      }

      await ctx.sendChatAction('typing');
      const health = await fetchStrideJson('/api/health');
      const board = await fetchStrideJson('/api/leaderboard');

      let msg = `STRIDECLUB BRIDGE (Agent 6 — Telegram)\nBase: ${STRIDE_BASE}\n\n`;

      if (health.ok) {
        msg += `Health: OK\n`;
        if (health.data?.ok !== undefined) msg += `ok: ${health.data.ok}\n`;
      } else {
        msg += `Health: offline/sleep — ${health.error}\nOpen site to wake.\n`;
      }

      if (board.ok && board.data) {
        const rows = board.data.leaderboard || board.data.runners || board.data;
        if (Array.isArray(rows) && rows.length) {
          msg += `\nLeaderboard (top):\n`;
          rows.slice(0, 5).forEach((r, i) => {
            const name = r.displayName || r.name || r.user_name || r.uid || 'runner';
            const km = r.totalKm ?? r.distanceKm ?? r.total_distance ?? '?';
            msg += `${i + 1}. ${name} — ${km} km\n`;
          });
        } else {
          msg += `\nLeaderboard: loaded (format varies)\n`;
        }
      } else {
        msg += `\nLeaderboard: ${board.error || 'unavailable'}\n`;
      }

      msg += `\nSite: ${STRIDE_BASE}\nAgents: /stride agents\nXP: /runxp | /xptop | /logrun`;
      await ctx.reply(msg.slice(0, 3500));
    } catch (err) {
      console.error('stride', err);
      await ctx.reply('stride bridge failed.');
    }
  });

  bot.command('dailytip', async (ctx) => {
    try {
      await ctx.sendChatAction('typing');
      const out = await generateReply(
        'Give ONE practical running tip for club amateurs (max 6 short lines). Actionable. No medical claims.',
        ctx
      );
      await ctx.reply(`DAILY RUNNING TIP\n\n${out}`);
    } catch (err) {
      console.error('dailytip', err);
      await ctx.reply('dailytip failed.');
    }
  });



  bot.command('logrun', async (ctx) => {
    try {
      if (!supabase) {
        await ctx.reply('Supabase not connected.');
        return;
      }

      const uid = String(ctx.from.id);
      if (!isAdmin(ctx)) {
        const rate = await checkRateLimit(uid);
        if (!rate.ok) {
          await ctx.reply(`Slow down. Retry in ~${rate.waitSec}s.`);
          return;
        }
      }

      const note = (ctx.message.text || '')
        .replace(/^\/logrun(@\w+)?\s*/i, '')
        .trim()
        .slice(0, 80);

      const res = await addRunXp(
        ctx.from,
        3,
        ctx.chat?.id,
        note ? `logrun: ${note}` : 'logrun self',
        { updateStreak: true }
      );

      if (!res.ok) {
        await ctx.reply(`logrun failed: ${res.error}`);
        return;
      }

      const streakNow = res.streak || 0;
      let milestone = '';
      if ([3, 7, 14, 30, 60, 100].includes(streakNow)) {
        milestone =
          `\n\nMILESTONE 🔥 ${streakNow}-day streak!\n` +
          `Keep showing up. Club sees this energy.`;
      }

      await ctx.reply(
        `RUN LOGGED (+3 XP)\n` +
          `XP: ${res.xp} | Level ${res.level}\n` +
          `Streak: ${streakNow} day(s)\n` +
          `Honor runs: ${res.runs}\n` +
          (note ? `Note: ${note}\n` : '') +
          `Top: /xptop | Streak: /streak | Bridge: /stride` +
          milestone
      );

      // optional group energy (Bot API setMessageReaction — safe fallback)


      // optional group energy (Bot API setMessageReaction — safe fallback)
      if (ctx.chat?.type === 'group' || ctx.chat?.type === 'supergroup') {
        try {
          await ctx.telegram.callApi('setMessageReaction', {
            chat_id: ctx.chat.id,
            message_id: ctx.message.message_id,
            reaction: [{ type: 'emoji', emoji: '🔥' }],
          });
        } catch (_) {}
      }
    } catch (err) {
      console.error('logrun', err);
      await ctx.reply('logrun failed.');
    }
  });


  bot.command('broadcast', async (ctx) => {
    try {
      if (!isAdmin(ctx)) {
        await ctx.reply('Founder only.');
        return;
      }
      if (!supabase) {
        await ctx.reply('Supabase not connected.');
        return;
      }

      const text = (ctx.message.text || '')
        .replace(/^\/broadcast(@\w+)?\s*/i, '')
        .trim();
      if (!text) {
        await ctx.reply('Usage:\n/broadcast Your message to all configured groups');
        return;
      }

      const { data: groups, error } = await supabase
        .from('group_settings')
        .select('chat_id')
        .limit(50);

      if (error) {
        await ctx.reply(`broadcast failed: ${error.message}`);
        return;
      }

      const ids = (groups || []).map((g) => g.chat_id).filter(Boolean);
      if (!ids.length) {
        await ctx.reply('No groups in group_settings yet.');
        return;
      }

      let ok = 0;
      let fail = 0;
      for (const id of ids) {
        try {
          await ctx.telegram.sendMessage(
            id,
            `ANNOUNCEMENT\n\n${text.slice(0, 3000)}`
          );
          ok += 1;
        } catch {
          fail += 1;
        }
      }

      await ctx.reply(`Broadcast done.\nSent: ${ok}\nFailed: ${fail}\nTargets: ${ids.length}`);
    } catch (err) {
      console.error('broadcast', err);
      await ctx.reply('broadcast failed.');
    }
  });



  bot.command('streak', async (ctx) => {
    try {
      if (!supabase) {
        await ctx.reply('Supabase not connected.');
        return;
      }
      const userId = Number(ctx.from.id);
      const { data } = await supabase
        .from('rq_run_xp')
        .select('xp, streak, last_logrun_date, runs_logged, username, stride_name')
        .eq('user_id', userId)
        .maybeSingle();

      const xp = data?.xp || 0;
      const lv = xpLevel(xp);
      await ctx.reply(
        `STREAK\n` +
          `Name: ${data?.username || ctx.from.first_name}\n` +
          `Streak: ${data?.streak || 0} day(s)\n` +
          `Last logrun: ${data?.last_logrun_date || 'never'}\n` +
          `XP: ${lv.xp} | Level ${lv.level}\n` +
          `Honor runs: ${data?.runs_logged || 0}\n\n` +
          `Keep it going: /logrun`
      );
    } catch (err) {
      console.error('streak', err);
      await ctx.reply('streak failed.');
    }
  });

  bot.command('weekly', async (ctx) => {
    try {
      if (!supabase) {
        await ctx.reply('Supabase not connected.');
        return;
      }
      const { data, error } = await supabase
        .from('rq_run_xp')
        .select('user_id, username, xp, streak, runs_logged')
        .order('xp', { ascending: false })
        .limit(50);
      if (error) {
        await ctx.reply(`weekly failed: ${error.message}`);
        return;
      }
      const rows = data || [];
      const top = rows.slice(0, 5)
        .map((r, i) => `${i + 1}. ${r.username || r.user_id} — ${r.xp} XP (🔥${r.streak || 0})`)
        .join('\n');

      const me = rows.findIndex((r) => Number(r.user_id) === Number(ctx.from.id));
      const rankLine =
        me >= 0
          ? `Your rank: #${me + 1} — ${rows[me].xp} XP`
          : 'Your rank: not ranked yet (/logrun)';

      await ctx.reply(
        `WEEKLY CLUB BOARD\n\nTop 5:\n${top || '(empty)'}\n\n${rankLine}\n\n/xptop | /logrun | /streak`
      );
    } catch (err) {
      console.error('weekly', err);
      await ctx.reply('weekly failed.');
    }
  });

  bot.command('agentpulse', async (ctx) => {
    try {
      if (!isAdmin(ctx)) {
        await ctx.reply('Founder only.');
        return;
      }
      await ctx.sendChatAction('typing');
      const health = await fetchStrideJson('/api/health');

      let groupCount = '?';
      let xpUsers = '?';
      if (supabase) {
        const g = await supabase.from('group_settings').select('*', { count: 'exact', head: true });
        const x = await supabase.from('rq_run_xp').select('*', { count: 'exact', head: true });
        groupCount = g.count ?? 0;
        xpUsers = x.count ?? 0;
      }

      await ctx.reply(
        `AGENT PULSE (Founder)\n\n` +
          `Bot\n` +
          `• Token: ${BOT_TOKEN ? 'yes' : 'no'}\n` +
          `• Gemini: ${GEMINI_KEY ? 'yes' : 'no'}\n` +
          `• Supabase: ${supabase ? 'yes' : 'no'}\n` +
          `• Uptime: ${Math.round((Date.now() - bootTime) / 1000)}s\n\n` +
          `Data\n` +
          `• Groups configured: ${groupCount}\n` +
          `• XP runners: ${xpUsers}\n\n` +
          `StrideClub\n` +
          `• Base: ${STRIDE_BASE}\n` +
          `• Health: ${health.ok ? 'OK' : 'offline — ' + (health.error || '')}\n\n` +
          `Agents: /stride agents`
      );
    } catch (err) {
      console.error('agentpulse', err);
      await ctx.reply('agentpulse failed.');
    }
  });



  bot.command('linkstride', async (ctx) => {
    try {
      if (!supabase) {
        await ctx.reply('Supabase not connected.');
        return;
      }
      const name = (ctx.message.text || '')
        .replace(/^\/linkstride(@\w+)?\s*/i, '')
        .trim()
        .slice(0, 40);
      if (!name) {
        await ctx.reply(
          'Link your StrideClub display name:\n' +
            '/linkstride YourName\n\n' +
            'Example:\n/linkstride Pasiya Max'
        );
        return;
      }

      const userId = Number(ctx.from.id);
      const { data: prev } = await supabase
        .from('rq_run_xp')
        .select('xp, runs_logged, streak')
        .eq('user_id', userId)
        .maybeSingle();

      const { error } = await supabase.from('rq_run_xp').upsert({
        user_id: userId,
        username: ctx.from.username || ctx.from.first_name || String(userId),
        stride_name: name,
        xp: prev?.xp || 0,
        runs_logged: prev?.runs_logged || 0,
        streak: prev?.streak || 0,
        updated_at: new Date().toISOString(),
      });

      if (error) {
        await ctx.reply(`linkstride failed: ${error.message}`);
        return;
      }

      await ctx.reply(
        `Stride name linked: ${name}\n` +
          `Telegram XP: /runxp\n` +
          `Club site: ${STRIDE_BASE}`
      );
    } catch (err) {
      console.error('linkstride', err);
      await ctx.reply('linkstride failed.');
    }
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
    const uid = String(ctx.from.id);
    if (!isAdmin(ctx)) {
      const rate = await checkRateLimit(uid);
      if (!rate.ok) {
        await ctx.reply(`Slow down a bit. Try again in ~${rate.waitSec}s (free-tier protection).`);
        return;
      }
    }

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
    const uid = String(ctx.from.id);
    if (!isAdmin(ctx)) {
      const rate = await checkRateLimit(uid);
      if (!rate.ok) {
        await ctx.answerCbQuery(`Slow down. Retry in ~${rate.waitSec}s`);
        return;
      }
    }
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
      `Health\nToken: ${BOT_TOKEN ? 'set' : 'MISSING'}\nGemini: ${GEMINI_KEY ? 'set' : 'MISSING'}\nGitHub: ${GITHUB_TOKEN ? 'set' : 'no'}\nSupabase: ${supabase ? 'set' : 'MISSING'}\nUptime: ${uptimeText()}\nPending modes: ${pendingTool.size}`,
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
    const uid = String(ctx.from.id);
    if (!isAdmin(ctx)) {
      const rate = await checkRateLimit(uid);
      if (!rate.ok) {
        await ctx.answerCbQuery(`Slow down. Retry in ~${rate.waitSec}s`);
        return;
      }
    }
    pendingTool.delete(uid);
    await ctx.sendChatAction('typing');
    const tip = await generateReply(
      'Give one practical running tip for today (max 6 lines). Sri Lankan amateur runner context OK.',
      ctx
    );
    await ctx.reply(tip, toolsKeyboard());
  });

  bot.action(/^verify_join:(.+):(\d+)$/, async (ctx) => {
    try {
      const chatId = ctx.match[1];
      const userId = Number(ctx.match[2]);

      if (ctx.from.id !== userId) {
        await ctx.answerCbQuery('Only the new member can verify.');
        return;
      }

      await ctx.telegram.restrictChatMember(chatId, userId, {
        permissions: {
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
        },
      });

      if (supabase) {
        await supabase
          .from('rq_pending_joins')
          .delete()
          .eq('chat_id', toChatId(chatId))
          .eq('user_id', userId);
      }

      await ctx.answerCbQuery('Verified!');
      await ctx.reply(`Verified: ${ctx.from.first_name || 'member'} can chat now. /rules`);
    } catch (err) {
      console.error('verify_join', err);
      try {
        await ctx.answerCbQuery('Verify failed — bot needs Restrict members');
      } catch (_) {}
    }
  });

  bot.on('photo', async (ctx) => {
    try {
      await handlePhoto(ctx);
    } catch (err) {
      console.error('photo', err);
      await ctx.reply('Photo analysis failed. Try a smaller image.', afterReplyKeyboard(ctx));
    }
  });

  // New members welcome handler & Captcha restriction
  bot.on('new_chat_members', async (ctx) => {
    try {
      if (ctx.chat?.type !== 'group' && ctx.chat?.type !== 'supergroup') return;

      const settings = await loadGroupSettings(ctx.chat.id);
      const welcome =
        (settings.welcome && String(settings.welcome).trim()) ||
        `Welcome to ${ctx.chat.title || 'the group'}!`;

      const members = ctx.message.new_chat_members || [];
      for (const user of members) {
        if (user.is_bot) continue;

        try {
          await ctx.telegram.restrictChatMember(ctx.chat.id, user.id, {
            permissions: {
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
            },
          });
        } catch (e) {
          console.error('join restrict', e);
        }

        if (supabase) {
          await supabase.from('rq_pending_joins').upsert({
            chat_id: toChatId(ctx.chat.id),
            user_id: Number(user.id),
            created_at: new Date().toISOString(),
          });
        }

        const name = user.first_name || 'friend';
        await ctx.reply(
          `${welcome}\n\nHi, ${name}!\nPress VERIFY to chat. Read /rules`,
          Markup.inlineKeyboard([
            [
              Markup.button.callback(
                'VERIFY ✅',
                `verify_join:${ctx.chat.id}:${user.id}`
              ),
            ],
          ])
        );
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
      const settings = await loadGroupSettings(gKey);
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
          `2 Set welcome text (Use /setwelcome command)\n` +
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
        pendingTool.set(uid, 'platforms_lab');
        await ctx.reply(platformsPanelText(), platformsKeyboard());
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

    if (mode === 'platforms_lab') {
      if (text === '0') {
        pendingTool.delete(uid);
        await ctx.reply(numberedMainMenuText(), mainMenuKeyboard(ctx));
        return;
      }
      if (text === '1') {
        await ctx.reply('Website:\nhttps://radiant-queen-pasiya-max-v2.vercel.app', platformsKeyboard());
        return;
      }
      if (text === '2') {
        await ctx.reply(
          'StrideClub:\nhttps://strideclub-platform-6b71a.containers.snapdeploy.app',
          platformsKeyboard()
        );
        return;
      }
      if (text === '3') {
        await ctx.reply(LINKS, platformsKeyboard());
        return;
      }
      if (text === '4') {
        await ctx.reply(statusText(ctx), platformsKeyboard());
        return;
      }
      if (text === '5') {
        if (!isAdmin(ctx)) {
          await ctx.reply('GitHub status is founder-only.', platformsKeyboard());
          return;
        }
        await ctx.sendChatAction('typing');
        await ctx.reply(await fetchGitHubStatus(), platformsKeyboard());
        return;
      }
      await ctx.reply(platformsPanelText(), platformsKeyboard());
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
        if (!isAdmin(ctx)) {
          const rate = await checkRateLimit(uid);
          if (!rate.ok) {
            await ctx.reply(`Slow down. Retry in ~${rate.waitSec}s.`);
            return;
          }
        }
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
        await ctx.reply(
          'Set welcome with this command IN THIS GROUP:\n\n' +
            '/setwelcome Welcome to our official group!\n\n' +
            'It saves to Supabase and shows when new members join.'
        );
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
          let count = '?';
          try {
            count = await ctx.telegram.callApi('getChatMemberCount', { chat_id: chatId });
          } catch (e1) {
            try {
              count = await ctx.telegram.callApi('getChatMembersCount', { chat_id: chatId });
            } catch (e2) {
              count = 'n/a';
            }
          }
          const settings = await loadGroupSettings(chatId);
          await ctx.reply(
            `GROUP INFO\n` +
              `Title: ${chat.title || '-'}\n` +
              `Type: ${chat.type}\n` +
              `Members: ${count}\n` +
              `ID: ${chatId}\n` +
              `Anti-link: ${settings?.antiLink ? 'ON' : 'OFF'}`
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
        const res = await saveGroupSettings(chatId, { antiLink: true, groupMode: 'antilink' });
        await ctx.reply(res.ok ? 'Anti-link ON (Supabase).' : `Memory only: ${res.error}`);
        return;
      }

      if (text === '6') {
        const res = await saveGroupSettings(chatId, { antiLink: false, groupMode: 'normal' });
        await ctx.reply(res.ok ? 'Anti-link OFF (Supabase).' : `Memory only: ${res.error}`);
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

    if (!isAdmin(ctx)) {
      const rate = await checkRateLimit(uid);
      if (!rate.ok) {
        await ctx.reply(`Slow down. Retry in ~${rate.waitSec}s.`);
        return;
      }
    }

    await ctx.sendChatAction('typing');

    if (mode && mode !== 'photo_caption') {
      pendingTool.clear();
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
        hasSupabase: Boolean(supabase),
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
 
