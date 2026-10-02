import { Telegraf, Markup } from 'telegraf';
import { GoogleGenAI } from '@google/genai';
import { createClient } from '@supabase/supabase-js';

const BOT_TOKEN = process.env.BOT_TOKEN || '';
const ADMIN_ID = String(process.env.ADMIN_ID || '').trim();
const ADMIN_EMAIL = String(process.env.ADMIN_EMAIL || 'pasindudananjaya92@gmail.com').trim();
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
  'gemini-3.8-flash',
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-3.5-flash-lite',
  'gemini-2.5-flash',
  'gemini-flash-latest',
];

function geminiModelCandidates() {
  // Never pass groq/openrouter/cache labels into Gemini SDK
  const bad = new Set(['groq', 'openrouter', 'cache', 'gemini']);
  const cur = resolvedModel && !bad.has(String(resolvedModel)) && String(resolvedModel).startsWith('gemini')
    ? [String(resolvedModel)]
    : [];
  return [...cur, ...MODELS.filter((m) => !cur.includes(m))];
}

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
const pendingGhPath = new Map(); // admin userId -> repo path (memory; also persisted)

async function setPendingGhPath(userId, repoPath) {
  const id = String(userId || '');
  const p = String(repoPath || '')
    .trim()
    .replace(/^\/+/, '')
    .replace(/\\/g, '/')
    .replace(/\.\./g, '');
  if (!id || !p) return { ok: false, error: 'empty' };
  // never allow basename-only overwrite of intentional nested paths from caller
  pendingGhPath.set(id, p);
  if (supabase) {
    try {
      await supabase.from('rq_bot_settings').upsert({
        key: 'ghpath_' + id,
        value: p,
        updated_at: new Date().toISOString(),
      });
    } catch (_) {}
  }
  return { ok: true, path: p };
}

async function getPendingGhPath(userId) {
  const id = String(userId || '');
  if (pendingGhPath.has(id)) return pendingGhPath.get(id);
  if (supabase) {
    try {
      const { data } = await supabase
        .from('rq_bot_settings')
        .select('value')
        .eq('key', 'ghpath_' + id)
        .maybeSingle();
      if (data?.value) {
        const p = String(data.value).replace(/^\/+/, '');
        pendingGhPath.set(id, p);
        return p;
      }
    } catch (_) {}
  }
  return null;
}

async function clearPendingGhPath(userId) {
  const id = String(userId || '');
  pendingGhPath.delete(id);
  if (supabase) {
    try {
      await supabase.from('rq_bot_settings').delete().eq('key', 'ghpath_' + id);
    } catch (_) {}
  }
}

const groupSettings = new Map(); // groupId -> settings
const slowLastMsg = new Map(); // `${chatId}:${userId}` -> timestamp ms
const rateMap = new Map(); // memory fallback for rate limit
const personaMem = new Map(); // userId -> persona id (P1c)
const uiModeMap = new Map(); // userId -> normal | phone | clean
const phoneAnchor = new Map(); // userId -> message_id
const collapseStore = new Map(); // chatId:messageId -> snapshot
const botSettingsMem = new Map(); // key -> value
const groupActiveUsers = new Map(); // chatId -> Map(userId -> {name, username, ts})


const RATE_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_MAX_HITS = 8; // max AI calls per user per window

function toChatId(chatId) {
  const n = Number(chatId);
  return Number.isFinite(n) ? n : chatId;
}

const BOT_VERSION = 'v4.0-packB-vault'; // Pack B: Supabase Storage /vault /files
const STRIDE_BASE =
  process.env.STRIDE_API_BASE ||
  'https://strideclub-platform-6b71a.containers.snapdeploy.app';


function computeBadges(row) {
  const xp = row?.xp || 0;
  const streak = row?.streak || 0;
  const runs = row?.runs_logged || 0;
  const badges = [];
  if (runs >= 1) badges.push('First Steps');
  if (runs >= 10) badges.push('Consistent');
  if (runs >= 50) badges.push('Road Warrior');
  if (streak >= 3) badges.push('Spark');
  if (streak >= 7) badges.push('Week Flame');
  if (streak >= 30) badges.push('Iron Month');
  if (xp >= 50) badges.push('XP 50');
  if (xp >= 200) badges.push('XP 200');
  if (xp >= 500) badges.push('XP Elite');
  if (row?.stride_name) badges.push('Stride Linked');
  return badges;
}


function parseTimeToSec(s) {
  const t = String(s || '').trim();
  if (!t) return null;
  const parts = t.split(':').map((x) => parseInt(x, 10));
  if (parts.some((n) => !Number.isFinite(n) || n < 0)) return null;
  if (parts.length === 1) return parts[0]; // seconds
  if (parts.length === 2) return parts[0] * 60 + parts[1]; // mm:ss
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]; // hh:mm:ss
  return null;
}

function formatSec(sec) {
  sec = Math.max(0, Math.round(sec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

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

async function fetchStrideJson(path, timeoutMs = 8000) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    let r;
    try {
      r = await fetch(`${STRIDE_BASE}${path}`, {
        headers: { Accept: 'application/json' },
        signal: ctrl.signal,
      });
    } finally {
      clearTimeout(t);
    }
    const text = await r.text();
    if (!r.ok) {
      return { ok: false, error: `HTTP ${r.status}`, status: r.status };
    }
    if (text.trim().startsWith('<')) {
      return { ok: false, error: 'HTML response (waking/proxy)', status: r.status };
    }
    try {
      return { ok: true, data: JSON.parse(text), status: r.status };
    } catch {
      return { ok: false, error: 'Invalid JSON', status: r.status };
    }
  } catch (e) {
    const msg = String(e?.message || e);
    const waking = /abort|timeout|network/i.test(msg);
    return {
      ok: false,
      error: msg.slice(0, 120),
      waking,
    };
  }
}


async function checkRateLimit(userId) {
  const id = String(userId);
  const now = Date.now();

  // P7: founder + premium users bypass AI rate limit
  if (ADMIN_ID && id === String(ADMIN_ID)) {
    return { ok: true, bypass: 'founder' };
  }
  if (supabase) {
    try {
      const uid = Number(id);
      if (Number.isFinite(uid)) {
        const { data } = await supabase
          .from('rq_gold')
          .select('premium')
          .eq('user_id', uid)
          .maybeSingle();
        if (data && data.premium) {
          return { ok: true, bypass: 'premium' };
        }
      }
    } catch (_) {}
  }

  // P1b: Upstash Redis (shared across serverless instances)
  try {
    const { checkRedisRateLimit } = await import('../lib/rateLimiter.js');
    const redis = await checkRedisRateLimit(id);
    if (redis && redis.ok === false) {
      return { ok: false, waitSec: redis.waitSec || 60 };
    }
    if (redis && redis.ok === true) {
      return { ok: true };
    }
  } catch (_) {
    /* fall through to memory / Supabase */
  }

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
    .select('welcome, rate_limit_enabled, group_mode, anti_link, rules_text, slow_seconds, bot_quiet')
    .eq('chat_id', toChatId(chatId))
    .maybeSingle();

  if (error) {
    console.error('loadGroupSettings', error.message);
    // fallback without slow_seconds column
    const q0 = await supabase
      .from('group_settings')
      .select('welcome, rate_limit_enabled, group_mode, anti_link, rules_text')
      .eq('chat_id', toChatId(chatId))
      .maybeSingle();
    if (q0.error) return {};
    const d = q0.data;
    const row0 = {
      welcome: d?.welcome || '',
      antiLink:
        Boolean(d?.anti_link) ||
        d?.group_mode === 'antilink' ||
        d?.group_mode === 'anti_link',
      rateLimit: Boolean(d?.rate_limit_enabled),
      groupMode: d?.group_mode || '',
      rulesText: d?.rules_text || '',
      slowSeconds: 0,
      botQuiet: false,
    };
    groupSettings.set(key, row0);
    return row0;
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
    slowSeconds: Number(data?.slow_seconds) || 0,
    botQuiet: Boolean(data?.bot_quiet),
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
    slowSeconds:
      patch.slowSeconds !== undefined
        ? Number(patch.slowSeconds) || 0
        : Number(prev.slowSeconds) || 0,
    botQuiet:
      patch.botQuiet !== undefined
        ? Boolean(patch.botQuiet)
        : Boolean(prev.botQuiet),
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
    slow_seconds: Number(next.slowSeconds) || 0,
    bot_quiet: Boolean(next.botQuiet),
  };

  let { error } = await supabase
    .from('group_settings')
    .upsert(row, { onConflict: 'chat_id' });

  if (error && String(error.message || '').includes('slow_seconds')) {
    const basic = { ...row };
    delete basic.slow_seconds;
    const r2 = await supabase.from('group_settings').upsert(basic, { onConflict: 'chat_id' });
    error = r2.error;
  }

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

async function getUserPersona(userId) {
  const id = String(userId || '');
  if (!id) return 'default';
  if (personaMem.has(id)) return personaMem.get(id);
  if (supabase) {
    try {
      const { data } = await supabase
        .from('rq_user_personas')
        .select('persona')
        .eq('user_id', id)
        .maybeSingle();
      if (data?.persona) {
        const { normalizePersona } = await import('../lib/personas.js');
        const p = normalizePersona(data.persona) || 'default';
        personaMem.set(id, p);
        return p;
      }
    } catch (_) {}
  }
  personaMem.set(id, 'default');
  return 'default';
}

async function setUserPersona(userId, personaId) {
  const id = String(userId || '');
  const { normalizePersona } = await import('../lib/personas.js');
  const p = normalizePersona(personaId);
  if (!p) return { ok: false, error: 'invalid' };
  personaMem.set(id, p);
  if (supabase) {
    try {
      const { error } = await supabase.from('rq_user_personas').upsert({
        user_id: id,
        persona: p,
        updated_at: new Date().toISOString(),
      });
      if (error) return { ok: true, persona: p, db: false, dbError: error.message };
      return { ok: true, persona: p, db: true };
    } catch (e) {
      return { ok: true, persona: p, db: false, dbError: String(e?.message || e) };
    }
  }
  return { ok: true, persona: p, db: false };
}




async function getBotSetting(key) {
  const k = String(key);
  if (botSettingsMem.has(k)) return botSettingsMem.get(k);
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from('rq_bot_settings')
      .select('value')
      .eq('key', k)
      .maybeSingle();
    if (error) return null;
    const v = data?.value ?? null;
    if (v != null) botSettingsMem.set(k, v);
    return v;
  } catch (_) {
    return null;
  }
}

async function setBotSetting(key, value) {
  const k = String(key);
  const v = value == null ? null : String(value);
  if (v == null) botSettingsMem.delete(k);
  else botSettingsMem.set(k, v);
  if (!supabase) return { ok: true, memory: true };
  try {
    if (v == null) {
      await supabase.from('rq_bot_settings').delete().eq('key', k);
      return { ok: true };
    }
    const { error } = await supabase.from('rq_bot_settings').upsert({
      key: k,
      value: v,
      updated_at: new Date().toISOString(),
    });
    if (error) return { ok: false, error: error.message, memory: true };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message, memory: true };
  }
}

async function listFactoryTemplates() {
  if (!supabase) {
    return [
      { id: 'club', name: 'Running Club', description: 'Stride + group + gold' },
      { id: 'shop', name: 'Shop Helper', description: 'AI + links + contact' },
      { id: 'school', name: 'School / Class', description: 'FAQ + rules + welcome' },
      { id: 'gold', name: 'Gold Economy', description: 'Balance daily prices' },
    ];
  }
  try {
    const { data, error } = await supabase
      .from('rq_factory_templates')
      .select('id,name,description,pack,features')
      .eq('is_public', true)
      .order('id');
    if (error || !data?.length) {
      return [
        { id: 'club', name: 'Running Club', description: 'Stride + group + gold' },
        { id: 'shop', name: 'Shop Helper', description: 'AI + links + contact' },
        { id: 'school', name: 'School / Class', description: 'FAQ + rules + welcome' },
        { id: 'gold', name: 'Gold Economy', description: 'Balance daily prices' },
      ];
    }
    return data;
  } catch (_) {
    return [
      { id: 'club', name: 'Running Club', description: 'Stride + group + gold' },
      { id: 'shop', name: 'Shop Helper', description: 'AI + links + contact' },
      { id: 'school', name: 'School / Class', description: 'FAQ + rules + welcome' },
      { id: 'gold', name: 'Gold Economy', description: 'Balance daily prices' },
    ];
  }
}

async function getTenantFlags(ownerId, botUsername) {
  const oid = Number(ownerId);
  const un = String(botUsername || '');
  if (!supabase) {
    return { version_channel: 'stable', flags: {}, template_id: null };
  }
  try {
    const { data } = await supabase
      .from('rq_tenant_flags')
      .select('version_channel,flags,template_id')
      .eq('owner_id', oid)
      .eq('bot_username', un)
      .maybeSingle();
    if (!data) return { version_channel: 'stable', flags: {}, template_id: null };
    return {
      version_channel: data.version_channel || 'stable',
      flags: data.flags || {},
      template_id: data.template_id || null,
    };
  } catch (_) {
    return { version_channel: 'stable', flags: {}, template_id: null };
  }
}

async function setTenantTemplate(ownerId, botUsername, templateId, channel, flags) {
  if (!supabase) return { ok: false, error: 'no supabase' };
  try {
    const row = {
      owner_id: Number(ownerId),
      bot_username: String(botUsername || ''),
      template_id: templateId || null,
      version_channel: channel || 'stable',
      updated_at: new Date().toISOString(),
    };
    if (flags && typeof flags === 'object') row.flags = flags;
    const { error } = await supabase.from('rq_tenant_flags').upsert(row);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

const DEFAULT_TEMPLATE_FLAGS = {
  club: { group: true, gold: true, stride: true, ai: true },
  shop: { group: false, gold: true, stride: false, ai: true },
  school: { group: true, gold: false, stride: false, ai: true },
  gold: { group: false, gold: true, stride: false, ai: true },
};

async function getTemplateFeatures(templateId) {
  const id = String(templateId || '').toLowerCase();
  if (!id) return null;
  if (supabase) {
    try {
      const { data } = await supabase
        .from('rq_factory_templates')
        .select('id,name,features')
        .eq('id', id)
        .maybeSingle();
      if (data?.features) {
        return {
          id: data.id,
          name: data.name,
          flags: typeof data.features === 'object' ? data.features : DEFAULT_TEMPLATE_FLAGS[id] || {},
        };
      }
    } catch (_) {}
  }
  if (DEFAULT_TEMPLATE_FLAGS[id]) {
    return { id, name: id, flags: DEFAULT_TEMPLATE_FLAGS[id] };
  }
  return null;
}

async function applyFactoryToOwner(ownerId, templateId, channel) {
  const tpl = await getTemplateFeatures(templateId);
  if (!tpl) return { ok: false, error: 'unknown template (use club|shop|school|gold)' };
  let botUsername = '';
  try {
    if (typeof getUserBot === 'function') {
      const row = await getUserBot(ownerId);
      if (row?.bot_username) botUsername = row.bot_username;
    }
  } catch (_) {}
  const ch = channel || 'stable';
  const r = await setTenantTemplate(ownerId, botUsername, tpl.id, ch, tpl.flags);
  if (!r.ok) return r;
  // also store under empty username key for founder main bot profile
  if (botUsername) {
    await setTenantTemplate(ownerId, '', tpl.id, ch, tpl.flags);
  }
  let welcomeResult = null;
  try {
    welcomeResult = await applyTemplateWelcome(ownerId, tpl.id);
  } catch (_) {}
  let commandsResult = null;
  try {
    const token = await getTenantToken(ownerId);
    if (token) commandsResult = await setTenantBotCommands(token, tpl.id);
  } catch (_) {}
  return {
    ok: true,
    template_id: tpl.id,
    name: tpl.name,
    flags: tpl.flags,
    bot_username: botUsername || '(main / no tenant yet)',
    version_channel: ch,
    welcome_applied: !!(welcomeResult && welcomeResult.ok),
    welcome_error: welcomeResult && !welcomeResult.ok ? welcomeResult.error : null,
    commands_set: !!(commandsResult && commandsResult.ok),
  };
}

function flagOn(flags, key) {
  if (!flags || typeof flags !== 'object') return true; // default open if no flags set
  if (Object.keys(flags).length === 0) return true;
  if (flags[key] === false) return false;
  return flags[key] !== false;
}

async function getOwnerFactoryState(ownerId) {
  let st = await getTenantFlags(ownerId, '');
  try {
    if (typeof getUserBot === 'function') {
      const row = await getUserBot(ownerId);
      if (row?.bot_username) {
        const st2 = await getTenantFlags(ownerId, row.bot_username);
        if (st2?.template_id) st = st2;
      }
    }
  } catch (_) {}
  return st;
}

async function requireFeature(ctx, featureKey, label) {
  try {
    const st = await getOwnerFactoryState(ctx.from.id);
    // Main Radiant Queen bot (founder) always full power
    if (typeof isAdmin === 'function' && isAdmin(ctx)) return true;
    if (flagOn(st.flags, featureKey)) return true;
    await ctx.reply(
      'Feature off for your pack: ' +
        (label || featureKey) +
        '\nTemplate: ' +
        (st.template_id || 'none') +
        '\nUse /factoryapply club|shop|school|gold'
    );
    return false;
  } catch (_) {
    return true;
  }
}

const TEMPLATE_WELCOMES = {
  club:
    'Ayubowan! 🏃 Running Club mode\nPowered by RADIANT QUEEN · PASIYA MAX\n\nSend text for AI coach tips.\nFull tools: @PasiyaMaxQueen_bot\n/help',
  shop:
    'Welcome! 🛒 Shop helper mode\nPowered by RADIANT QUEEN · PASIYA MAX\n\nAsk product or support questions.\nFull tools: @PasiyaMaxQueen_bot\n/help',
  school:
    'Welcome! 📚 Class bot mode\nPowered by RADIANT QUEEN · PASIYA MAX\n\nAsk lessons / FAQ style questions.\nFull tools: @PasiyaMaxQueen_bot\n/help',
  gold:
    'Welcome! 💰 Gold economy mode\nPowered by RADIANT QUEEN · PASIYA MAX\n\nMain bot: /balance /daily on @PasiyaMaxQueen_bot\n/help',
};

async function applyTemplateWelcome(ownerId, templateId) {
  const id = String(templateId || '').toLowerCase();
  const text = TEMPLATE_WELCOMES[id];
  if (!text || !supabase) return { ok: false, error: 'no welcome preset' };
  try {
    // Same lookup as /mybot (getUserBot) — do NOT require is_active=true filter
    // (column type / null / truthy mismatch was blocking welcome apply)
    let row = null;
    if (typeof getUserBot === 'function') {
      row = await getUserBot(ownerId);
    }
    if (!row && supabase) {
      const q = await supabase
        .from('rq_user_bots')
        .select('id,bot_username,is_active,owner_id')
        .eq('owner_id', Number(ownerId))
        .maybeSingle();
      row = q.data || null;
    }
    if (!row) {
      // fallback: string owner_id match
      const q2 = await supabase
        .from('rq_user_bots')
        .select('id,bot_username,is_active,owner_id')
        .eq('owner_id', String(ownerId))
        .maybeSingle();
      row = q2.data || null;
    }
    if (!row) return { ok: false, error: 'no tenant bot — /setbot first' };

    const uid = Number(ownerId);
    const { error } = await supabase
      .from('rq_user_bots')
      .update({
        welcome_text: text,
        is_active: true,
        updated_at: new Date().toISOString(),
      })
      .eq('owner_id', uid);
    if (error) {
      // retry without updated_at if column missing
      const r2 = await supabase
        .from('rq_user_bots')
        .update({ welcome_text: text, is_active: true })
        .eq('owner_id', uid);
      if (r2.error) return { ok: false, error: r2.error.message };
    }
    return {
      ok: true,
      bot_username: row.bot_username,
      welcome: text,
      owner_id: row.owner_id,
    };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

async function requireBeta(ctx, label) {
  try {
    if (typeof isAdmin === 'function' && isAdmin(ctx)) return true;
    const st = await getOwnerFactoryState(ctx.from.id);
    if ((st.version_channel || 'stable') === 'beta') return true;
    await ctx.reply(
      'Beta only: ' +
        (label || 'feature') +
        '\nYour channel: ' +
        (st.version_channel || 'stable') +
        '\nFounder: /factorychannel beta'
    );
    return false;
  } catch (_) {
    return false;
  }
}

const PACK_COMMANDS = {
  club: [
    { command: 'start', description: 'Welcome / Running Club' },
    { command: 'help', description: 'Tenant help' },
    { command: 'pack', description: 'Show pack + flags' },
    { command: 'menu', description: 'Quick menu' },
  ],
  shop: [
    { command: 'start', description: 'Welcome / Shop helper' },
    { command: 'help', description: 'Tenant help' },
    { command: 'pack', description: 'Show pack + flags' },
    { command: 'menu', description: 'Quick menu' },
  ],
  school: [
    { command: 'start', description: 'Welcome / Class bot' },
    { command: 'help', description: 'Tenant help' },
    { command: 'pack', description: 'Show pack + flags' },
    { command: 'menu', description: 'Quick menu' },
  ],
  gold: [
    { command: 'start', description: 'Welcome / Gold mode' },
    { command: 'help', description: 'Tenant help' },
    { command: 'pack', description: 'Show pack + flags' },
    { command: 'menu', description: 'Quick menu' },
  ],
};

async function setTenantBotCommands(botToken, templateId) {
  if (!botToken) return { ok: false, error: 'no token' };
  const id = String(templateId || 'club').toLowerCase();
  const commands = PACK_COMMANDS[id] || PACK_COMMANDS.club;
  try {
    const r = await fetch(`https://api.telegram.org/bot${botToken}/setMyCommands`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ commands }),
    });
    const j = await r.json();
    return { ok: !!j.ok, error: j.description || null };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function getTenantToken(ownerId) {
  const row = typeof getUserBot === 'function' ? await getUserBot(ownerId) : null;
  return row?.bot_token || null;
}

const MARKET_PACKS = [
  {
    id: 'club',
    emoji: '🏃',
    title: 'Running Club',
    blurb: 'AI coach + group tools + Stride + gold. Best for run clubs.',
    flags: 'ai · group · gold · stride',
  },
  {
    id: 'shop',
    emoji: '🛒',
    title: 'Shop Helper',
    blurb: 'Customer Q&A style AI + gold. Light group tools off by default pack.',
    flags: 'ai · gold',
  },
  {
    id: 'school',
    emoji: '📚',
    title: 'Class / FAQ',
    blurb: 'Lessons & FAQ answers. Good for study groups.',
    flags: 'ai · gold',
  },
  {
    id: 'gold',
    emoji: '💰',
    title: 'Gold Economy',
    blurb: 'Focus on Radiant Gold habits on main bot. Tenant AI on.',
    flags: 'ai · gold',
  },
];

function marketKeyboard() {
  const rows = [];
  for (const p of MARKET_PACKS) {
    rows.push([
      {
        text: `${p.emoji} ${p.title}`,
        callback_data: `mkt_info_${p.id}`,
      },
      {
        text: '✅ Apply',
        callback_data: `mkt_apply_${p.id}`,
      },
    ]);
  }
  rows.push([
    { text: '📊 My status', callback_data: 'mkt_status' },
    { text: '🏠 Menu', callback_data: 'mkt_menu' },
  ]);
  rows.push([
    { text: '🔗 Share market', callback_data: 'mkt_share_market' },
  ]);
  return { inline_keyboard: rows };
}

function marketText(st) {
  const lines = [
    '⚡ RADIANT QUEEN · MARKETPLACE',
    'STABLE v4.0 · Marketplace + share links',
    '',
    'Pick a pack → Apply. Then open your tenant bot /start.',
    '',
  ];
  for (const p of MARKET_PACKS) {
    const mark = st && st.template_id === p.id ? ' ← active' : '';
    lines.push(`${p.emoji} ${p.title}${mark}`);
    lines.push(`   ${p.blurb}`);
    lines.push(`   Flags: ${p.flags}`);
    lines.push('');
  }
  lines.push('Or type: /factoryapply club|shop|school|gold');
  lines.push('Share pack: /invitepack club');
  lines.push('Studio: /factory · web /bot/studio.html');
  return lines.join('\n');
}

function packDetailText(id) {
  const p = MARKET_PACKS.find((x) => x.id === id);
  if (!p) return 'Unknown pack.';
  return (
    `${p.emoji} ${p.title}\n\n` +
    `${p.blurb}\n\n` +
    `Flags: ${p.flags}\n` +
    `Apply: tap ✅ Apply or /factoryapply ${p.id}\n` +
    `Then: /factorywelcome · tenant /start`
  );
}

const MAIN_BOT_USERNAME = process.env.BOT_USERNAME || 'PasiyaMaxQueen_bot';
const WEB_HUB = process.env.APP_URL || 'https://radiant-queen-pasiya-max-v2.vercel.app';

function packStartLink(packId) {
  const id = String(packId || 'club').toLowerCase();
  return `https://t.me/${MAIN_BOT_USERNAME}?start=pack_${id}`;
}

function marketStartLink() {
  return `https://t.me/${MAIN_BOT_USERNAME}?start=market`;
}

function invitePackCard(packId, fromUser) {
  const p = (typeof MARKET_PACKS !== 'undefined' ? MARKET_PACKS : []).find(
    (x) => x.id === String(packId || '').toLowerCase()
  );
  const id = p?.id || String(packId || 'club').toLowerCase();
  const title = p ? `${p.emoji} ${p.title}` : id;
  const blurb = p?.blurb || 'Radiant Queen template pack';
  const link = packStartLink(id);
  const who = fromUser?.username
    ? '@' + fromUser.username
    : fromUser?.first_name || 'a friend';
  return (
    `👑 Join RADIANT QUEEN · PASIYA MAX\n\n` +
    `Pack invite: ${title}\n` +
    `${blurb}\n\n` +
    `1) Open: ${link}\n` +
    `2) Tap Start\n` +
    `3) Get 400 Radiant Gold · /market · /daily\n\n` +
    `Web hub: ${WEB_HUB}/bot/\n` +
    `Marketplace: ${WEB_HUB}/bot/studio.html\n\n` +
    `Invited by ${who}\n` +
    `— Radiant Queen · free on Telegram`
  );
}

function parseStartPayload(payload) {
  const p = String(payload || '').trim().toLowerCase();
  if (!p) return null;
  if (p === 'market' || p === 'marketplace') return { type: 'market' };
  const m = /^pack[_-](club|shop|school|gold)$/.exec(p);
  if (m) return { type: 'pack', id: m[1] };
  if (['club', 'shop', 'school', 'gold'].includes(p)) return { type: 'pack', id: p };
  const ref = /^ref[_-]?(\d+)$/.exec(p);
  if (ref) return { type: 'ref', id: ref[1] };
  return { type: 'raw', payload: p };
}








function trackGroupUser(ctx) {
  try {
    const chat = ctx.chat;
    if (!chat || (chat.type !== 'group' && chat.type !== 'supergroup')) return;
    const u = ctx.from;
    if (!u || u.is_bot) return;
    const cid = String(chat.id);
    if (!groupActiveUsers.has(cid)) groupActiveUsers.set(cid, new Map());
    groupActiveUsers.get(cid).set(String(u.id), {
      id: u.id,
      name: [u.first_name, u.last_name].filter(Boolean).join(' ') || u.username || 'User',
      username: u.username || null,
      ts: Date.now(),
    });
  } catch (_) {}
}

function contactOwnerKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.url('📞 WhatsApp 0759570743', 'https://wa.me/94759570743')],
    [Markup.button.url('📞 WhatsApp 0707751710', 'https://wa.me/94707751710')],
    [Markup.button.callback('🏠 Menu', 'menu_home')],
  ]);
}

function groupPowerKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('📊 Group info', 'tap_groupinfo'),
      Markup.button.callback('👑 Admins', 'tap_tagadmins'),
    ],
    [
      Markup.button.callback('📣 Tag active', 'tap_tagall'),
      Markup.button.callback('🔗 Invite link', 'tap_invitelink'),
    ],
    [
      Markup.button.callback('📞 Contact', 'tap_contact'),
      Markup.button.callback('🏠 Menu', 'menu_home'),
    ],
  ]);
}

async function resolveTargetUser(ctx) {
  if (ctx.message?.reply_to_message?.from) {
    return ctx.message.reply_to_message.from;
  }
  const text = ctx.message?.text || '';
  const parts = text.trim().split(/\s+/);
  if (parts.length < 2) return null;
  const raw = parts[1].replace(/^@/, '');
  if (/^\d+$/.test(raw)) {
    return { id: Number(raw), username: null, first_name: raw };
  }
  // username lookup not available via API without interaction
  return { id: null, username: raw, first_name: raw };
}

function getUiMode(uid) {
  return uiModeMap.get(String(uid)) || 'normal';
}

function cycleUiMode(uid) {
  const order = ['normal', 'phone', 'clean'];
  const cur = getUiMode(uid);
  const next = order[(order.indexOf(cur) + 1) % order.length];
  uiModeMap.set(String(uid), next);
  return next;
}

function modeButtonLabel(uid) {
  const m = getUiMode(uid);
  if (m === 'phone') return '🔘 Mode: 📱 Phone';
  if (m === 'clean') return '🔘 Mode: 🧹 Clean';
  return '🔘 Mode: 📜 Normal';
}


function sanitizeUiText(s) {
  // Strip box-drawing / heavy rules that Telegram paints as a full-height vertical bar
  return String(s || '')
    .replace(/[╔╗╚╝╠╣╦╩╬┌┐└┘├┤┬┴┼┃━│║═─]/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function rowsOf3(buttons) {
  const rows = [];
  const list = Array.isArray(buttons) ? buttons.slice() : [];
  while (list.length) {
    rows.push(list.splice(0, 3));
  }
  return rows;
}

function digitalFrame(body) {
  // Digital OS header — always follows BOT_VERSION (no stale v3.7 label)
  const core = sanitizeUiText(String(body || '').trim());
  const ver = typeof BOT_VERSION !== 'undefined' ? BOT_VERSION : 'v4.0';
  return (
    `⚡ RADIANT QUEEN OS ${ver}
` +
    `👑 FULL POWER · DIGITAL · 3-MODE
` +
    `· · · · · · · · · · · · · · · ·
` +
    core +
    `
· · · · · · · · · · · · · · · ·
` +
    `Mode · 🔟 Guide · /contact · /menu`
  );
}

function extractRows(markup) {
  if (!markup) return [];
  if (markup.reply_markup?.inline_keyboard) {
    return markup.reply_markup.inline_keyboard.map((r) => r.slice());
  }
  if (markup.inline_keyboard) {
    return markup.inline_keyboard.map((r) => r.slice());
  }
  return [];
}

function buildUiMarkup(ctx, baseMarkup) {
  const uid = ctx.from?.id;
  const mode = getUiMode(uid);
  const rows = extractRows(baseMarkup);
  // Mode cycle always visible
  rows.push([Markup.button.callback(modeButtonLabel(uid), 'ui_mode_cycle')]);
  // Clean mode: every box gets dismiss + collapse
  if (mode === 'clean') {
    rows.push([
      Markup.button.callback('🔼 Fold', 'ui_collapse'),
      Markup.button.callback('❌ Close', 'ui_dismiss'),
    ]);
  }
  return Markup.inlineKeyboard(rows);
}

function setPhoneFrame(uid, messageId) {
  if (uid && messageId) phoneAnchor.set(String(uid), Number(messageId));
}

function getPhoneFrame(uid) {
  return phoneAnchor.get(String(uid));
}

/**
 * Universal UI sender — ALL menu navigations must use this.
 * Phone: edit same messageId (device screen)
 * Clean: new message + ❌ 🔼 on every box
 * Normal: new message, digital frame only
 */
async function uiReply(ctx, text, baseMarkup) {
  const uid = ctx.from?.id;
  const mode = getUiMode(uid);
  const framed = digitalFrame(sanitizeUiText(text)).slice(0, 4090);
  const extra = buildUiMarkup(ctx, baseMarkup || Markup.inlineKeyboard([]));

  // --- PHONE MODE: must stay on one message ---
  if (mode === 'phone') {
    // 1) Prefer editing the callback's own message (same box user tapped)
    if (ctx.callbackQuery?.message?.message_id) {
      try {
        await ctx.telegram.editMessageText(
          ctx.chat.id,
          ctx.callbackQuery.message.message_id,
          undefined,
          framed,
          extra
        );
        setPhoneFrame(uid, ctx.callbackQuery.message.message_id);
        return;
      } catch (err) {
        // message is not modified / parse issues — try anchor
        console.error('phone edit callback msg', err?.message || err);
      }
    }
    // 2) Edit stored phone frame
    const anchorId = getPhoneFrame(uid);
    if (anchorId && ctx.chat?.id) {
      try {
        await ctx.telegram.editMessageText(
          ctx.chat.id,
          anchorId,
          undefined,
          framed,
          extra
        );
        return;
      } catch (err) {
        console.error('phone edit anchor', err?.message || err);
      }
    }
    // 3) First paint — create frame and remember id
    const sent = await ctx.reply(framed, extra);
    if (sent?.message_id) setPhoneFrame(uid, sent.message_id);
    return;
  }

  // --- CLEAN + NORMAL: new message (clean markup has ❌ 🔼) ---
  const sent = await ctx.reply(framed, extra);
  return sent;
}

async function sendMenuSmart(ctx, text, baseMarkup) {
  const framed = digitalFrame(sanitizeUiText(text)).slice(0, 1024); // photo caption limit
  const extra = buildUiMarkup(ctx, baseMarkup || mainMenuKeyboard(ctx));
  const isGroup = ctx.chat && (ctx.chat.type === 'group' || ctx.chat.type === 'supergroup');
  const mode = getUiMode(ctx.from?.id);

  // Groups (or when banner set): prefer photo + caption + buttons together
  let bannerId = null;
  try {
    bannerId = await getBotSetting('banner_file_id');
  } catch (_) {}

  // Phone mode private: keep edit path via uiReply (text only)
  if (mode === 'phone' && !isGroup) {
    await uiReply(ctx, text, baseMarkup || mainMenuKeyboard(ctx));
    return;
  }

  if (bannerId) {
    try {
      await ctx.replyWithPhoto(bannerId, {
        caption: framed,
        ...extra,
      });
      return;
    } catch (e) {
      console.error('sendMenuSmart photo', e?.message || e);
    }
  }

  // Fallback text
  await uiReply(ctx, text, baseMarkup || mainMenuKeyboard(ctx));
}





function numberedMainMenuText() {
  const ver = typeof BOT_VERSION !== 'undefined' ? BOT_VERSION : 'v4.0';
  return (
    `⚡ RADIANT QUEEN · PASIYA MAX
` +
    `OS ${ver} · DIGITAL · TOUCH + TYPE

` +
    `WEB  radiant-queen-pasiya-max-v2.vercel.app
` +
    `HUB  /bot/   BOT  @PasiyaMaxQueen_bot

` +
    `MAIN (type 1-10 or tap)
` +
    `1  Owner / Founder
` +
    `2  Social Hub
` +
    `3  AI Lab
` +
    `4  Group Admin Lab
` +
    `5  Creator Tools
` +
    `6  Education Lab
` +
    `7  Channels and Links
` +
    `8  Connected Platforms
` +
    `9  Status and Help
` +
    `10 Sinhala Full Guide

` +
    `Tip: Mode button cycles Phone / Clean / Normal · /market · /invitepack`
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
  const buttons = [
    Markup.button.callback('1️⃣ AI', 'menu_ask'),
    Markup.button.callback('2️⃣ Social', 'menu_social'),
    Markup.button.callback('3️⃣ Tools', 'menu_tools'),
    Markup.button.callback('4️⃣ Group', 'menu_gadmin'),
    Markup.button.callback('5️⃣ Creator', 'menu_tools'),
    Markup.button.callback('6️⃣ Learn', 'menu_edu'),
    Markup.button.callback('7️⃣ Links', 'menu_links'),
    Markup.button.callback('8️⃣ Platforms', 'menu_platforms'),
    Markup.button.callback('9️⃣ Status', 'menu_status'),
    Markup.button.callback('🔟 Guide', 'menu_si_home'),
    Markup.button.callback('💰 Gold', 'menu_gold'),
    Markup.button.callback('🌦️ Weather', 'menu_weather'),
    Markup.button.callback('🏃 Stride', 'menu_stride_panel'),
    Markup.button.callback('🎁 Invite', 'menu_invite'),
    Markup.button.callback('📋 Free', 'menu_freetools'),
    Markup.button.callback('ℹ️ About', 'menu_about'),
    Markup.button.callback('❓ Help', 'menu_help'),
    Markup.button.callback('🆔 My ID', 'menu_id'),
  ];
  if (isAdmin(ctx)) {
    buttons.push(
      Markup.button.callback('👑 Admin', 'menu_admin'),
      Markup.button.callback('📞 Contact', 'tap_contact'),
      Markup.button.callback('📊 Info', 'tap_groupinfo')
    );
  } else {
    buttons.push(
      Markup.button.callback('📞 Contact', 'tap_contact'),
      Markup.button.callback('📊 Info', 'tap_groupinfo'),
      Markup.button.callback('🔗 Hub', 'menu_links')
    );
  }
  return Markup.inlineKeyboard(rowsOf3(buttons));
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
    [
      Markup.button.callback('💰 Gold', 'menu_gold'),
      Markup.button.callback('🌦️ Weather', 'menu_weather'),
    ],
    [Markup.button.callback('🏠 Main menu', 'menu_home')],
  ]);
}

function goldKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('💰 Balance', 'tap_balance'),
      Markup.button.callback('🎁 Daily', 'tap_daily'),
    ],
    [
      Markup.button.callback('💲 Prices', 'tap_prices'),
      Markup.button.callback('🏠 Menu', 'menu_home'),
    ],
  ]);
}

function weatherKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('Colombo weather', 'tap_weather_cmb'),
      Markup.button.callback('Moon', 'tap_moon'),
    ],
    [
      Markup.button.callback('Sun Colombo', 'tap_sun_cmb'),
      Markup.button.callback('AQI Colombo', 'tap_aqi_cmb'),
    ],
    [
      Markup.button.callback('USD→LKR', 'tap_currency'),
      Markup.button.callback('🏠 Menu', 'menu_home'),
    ],
  ]);
}

function gadminKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('Modcheck', 'tap_modcheck'),
      Markup.button.callback('Rules', 'tap_rules'),
    ],
    [
      Markup.button.callback('Anti-link', 'tap_antilink_status'),
      Markup.button.callback('📊 Info', 'tap_groupinfo'),
    ],
    [
      Markup.button.callback('👑 Admins', 'tap_tagadmins'),
      Markup.button.callback('📣 Tag active', 'tap_tagall'),
    ],
    [
      Markup.button.callback('🔗 Invite', 'tap_invitelink'),
      Markup.button.callback('📞 Contact', 'tap_contact'),
    ],
    [Markup.button.callback('🏠 Menu', 'menu_home')],
  ]);
}

function siGuideHomeKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('🤖 AI කතා', 'si_cat_ai'),
      Markup.button.callback('💰 Gold', 'si_cat_gold'),
    ],
    [
      Markup.button.callback('⛅ කාලගුණය', 'si_cat_weather'),
      Markup.button.callback('🧮 ගණන්/මුදල්', 'si_cat_math'),
    ],
    [
      Markup.button.callback('👥 Group Admin', 'si_cat_group'),
      Markup.button.callback('🏃 දිවීම Stride', 'si_cat_run'),
    ],
    [
      Markup.button.callback('🧰 Tools', 'si_cat_tools'),
      Markup.button.callback('📚 ඉගෙනීම', 'si_cat_learn'),
    ],
    [
      Markup.button.callback('📝 මගේ ලැයිස්තු', 'si_cat_personal'),
      Markup.button.callback('🔐 රහස් මෙවලම්', 'si_cat_crypto'),
    ],
    [
      Markup.button.callback('⚙️ System', 'si_cat_system'),
      Markup.button.callback('🤖 මගේ Bot', 'si_cat_tenant'),
    ],
    [
      Markup.button.callback('🔗 Links / Invite', 'si_cat_links'),
      Markup.button.callback('🏠 ප්‍රධාන මෙනුව', 'menu_home'),
    ],
  ]);
}

function siBackKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('🔙 කාණ්ඩ ලැයිස්තුව', 'menu_si_home'),
      Markup.button.callback('🏠 ප්‍රධාන මෙනුව', 'menu_home'),
    ],
  ]);
}

function siGuideIntroText() {
  return (
    `🔟 සිංහල සම්පූර්ණ GUIDE\n\n` +
    `මෙය බොට් එකේ හැම කොටසක්ම සරල සිංහලෙන්.\n` +
    `පහත බොත්තම් වලින් කාණ්ඩයක් තෝරන්න.\n` +
    `කාණ්ඩයක් තුළ විධානය කුමක්ද කියලා පැහැදිලිව තියෙනවා.\n\n` +
    `ඉංග්‍රීසි නොදන්නත් කමක් නැහැ.\n` +
    `බොත්තම් ඔබන්න හෝ /si ටයිප් කරන්න.`
  );
}

const SI_CAT = {
  system: (
    `⚙️ SYSTEM — පද්ධතිය\n\n` +
    `/start — බොට් එක පටන් ගන්න / මෙනුව\n` +
    `/menu — ප්‍රධාන මෙනුව + බොත්තම්\n` +
    `/si — මේ සිංහල GUIDE එක\n` +
    `/help — උදව් ලැයිස්තුව\n` +
    `/ping — බොට් ජීවමානද බලන්න\n` +
    `/version — බොට් version එක\n` +
    `/about — බොට් ගැන කෙටි කතාව\n` +
    `/id — ඔබේ Telegram ID එක\n` +
    `/status — තත්ත්වය\n` +
    `/commands — විධාන ලැයිස්තුව`
  ),
  gold: (
    `💰 GOLD — රන් ලකුණු\n\n` +
    `මෙය AI භාවිතයට තියෙන නොමිලේ ලකුණු පද්ධතියයි.\n\n` +
    `/balance හෝ /gold — මගේ gold කීයද\n` +
    `/daily හෝ /claim — දවසට +50 ගන්න (දවසකට වරක්)\n` +
    `/prices හෝ /costs — මිල ලැයිස්තුව\n\n` +
    `මිල (සාමාන්‍ය):\n` +
    `• AI පෙළ පිළිතුර — 5\n` +
    `• රූප/vision — 10\n` +
    `• හඬ/voice — 10\n` +
    `• Stride — 5\n\n` +
    `පටන් ගන්නාම ආසන්න වශයෙන් 400 ලැබේ.`
  ),
  weather: (
    `⛅ කාලගුණය හා අහස\n\n` +
    `/weather Colombo — නගරයේ කාලගුණය\n` +
    `/forecast Colombo — ඉදිරි දින කාලගුණය\n` +
    `/sun Colombo — ඉර උදාව / බැසීම\n` +
    `/aqi Colombo — වායු තත්ත්වය (AQI)\n` +
    `/moon — සඳ ගැන\n\n` +
    `Colombo වෙනුවට ඔබේ නගරය දාන්න.`
  ),
  math: (
    `🧮 ගණන් හා මුදල්\n\n` +
    `/currency USD LKR — ඩොලර් → රුපියල්\n` +
    `/calc 10*5 — ගණන් කරන්න\n` +
    `/time — වේලාව\n` +
    `/uuid — අහඹු ID එකක්`
  ),
  crypto: (
    `🔐 රහස් / කේත මෙවලම්\n\n` +
    `/pw — ශක්තිමත් මුරපදයක් හදන්න\n` +
    `/b64 — Base64 කේතනය\n` +
    `/hash — hash අගයක් හදන්න\n\n` +
    `මේවා AI නැතිවත් වැඩ කරයි.`
  ),
  personal: (
    `📝 මගේ ලැයිස්තු (පුද්ගලික)\n\n` +
    `/todo ටෙක්ස්ට් — කළ යුතු දෙයක් දාන්න\n` +
    `/todos — ලැයිස්තුව බලන්න\n` +
    `/done අංකය — ඉවරයි කියලා මකන්න\n\n` +
    `/save ටෙක්ස්ට් — සටහනක් සේව්\n` +
    `/saves — සේව් ලැයිස්තුව\n` +
    `/unsave අංකය — මකන්න\n\n` +
    `/habit නම — පුරුද්දක් එකතු\n` +
    `/habits — පුරුදු බලන්න\n` +
    `/export — දත්ත export`
  ),
  run: (
    `🏃 දිවීම / StrideClub\n\n` +
    `/pace 5 25:00 — වේගය ගණන්\n` +
    `/split 5:30 10 — කොටස් වේලා\n` +
    `/convert 21.1 km — km ↔ miles\n` +
    `/stride — StrideClub bridge\n` +
    `/runxp — දිවීම් XP\n` +
    `/xptop — XP ලීඩර්බෝඩ්\n` +
    `/logrun සටහන — රන් ලොග්\n` +
    `/streak — දින දිගටි පුරුද්ද\n` +
    `/me — මගේ පැතිකඩ`
  ),
  group: (
    `👥 GROUP ADMIN — සමූහ පාලනය\n\n` +
    `බොට්ව group එකේ Admin කරන්න (Delete + Restrict).\n\n` +
    `/groupadmin හෝ /gadmin — admin මෙනුව\n` +
    `/kick /ban /unban /pin /purge /promote /demote\n` +
    `/tagall /admins /members /invitelink /contact\n` +
    `/setwelcome පෙළ — ආචාර පණිවිඩය\n` +
    `/setrules පෙළ — නීති\n` +
    `/rules — නීති කියවන්න\n` +
    `/antilink on|off|status — ලින්ක් අවහිර\n` +
    `/modcheck — බොට්ට බලතල තියෙනවද\n` +
    `/groupinfo — සමූහ තොරතුරු\n` +
    `/warn (reply) — අනතුරු ඇඟවීම\n` +
    `/unwarn (reply) — warn අඩු\n` +
    `/warns — warn ලැයිස්තුව\n` +
    `/mute /unmute — නිහඬ / නිදහස්\n` +
    `/slow තත් — slow mode\n` +
    `/note /notes — සටහන්\n` +
    `/faqset /faq — නිති ප්‍රශ්න`
  ),
  tools: (
    `🧰 CREATOR TOOLS\n\n` +
    `මෙනුවෙන් Tools බොත්තම ඔබන්න.\n` +
    `හෝ /tools\n\n` +
    `තියෙනවා:\n` +
    `• Translate — පරිවර්තනය\n` +
    `• Summarize — කෙටි කරන්න\n` +
    `• Rewrite — නැවත ලියන්න\n` +
    `• Caption — caption හදන්න\n` +
    `• Hashtags — හෑෂ්ටැග්\n` +
    `• Bio — bio ලියන්න\n` +
    `• Ideas — අදහස්\n` +
    `• Running tip — දිවීම් උපදෙස්\n` +
    `• Photo caption — රූපයට caption`
  ),
  learn: (
    `📚 ඉගෙනීම / AI උපකාර\n\n` +
    `/wiki මාතෘකාව — විස්තර\n` +
    `/web ප්‍රශ්නය — වෙබ් උපකාර\n` +
    `/code ප්‍රශ්නය — කේත උපකාර\n` +
    `/define වචනය — අර්ථය\n` +
    `/tr පෙළ — පරිවර්තනය\n\n` +
    `සාමාන්‍ය පෙළ යැවුවත් AI උත්තර දෙයි.\n` +
    `(Gold / quota අනුව)`
  ),
  ai: (
    `🤖 AI කතා කිරීම\n\n` +
    `1) ප්‍රශ්නය සෘජුව ටයිප් කරන්න\n` +
    `2) හෝ මෙනුවෙන් 1️⃣ AI ඔබන්න\n` +
    `3) රූපයක් යවන්න — vision විශ්ලේෂණය\n` +
    `4) හඬ පණිවිඩයක් — voice\n\n` +
    `AI නැවතී නම්:\n` +
    `/tools බලන්න — නොමිලේ මෙවලම් තවමත් වැඩ කරයි.\n\n` +
    `Gold වියදම් වේ — /balance /prices`
  ),
  tenant: (
    `🤖 මගේ Bot (Tenant)\n\n` +
    `ඔබේම Telegram bot එකක් Radiant Queen engine එකට සම්බන්ධ කරන්න.\n\n` +
    `/setbot ටෝකන් — bot එක සම්බන්ධ කරන්න\n` +
    `/mybot — මගේ bot තොරතුරු\n` +
    `/resyncbot — webhook නැවත සකසන්න\n` +
    `/settenantwelcome පෙළ — ආචාර පණිවිඩය\n` +
    `/tenantwelcome — දැන් තියෙන welcome\n\n` +
    `ටෝකන් BotFather ගෙන් ගන්න.\n` +
    `ටෝකන් public group එකක දාන්න එපා.`
  ),
  links: (
    `🔗 Links හා Invite\n\n` +
    `/links — නිල ලින්ක් ඔක්කොම\n` +
    `/invite හෝ /share — යාළුවන්ට යවන පෙළ\n\n` +
    `Bot: https://t.me/PasiyaMaxQueen_bot\n` +
    `Web: https://radiant-queen-pasiya-max-v2.vercel.app\n` +
    `Hub: https://radiant-queen-pasiya-max-v2.vercel.app/bot/\n\n` +
    `Landing එකේත් share පෙළ තියෙනවා.`
  ),
};




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
    `Admin email: ${ADMIN_EMAIL}\n` +
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


function isSafePublicHttpUrl(raw) {
  try {
    const u = new URL(String(raw).trim());
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    const host = (u.hostname || '').toLowerCase();
    if (!host || host === 'localhost' || host.endsWith('.local')) return false;
    if (
      host === '127.0.0.1' ||
      host === '0.0.0.0' ||
      host === '::1' ||
      host.startsWith('10.') ||
      host.startsWith('192.168.') ||
      host.startsWith('169.254.') ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

function stripHtml(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchWikipediaSummary(topic) {
  const title = encodeURIComponent(String(topic).trim().replace(/\s+/g, '_'));
  for (const lang of ['en', 'si']) {
    const api = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${title}`;
    try {
      const r = await fetch(api, {
        headers: { Accept: 'application/json', 'User-Agent': 'PasiyaMaxQueenBot/2.6 (Telegram; educational)' },
        signal: AbortSignal.timeout(12000),
      });
      if (!r.ok) continue;
      const j = await r.json();
      if (j.type === 'disambiguation') {
        return {
          ok: true,
          text:
            `Wikipedia (${lang}) disambiguation for "${topic}".\n` +
            `Try a more specific title.\n${j.content_urls?.desktop?.page || ''}`,
        };
      }
      const extract = j.extract || j.description || '';
      if (!extract) continue;
      const url = j.content_urls?.desktop?.page || `https://${lang}.wikipedia.org/wiki/${title}`;
      return {
        ok: true,
        text: `WIKI (${lang.toUpperCase()})\n${j.title || topic}\n\n${extract.slice(0, 1200)}\n\n${url}`,
      };
    } catch (_) {}
  }
  return { ok: false, error: 'No Wikipedia summary found. Try another spelling.' };
}

async function fetchPublicPageText(url) {
  if (!isSafePublicHttpUrl(url)) {
    return { ok: false, error: 'Only public http(s) URLs allowed.' };
  }
  try {
    const r = await fetch(url, {
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'User-Agent': 'PasiyaMaxQueenBot/2.6 (Telegram; summary-only)',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(12000),
    });
    if (!r.ok) return { ok: false, error: `HTTP ${r.status}` };
    const ct = (r.headers.get('content-type') || '').toLowerCase();
    if (!ct.includes('text') && !ct.includes('html') && !ct.includes('json')) {
      return { ok: false, error: 'Unsupported content type' };
    }
    const body = await r.text();
    const text = stripHtml(body).slice(0, 8000);
    if (text.length < 40) return { ok: false, error: 'Page text too short or blocked' };
    return { ok: true, text, finalUrl: r.url || url };
  } catch (e) {
    return { ok: false, error: String(e?.message || e).slice(0, 120) };
  }
}



async function githubGetFile(path) {
  if (!GITHUB_TOKEN) return { ok: false, error: 'GITHUB_TOKEN missing' };
  const repo = GITHUB_REPO || 'pasindudananjaya92-bot/radiant-queen-pasiya-max-v2';
  const cleanPath = String(path || '').replace(/^\/+/, '').replace(/\.\./g, '');
  if (!cleanPath) return { ok: false, error: 'Invalid path' };
  const headers = {
    Authorization: `Bearer ${GITHUB_TOKEN}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  const res = await fetch(
    `https://api.github.com/repos/${repo}/contents/${cleanPath}`,
    { headers }
  );
  const text = await res.text();
  if (!res.ok) {
    return { ok: false, error: `HTTP ${res.status}: ${text.slice(0, 180)}` };
  }
  let j;
  try {
    j = JSON.parse(text);
  } catch {
    return { ok: false, error: 'Bad JSON from GitHub' };
  }
  if (Array.isArray(j)) {
    return { ok: false, error: 'Path is a directory. Use /ghlist ' + cleanPath };
  }
  if (j.encoding === 'base64' && j.content) {
    const buf = Buffer.from(j.content.replace(/\n/g, ''), 'base64');
    const isText = !/\.(png|jpg|jpeg|gif|webp|zip|pdf|exe|bin)$/i.test(cleanPath);
    return {
      ok: true,
      path: cleanPath,
      size: j.size,
      url: j.html_url,
      text: isText ? buf.toString('utf8') : null,
      binary: !isText,
      sha: j.sha,
    };
  }
  return { ok: false, error: 'Unsupported content' };
}

async function githubListPath(path) {
  if (!GITHUB_TOKEN) return { ok: false, error: 'GITHUB_TOKEN missing' };
  const repo = GITHUB_REPO || 'pasindudananjaya92-bot/radiant-queen-pasiya-max-v2';
  const cleanPath = String(path || '').replace(/^\/+/, '').replace(/\.\./g, '');
  const headers = {
    Authorization: `Bearer ${GITHUB_TOKEN}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  const url = cleanPath
    ? `https://api.github.com/repos/${repo}/contents/${cleanPath}`
    : `https://api.github.com/repos/${repo}/contents`;
  const res = await fetch(url, { headers });
  const text = await res.text();
  if (!res.ok) {
    return { ok: false, error: `HTTP ${res.status}: ${text.slice(0, 180)}` };
  }
  let j;
  try {
    j = JSON.parse(text);
  } catch {
    return { ok: false, error: 'Bad JSON' };
  }
  if (!Array.isArray(j)) {
    return {
      ok: true,
      lines: [`FILE ${j.name} (${j.size || 0} bytes)`],
      path: cleanPath || '/',
    };
  }
  const lines = j
    .slice(0, 40)
    .map((item) => {
      const tag = item.type === 'dir' ? 'DIR ' : 'FILE';
      return `${tag} ${item.name}${item.type === 'file' && item.size != null ? ` (${item.size})` : ''}`;
    });
  return { ok: true, lines, path: cleanPath || '/' };
}

async function githubPutFile(path, contentBuffer, message) {
  if (!GITHUB_TOKEN) {
    return { ok: false, error: 'GITHUB_TOKEN missing on Vercel' };
  }
  const repo = GITHUB_REPO || 'pasindudananjaya92-bot/radiant-queen-pasiya-max-v2';
  const cleanPath = String(path || '')
    .trim()
    .replace(/^\/+/, '')
    .replace(/\\/g, '/')
    .replace(/\.\./g, '')
    .slice(0, 240);
  if (!cleanPath || cleanPath.includes('..')) {
    return { ok: false, error: 'Invalid path' };
  }
  // Keep nested paths (lib/aiRouter.js) — encode each segment
  const encodedPath = cleanPath
    .split('/')
    .filter(Boolean)
    .map((seg) => encodeURIComponent(seg))
    .join('/');
  const headers = {
    Authorization: `Bearer ${GITHUB_TOKEN}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
  };
  let sha;
  try {
    const getRes = await fetch(
      `https://api.github.com/repos/${repo}/contents/${encodedPath}`,
      { headers }
    );
    if (getRes.ok) {
      const j = await getRes.json();
      sha = j.sha;
    }
  } catch (_) {}

  const body = {
    message: message || `bot: update ${cleanPath}`,
    content: contentBuffer.toString('base64'),
    branch: 'main',
  };
  if (sha) body.sha = sha;

  const putRes = await fetch(
    `https://api.github.com/repos/${repo}/contents/${encodedPath}`,
    { method: 'PUT', headers, body: JSON.stringify(body) }
  );
  const text = await putRes.text();
  if (!putRes.ok) {
    return {
      ok: false,
      error: `GitHub HTTP ${putRes.status}: ${text.slice(0, 200)}`,
    };
  }
  let html = '';
  try {
    html = JSON.parse(text)?.content?.html_url || '';
  } catch (_) {}
  return { ok: true, path: cleanPath, url: html, repo };
}


async function githubRecentCommits(limit = 5) {
  if (!GITHUB_TOKEN) return { ok: false, error: 'GITHUB_TOKEN missing' };
  const repo = GITHUB_REPO || 'pasindudananjaya92-bot/radiant-queen-pasiya-max-v2';
  const n = Math.max(1, Math.min(15, Number(limit) || 5));
  const headers = {
    Authorization: `Bearer ${GITHUB_TOKEN}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  const res = await fetch(
    `https://api.github.com/repos/${repo}/commits?per_page=${n}`,
    { headers }
  );
  const text = await res.text();
  if (!res.ok) {
    return { ok: false, error: `HTTP ${res.status}: ${text.slice(0, 180)}` };
  }
  let arr;
  try {
    arr = JSON.parse(text);
  } catch {
    return { ok: false, error: 'Bad JSON' };
  }
  const lines = (arr || []).map((c, i) => {
    const msg = (c.commit?.message || '').split('\n')[0].slice(0, 80);
    const who = c.commit?.author?.name || c.author?.login || '?';
    const sha = (c.sha || '').slice(0, 7);
    const when = c.commit?.author?.date || '';
    return `${i + 1}. ${sha} — ${msg}\n   ${who} · ${when.slice(0, 16)}`;
  });
  return { ok: true, lines, repo };
}


async function geocodePlace(name) {
  const q = encodeURIComponent(String(name).trim());
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${q}&count=1&language=en&format=json`;
  const r = await fetch(url, { signal: AbortSignal.timeout(12000) });
  if (!r.ok) return null;
  const j = await r.json();
  const hit = j?.results?.[0];
  if (!hit) return null;
  return {
    name: hit.name,
    country: hit.country || '',
    admin1: hit.admin1 || '',
    lat: hit.latitude,
    lon: hit.longitude,
  };
}


async function fetchForecast(lat, lon, days = 3) {
  const d = Math.max(1, Math.min(7, Number(days) || 3));
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max` +
    `&timezone=auto&forecast_days=${d}`;
  const r = await fetch(url, { signal: AbortSignal.timeout(12000) });
  if (!r.ok) return { ok: false, error: `HTTP ${r.status}` };
  const j = await r.json();
  const daily = j.daily || {};
  const dates = daily.time || [];
  const lines = dates.map((date, i) => {
    const code = daily.weather_code?.[i];
    const tmax = daily.temperature_2m_max?.[i];
    const tmin = daily.temperature_2m_min?.[i];
    const rain = daily.precipitation_sum?.[i];
    const wind = daily.wind_speed_10m_max?.[i];
    return `${date}: ${weatherCodeText(code)} · ${tmin}–${tmax}°C · rain ${rain}mm · wind ${wind}km/h`;
  });
  return { ok: true, timezone: j.timezone || '', lines };
}


async function fetchSun(lat, lon) {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&daily=sunrise,sunset,daylight_duration` +
    `&timezone=auto&forecast_days=1`;
  const r = await fetch(url, { signal: AbortSignal.timeout(12000) });
  if (!r.ok) return { ok: false, error: `HTTP ${r.status}` };
  const j = await r.json();
  const d = j.daily || {};
  return {
    ok: true,
    timezone: j.timezone || '',
    sunrise: d.sunrise?.[0] || '—',
    sunset: d.sunset?.[0] || '—',
    daylight: d.daylight_duration?.[0],
  };
}

async function fetchAqi(lat, lon) {
  const url =
    `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}` +
    `&current=european_aqi,pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,ozone` +
    `&timezone=auto`;
  const r = await fetch(url, { signal: AbortSignal.timeout(12000) });
  if (!r.ok) return { ok: false, error: `HTTP ${r.status}` };
  const j = await r.json();
  const c = j.current || {};
  return {
    ok: true,
    timezone: j.timezone || '',
    eaqi: c.european_aqi,
    pm10: c.pm10,
    pm25: c.pm2_5,
    co: c.carbon_monoxide,
    no2: c.nitrogen_dioxide,
    o3: c.ozone,
  };
}

function aqiLabel(eaqi) {
  const n = Number(eaqi);
  if (!Number.isFinite(n)) return 'Unknown';
  if (n <= 20) return 'Good';
  if (n <= 40) return 'Fair';
  if (n <= 60) return 'Moderate';
  if (n <= 80) return 'Poor';
  if (n <= 100) return 'Very poor';
  return 'Extremely poor';
}


function moonPhaseInfo(date = new Date()) {
  // Simple illuminated fraction / phase name (approx)
  const yp = date.getFullYear();
  const mp = date.getMonth();
  const dp = date.getDate();
  let r = yp % 100;
  r %= 19;
  if (r > 9) r -= 19;
  r = ((r * 11) % 30) + mp + dp;
  if (mp < 2) r += 2;
  const t = date.getHours() / 24;
  let age = (r + t) % 30;
  if (age < 0) age += 30;
  const names = [
    'New Moon',
    'Waxing Crescent',
    'First Quarter',
    'Waxing Gibbous',
    'Full Moon',
    'Waning Gibbous',
    'Last Quarter',
    'Waning Crescent',
  ];
  const idx = Math.min(7, Math.floor((age / 30) * 8));
  const illum = Math.round((1 - Math.cos((age / 30) * 2 * Math.PI)) * 50);
  return { age: age.toFixed(1), name: names[idx], illum };
}

async function fetchFxRate(base, symbols) {
  const b = String(base || 'USD').toUpperCase();
  const s = String(symbols || 'LKR').toUpperCase();
  // open.er-api.com free tier — includes LKR (Frankfurter/ECB does not)
  const url = `https://open.er-api.com/v6/latest/${encodeURIComponent(b)}`;
  const r = await fetch(url, { signal: AbortSignal.timeout(12000) });
  if (!r.ok) return { ok: false, error: `HTTP ${r.status}` };
  const j = await r.json();
  if (j.result && j.result !== 'success') {
    return { ok: false, error: j['error-type'] || 'API error' };
  }
  const rate = j?.rates?.[s];
  if (rate == null) {
    return { ok: false, error: `Symbol ${s} not found for base ${b}` };
  }
  const date =
    j.time_last_update_utc ||
    (j.time_last_update_unix
      ? new Date(j.time_last_update_unix * 1000).toISOString().slice(0, 10)
      : '');
  return {
    ok: true,
    base: j.base_code || b,
    symbol: s,
    rate,
    date,
  };
}

async function fetchWeather(lat, lon) {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m` +
    `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum` +
    `&timezone=auto&forecast_days=1`;
  const r = await fetch(url, { signal: AbortSignal.timeout(12000) });
  if (!r.ok) return { ok: false, error: `HTTP ${r.status}` };
  const j = await r.json();
  const c = j.current || {};
  const d = j.daily || {};
  return {
    ok: true,
    timezone: j.timezone || '',
    temp: c.temperature_2m,
    feels: c.apparent_temperature,
    humidity: c.relative_humidity_2m,
    precip: c.precipitation,
    wind: c.wind_speed_10m,
    code: c.weather_code,
    tmax: d.temperature_2m_max?.[0],
    tmin: d.temperature_2m_min?.[0],
    precipDay: d.precipitation_sum?.[0],
  };
}

function weatherCodeText(code) {
  const map = {
    0: 'Clear',
    1: 'Mainly clear',
    2: 'Partly cloudy',
    3: 'Overcast',
    45: 'Fog',
    48: 'Depositing rime fog',
    51: 'Light drizzle',
    61: 'Light rain',
    63: 'Rain',
    65: 'Heavy rain',
    71: 'Snow',
    80: 'Rain showers',
    95: 'Thunderstorm',
  };
  return map[code] || `Code ${code}`;
}


async function handleCurrencyCommand(ctx) {
  const raw = (ctx.message.text || '')
    .replace(/^\/currency(@\w+)?\s*/i, '')
    .trim()
    .toUpperCase();
  const parts = raw.split(/\s+/).filter(Boolean);
  if (parts.length < 2) {
    await ctx.reply(
      'Usage:\n/currency USD LKR\n/currency 100 USD LKR\n/currency EUR LKR'
    );
    return;
  }
  let amount = 1;
  let base;
  let sym;
  if (parts.length >= 3 && !Number.isNaN(parseFloat(parts[0]))) {
    amount = parseFloat(parts[0]);
    base = parts[1];
    sym = parts[2];
  } else {
    base = parts[0];
    sym = parts[1];
  }
  await ctx.sendChatAction('typing');
  const fx = await fetchFxRate(base, sym);
  if (!fx.ok) {
    await ctx.reply(`currency failed: ${fx.error}`);
    return;
  }
  const total = (amount * fx.rate).toFixed(4);
  await ctx.reply(
    `CURRENCY\n` +
      `${amount} ${fx.base} = ${total} ${fx.symbol}\n` +
      `Rate: 1 ${fx.base} = ${fx.rate} ${fx.symbol}\n` +
      `Date: ${fx.date}\n` +
      `(open.er-api.com free rates)`
  );
}

async function handleMoonCommand(ctx) {
  const info = moonPhaseInfo(new Date());
  await ctx.reply(
    `MOON\n` +
      `Phase: ${info.name}\n` +
      `Approx age: ${info.age} days\n` +
      `Illumination: ~${info.illum}%\n\n` +
      `Tip: Full moon nights can be brighter for evening easy runs.`
  );
}

async function handleSunCommand(ctx) {
  const place = (ctx.message.text || '')
    .replace(/^\/sun(@\w+)?\s*/i, '')
    .trim();
  if (!place) {
    await ctx.reply('Usage:\n/sun Colombo\n/sun Kotte');
    return;
  }
  await ctx.sendChatAction('typing');
  const geo = await geocodePlace(place);
  if (!geo) {
    await ctx.reply('Place not found.');
    return;
  }
  const s = await fetchSun(geo.lat, geo.lon);
  if (!s.ok) {
    await ctx.reply(`sun failed: ${s.error}`);
    return;
  }
  const label = [geo.name, geo.admin1, geo.country].filter(Boolean).join(', ');
  const dayH = s.daylight != null ? (Number(s.daylight) / 3600).toFixed(1) : '—';
  await ctx.reply(
    `SUN · ${label}\n` +
      `Sunrise: ${s.sunrise}\n` +
      `Sunset: ${s.sunset}\n` +
      `Daylight: ~${dayH} h\n` +
      `TZ: ${s.timezone}`
  );
}

async function handleAqiCommand(ctx) {
  const place = (ctx.message.text || '')
    .replace(/^\/aqi(@\w+)?\s*/i, '')
    .trim();
  if (!place) {
    await ctx.reply('Usage:\n/aqi Colombo\n/aqi Kotte');
    return;
  }
  await ctx.sendChatAction('typing');
  const geo = await geocodePlace(place);
  if (!geo) {
    await ctx.reply('Place not found.');
    return;
  }
  const a = await fetchAqi(geo.lat, geo.lon);
  if (!a.ok) {
    await ctx.reply(`aqi failed: ${a.error}`);
    return;
  }
  const label = [geo.name, geo.admin1, geo.country].filter(Boolean).join(', ');
  await ctx.reply(
    `AQI · ${label}\n` +
      `European AQI: ${a.eaqi} (${aqiLabel(a.eaqi)})\n` +
      `PM2.5: ${a.pm25} · PM10: ${a.pm10}\n` +
      `NO2: ${a.no2} · O3: ${a.o3} · CO: ${a.co}\n` +
      `TZ: ${a.timezone}`
  );
}


const GOLD_START = 400;
const GOLD_DAILY = 50;
const GOLD_DAILY_PREMIUM = 100; // P9 premium daily claim
const GOLD_COST = {
  ask: 5,
  vision: 10,
  voice: 10,
  stride: 5,
};

async function getOrCreateGold(userId, username) {
  const uid = Number(userId);
  if (!supabase || !Number.isFinite(uid)) {
    return { ok: false, gold: 0, premium: false, error: 'no_db' };
  }
  const { data, error } = await supabase
    .from('rq_gold')
    .select('user_id, username, gold, premium, last_daily')
    .eq('user_id', uid)
    .maybeSingle();
  if (error) {
    return { ok: false, gold: 0, premium: false, error: error.message };
  }
  if (data) {
    return {
      ok: true,
      gold: Number(data.gold) || 0,
      premium: !!data.premium,
      last_daily: data.last_daily || null,
      username: data.username || username || null,
    };
  }
  const row = {
    user_id: uid,
    username: username || null,
    gold: GOLD_START,
    premium: false,
    last_daily: null,
    updated_at: new Date().toISOString(),
  };
  const { error: insErr } = await supabase.from('rq_gold').upsert(row, {
    onConflict: 'user_id',
  });
  if (insErr) {
    return { ok: false, gold: 0, premium: false, error: insErr.message };
  }
  return {
    ok: true,
    gold: GOLD_START,
    premium: false,
    last_daily: null,
    username: username || null,
    newUser: true,
  };
}

async function setGold(userId, gold, extra = {}) {
  const uid = Number(userId);
  if (!supabase || !Number.isFinite(uid)) return { ok: false };
  const payload = {
    user_id: uid,
    gold: Math.max(0, Math.floor(Number(gold) || 0)),
    updated_at: new Date().toISOString(),
    ...extra,
  };
  const { error } = await supabase.from('rq_gold').upsert(payload, {
    onConflict: 'user_id',
  });
  return { ok: !error, error: error?.message };
}

/** Founder = free. Returns { ok, gold, need } */

async function logEvent(userId, event, meta) {
  if (!supabase) return;
  try {
    await supabase.from('rq_events').insert({
      user_id: userId ? Number(userId) : null,
      event: String(event || 'unknown').slice(0, 80),
      meta: meta || null,
    });
  } catch (_) {}
}

async function spendGold(ctx, costKey) {
  if (isAdmin(ctx)) {
    return { ok: true, gold: null, free: true };
  }
  const cost = GOLD_COST[costKey] || 0;
  if (cost <= 0) return { ok: true, gold: null, free: true };
  const uid = ctx.from?.id;
  const g = await getOrCreateGold(uid, ctx.from?.username || ctx.from?.first_name);
  if (!g.ok) {
    // fail open if DB missing so bot still works
    return { ok: true, gold: null, free: true, dbError: g.error };
  }
  if (g.premium) return { ok: true, gold: g.gold, free: true };
  if (g.gold < cost) {
    return {
      ok: false,
      gold: g.gold,
      need: cost,
      message:
        `Not enough Radiant Gold.\n` +
        `Balance: ${g.gold} · Need: ${cost}\n` +
        `/daily for +${GOLD_DAILY} · /balance`,
    };
  }
  const next = g.gold - cost;
  await setGold(uid, next, {
    username: ctx.from?.username || ctx.from?.first_name || null,
  });
  return { ok: true, gold: next, spent: cost };
}


/** Multi-tenant: user-owned Telegram bots powered by Radiant Queen engine */
async function saveUserBot(ownerId, token, meta = {}) {
  if (!supabase) return { ok: false, error: 'Supabase missing' };
  const uid = Number(ownerId);
  const { error } = await supabase.from('rq_user_bots').upsert(
    {
      owner_id: uid,
      bot_token: token,
      bot_id: meta.bot_id || null,
      bot_username: meta.bot_username || null,
      bot_name: meta.bot_name || null,
      is_active: true,
      webhook_set: !!meta.webhook_set,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'owner_id' }
  );
  return { ok: !error, error: error?.message };
}

async function getUserBot(ownerId) {
  if (!supabase) return null;
  const uid = Number(ownerId);
  let { data, error } = await supabase
    .from('rq_user_bots')
    .select('*')
    .eq('owner_id', uid)
    .maybeSingle();
  if (!data && !error) {
    const q2 = await supabase
      .from('rq_user_bots')
      .select('*')
      .eq('owner_id', String(ownerId))
      .maybeSingle();
    data = q2.data || null;
  }
  return data || null;
}

async function getUserBotByOwnerKey(ownerKey) {
  if (!supabase) return null;
  const { data } = await supabase
    .from('rq_user_bots')
    .select('*')
    .eq('owner_id', Number(ownerKey))
    .eq('is_active', true)
    .maybeSingle();
  return data || null;
}

async function deleteUserBot(ownerId) {
  if (!supabase) return { ok: false };
  const row = await getUserBot(ownerId);
  if (row?.bot_token) {
    try {
      await fetch(
        `https://api.telegram.org/bot${row.bot_token}/deleteWebhook?drop_pending_updates=true`
      );
    } catch (_) {}
  }
  const { error } = await supabase
    .from('rq_user_bots')
    .delete()
    .eq('owner_id', Number(ownerId));
  return { ok: !error, error: error?.message };
}

async function telegramGetMe(token) {
  const r = await fetch(`https://api.telegram.org/bot${token}/getMe`);
  const j = await r.json();
  if (!j.ok) return { ok: false, error: j.description || 'getMe failed' };
  return {
    ok: true,
    bot_id: j.result.id,
    bot_username: j.result.username,
    bot_name: j.result.first_name,
  };
}

async function telegramSetWebhook(token, url) {
  const r = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url,
      drop_pending_updates: true,
      allowed_updates: ['message', 'callback_query'],
    }),
  });
  const j = await r.json();
  return { ok: !!j.ok, error: j.description, result: j };
}


async function setTenantWelcome(ownerId, text) {
  if (!supabase) return { ok: false, error: 'no db' };
  const { error } = await supabase
    .from('rq_user_bots')
    .update({
      welcome_text: String(text || '').slice(0, 1500),
      updated_at: new Date().toISOString(),
    })
    .eq('owner_id', Number(ownerId));
  return { ok: !error, error: error?.message };
}

async function generateReply(prompt, ctx, imageBase64, mimeType) {
  let personaId = 'default';
  try {
    personaId = await getUserPersona(ctx?.from?.id);
  } catch (_) {}
  let personaBlock = '';
  try {
    const { personaSystemBlock } = await import('../lib/personas.js');
    personaBlock = personaSystemBlock(personaId);
  } catch (_) {
    personaBlock = `You are Pasiya AI, assistant of Pasiya Max, for RADIANT QUEEN.
Answer in the user's language (Sinhala or English). Be practical. No fake supercomputer stats.`;
  }
  const systemInstructionBase = `${personaBlock}
${identityLine(ctx)}
Persona mode: ${personaId}
Official links when asked:
${LINKS}`;

  // P2: short conversation memory
  let memoryBlock = '';
  const memUserId = ctx?.from?.id;
  try {
    if (memUserId && !imageBase64) {
      const { loadMemoryBlock } = await import('../lib/memory.js');
      memoryBlock = await loadMemoryBlock(supabase, memUserId, 8);
    }
  } catch (_) {}
  const systemInstruction = memoryBlock
    ? systemInstructionBase + '\n\nRecent chat memory:\n' + memoryBlock
    : systemInstructionBase;

  async function rememberTurn(userText, assistantText) {
    try {
      if (!memUserId || imageBase64) return;
      const { saveMemoryTurn } = await import('../lib/memory.js');
      await saveMemoryTurn(supabase, memUserId, userText, assistantText);
    } catch (_) {}
  }

  const looksLikeError = (t) => {
    const low = String(t || '').toLowerCase();
    return (
      low.includes('high demand') ||
      low.includes('experiencing high') ||
      low.includes('rate limit') ||
      low.includes('resource_exhausted') ||
      low.includes('ai error:') ||
      low.includes('temporarily unavailable') ||
      low.includes('no ai provider') ||
      low.startsWith('ai vision error')
    );
  };

  // Vision / image → Gemini SDK only
  if (imageBase64 && mimeType) {
    const ai = getAI();
    if (!ai) {
      return 'Image AI needs GEMINI_API_KEY. Text chat can use Groq/OpenRouter if configured.';
    }
    const parts = [
      { text: prompt },
      { inlineData: { data: imageBase64, mimeType } },
    ];
    const models = geminiModelCandidates();
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
        if (text && !looksLikeError(text)) return text.slice(0, 3500);
      } catch (err) {
        lastErr = err;
        const msg = String(err?.message || err).toLowerCase();
        if (msg.includes('404') || msg.includes('not found') || msg.includes('no longer available')) continue;
        if (msg.includes('429') || msg.includes('quota') || msg.includes('high demand')) continue;
        continue;
      }
    }
    return `AI vision error: ${String(lastErr?.message || lastErr).slice(0, 120)}`;
  }

  /*
   * TEXT FLOW (P1c stable):
   * 1) Redis cache (skip if poisoned error text)
   * 2) lib/aiRouter.js routeTextAI: Groq (retry) → OpenRouter → Gemini REST
   * 3) Emergency inline OpenRouter + Gemini if router throws/empty
   * 4) Friendly message + /tools — never raw-only 503
   */
  const userPrompt = String(prompt || '');

  // 1) cache
  try {
    const { getCached } = await import('../lib/aiCache.js');
    const hit = await getCached(userPrompt, personaId);
    if (hit && !looksLikeError(hit)) {
      resolvedModel = 'cache';
      return hit.slice(0, 3500);
    }
  } catch (_) {}

  // 2) main router
  let routerErr = null;
  try {
    const { routeTextAI } = await import('../lib/aiRouter.js');
    const { text, provider } = await routeTextAI({
      system: systemInstruction,
      user: userPrompt,
    });
    if (text && !looksLikeError(text)) {
      if (provider) resolvedModel = provider;
      try {
        const { setCached } = await import('../lib/aiCache.js');
        await setCached(userPrompt, text, personaId);
      } catch (_) {}
      await rememberTurn(userPrompt, text);
      return text.slice(0, 3500);
    }
  } catch (err) {
    routerErr = err;
  }

  // 3a) Emergency OpenRouter (if key present)
  const orKey = process.env.OPENROUTER_API_KEY || '';
  if (orKey) {
    const orModels = [
      process.env.OPENROUTER_MODEL || 'meta-llama/llama-3.3-70b-instruct:free',
      'google/gemma-2-9b-it:free',
      'mistralai/mistral-7b-instruct:free',
    ];
    for (const model of orModels) {
      try {
        const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${orKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': process.env.APP_URL || 'https://radiant-queen-pasiya-max-v2.vercel.app',
            'X-Title': 'Radiant Queen Pasiya Max',
          },
          body: JSON.stringify({
            model,
            temperature: 0.7,
            max_tokens: 1200,
            messages: [
              { role: 'system', content: systemInstruction },
              { role: 'user', content: userPrompt },
            ],
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) continue;
        const text = String(data?.choices?.[0]?.message?.content || '').trim();
        if (text && !looksLikeError(text)) {
          resolvedModel = 'openrouter';
          try {
            const { setCached } = await import('../lib/aiCache.js');
            await setCached(userPrompt, text, personaId);
          } catch (_) {}
          await rememberTurn(userPrompt, text);
          return text.slice(0, 3500);
        }
      } catch (_) {
        continue;
      }
    }
  }

  // 3b) Emergency Gemini REST
  const gKey = process.env.GEMINI_API_KEY || GEMINI_KEY || '';
  if (gKey) {
    for (const model of geminiModelCandidates()) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(gKey)}`;
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: systemInstruction }] },
            contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
            generationConfig: { temperature: 0.7, maxOutputTokens: 1200 },
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) continue;
        const text = (data?.candidates?.[0]?.content?.parts || [])
          .map((p) => p.text || '')
          .join('')
          .trim();
        if (text && !looksLikeError(text)) {
          resolvedModel = model;
          try {
            const { setCached } = await import('../lib/aiCache.js');
            await setCached(userPrompt, text, personaId);
          } catch (_) {}
          return text.slice(0, 3500);
        }
      } catch (_) {
        continue;
      }
    }
  }

  // 4) friendly fail — never dump raw 503 alone
  const hint = routerErr ? String(routerErr.message || routerErr).slice(0, 100) : 'providers busy';
  return (
    `AI is busy right now (free-tier limits).\n` +
    `Tried: Groq → OpenRouter → Gemini.\n` +
    `(${hint})\n\n` +
    `Free tools still work:\n` +
    `/tools · /weather Colombo · /currency USD LKR\n` +
    `/persona status · /daily · /balance\n` +
    `Retry /ask in ~30s.`
  );
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

  if (mode === 'ocr') {
    pendingTool.delete(uid);
    const out = await generateReply(
      'Extract all readable text from this image (OCR). Preserve line breaks when useful. ' +
        'If little text, say so. Then one-line summary.\n\nUser note: ' + (caption || '(none)'),
      ctx,
      b64,
      mime
    );
    await ctx.reply(('OCR\n\n' + out).slice(0, 3500), afterReplyKeyboard(ctx));
    return;
  }

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

  bot.use(async (ctx, next) => {
    try { trackGroupUser(ctx); } catch (_) {}
    return next();
  });

  bot.start(async (ctx) => {
    try {
      await getOrCreateGold(ctx.from.id, ctx.from.username || ctx.from.first_name);
    } catch (_) {}
    try {
      const isGroup =
        ctx.chat?.type === 'group' || ctx.chat?.type === 'supergroup';

      if (isGroup) {
        await sendMenuSmart(
          ctx,
          `RADIANT QUEEN is active in this group.

` +
            numberedMainMenuText(),
          mainMenuKeyboard(ctx)
        );
        return;
      }

      // Phase 6 deep links: /start pack_club | /start market
      let startPayload = '';
      try {
        const t = ctx.message?.text || '';
        const parts = t.trim().split(/\s+/);
        if (parts.length > 1) startPayload = parts.slice(1).join(' ').trim();
      } catch (_) {}
      const deep = typeof parseStartPayload === 'function' ? parseStartPayload(startPayload) : null;
      if (deep && deep.type === 'market') {
        try {
          await getOrCreateGold(ctx.from.id, ctx.from.username || ctx.from.first_name);
        } catch (_) {}
        const st = await getOwnerFactoryState(ctx.from.id);
        await uiReply(ctx, marketText(st), marketKeyboard());
        return;
      }
      if (deep && deep.type === 'pack' && deep.id) {
        try {
          await getOrCreateGold(ctx.from.id, ctx.from.username || ctx.from.first_name);
        } catch (_) {}
        const p = MARKET_PACKS.find((x) => x.id === deep.id);
        const title = p ? p.emoji + ' ' + p.title : deep.id;
        await ctx.reply(
          'Pack link: ' +
            title +
            '\n\n' +
            (p ? p.blurb + '\n' : '') +
            'Flags: ' +
            (p && p.flags ? p.flags : '') +
            '\n\n' +
            'Tap Apply to set this pack on your tenant bot.\n' +
            'New here? /setbot first, then apply.\n\n' +
            'Share link:\n' +
            packStartLink(deep.id),
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: '✅ Apply ' + deep.id, callback_data: 'mkt_apply_' + deep.id }],
                [{ text: '🏪 Marketplace', callback_data: 'mkt_home' }],
                [{ text: '🎁 Share this pack', callback_data: 'mkt_share_' + deep.id }],
              ],
            },
          }
        );
        return;
      }

      // P3 referral deep link: /start ref_USERID
      if (deep && deep.type === 'ref' && deep.id) {
        try {
          await getOrCreateGold(ctx.from.id, ctx.from.username || ctx.from.first_name);
          const { applyReferral } = await import('../lib/referral.js');
          const r = await applyReferral(supabase, {
            referrerId: deep.id,
            referredId: ctx.from.id,
            setGold,
            getOrCreateGold,
          });
          if (r.ok) {
            await ctx.reply(
              '🎁 Referral bonus!\n' +
                '+' +
                r.referredBonus +
                ' gold for you\n' +
                '+' +
                r.referrerBonus +
                ' gold for your friend\n' +
                '/balance · /ref'
            );
          } else if (r.error === 'already') {
            await ctx.reply('Referral already claimed for this account. /balance');
          } else if (r.error === 'self') {
            await ctx.reply('You cannot refer yourself. Share /ref with friends.');
          }
        } catch (e) {
          console.error('referral', e);
        }
      }

      const who = isAdmin(ctx)
        ? 'Ayubowan Nirmathru Pasiya Max'
        : `Hello ${ctx.from?.first_name || 'there'}`;
      await sendMenuSmart(
        ctx,
        `${who}\n\n` + numberedMainMenuText(),
        mainMenuKeyboard(ctx)
      );
    } catch (err) {
      console.error('start', err);
      try {
        await uiReply(ctx, 'Welcome. Use /help or the buttons.', mainMenuKeyboard(ctx));
      } catch (_) {}
    }
  });

  bot.command('menu', async (ctx) => {
    await sendMenuSmart(ctx, numberedMainMenuText(), mainMenuKeyboard(ctx));
  });

  bot.command('help', async (ctx) => {
    await uiReply(ctx, `Commands\n` +
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
        `Send a photo anytime for vision.`, mainMenuKeyboard(ctx));
  });

  bot.command(['persona', 'mood', 'tone'], async (ctx) => {
    try {
      const { normalizePersona, listPersonasText } = await import('../lib/personas.js');
      const raw = (ctx.message?.text || '').trim();
      const arg = raw.split(/\s+/).slice(1).join(' ').trim().toLowerCase();
      const uid = ctx.from?.id;

      if (!arg || arg === 'help' || arg === 'list') {
        const cur = await getUserPersona(uid);
        await ctx.reply(
          listPersonasText() + `\n\nCurrent: ${cur}\n` +
            `Try: /persona coach\nThen: /ask give me a 5k plan`
        );
        return;
      }
      if (arg === 'status' || arg === 'me' || arg === 'show') {
        const cur = await getUserPersona(uid);
        await ctx.reply(`Your AI persona: ${cur}\nChange: /persona <mode>\nList: /persona`);
        return;
      }

      const p = normalizePersona(arg);
      if (!p) {
        await ctx.reply('Unknown persona.\n\n' + listPersonasText());
        return;
      }
      const res = await setUserPersona(uid, p);
      const dbNote = res.db ? 'saved to Supabase' : (supabase ? 'memory only (table?)' : 'memory only');
      await ctx.reply(
        `Persona set: ${res.persona}\n(${dbNote})\n\n` +
          `Next AI replies use this style.\nTest: /ask hi`
      );
    } catch (err) {
      await ctx.reply('persona failed: ' + String(err?.message || err).slice(0, 120));
    }
  });

  bot.command(['aistatus', 'ailog'], async (ctx) => {
    if (!isAdmin(ctx)) {
      await ctx.reply('Founder only.');
      return;
    }
    try {
      const { getAiProviderStatus } = await import('../lib/aiRouter.js');
      const s = getAiProviderStatus();
      await ctx.reply(
        `AI STATUS (founder)\n` +
          `Keys: groq=${s.groq} openrouter=${s.openrouter} gemini=${s.gemini}\n` +
          `Last provider: ${s.lastProvider || '—'}\n` +
          `Last error: ${s.lastError || '—'}\n` +
          `Log:\n${(s.log || []).join('\n') || '(empty)'}`
      );
    } catch (e) {
      await ctx.reply('aistatus failed: ' + String(e?.message || e).slice(0, 120));
    }
  });




  
  // ===== v3.5 GROUP POWER + BANNER =====
  bot.command(['contact', 'owner', 'call'], async (ctx) => {
    await uiReply(
      ctx,
      '📞 CONTACT OWNER\n\n' +
        'WhatsApp / Call:\n' +
        '• 0759570743\n' +
        '• 0707751710\n\n' +
        'Tap buttons below.',
      contactOwnerKeyboard()
    );
  });

  bot.action('tap_contact', async (ctx) => {
    await ctx.answerCbQuery();
    await uiReply(
      ctx,
      '📞 CONTACT OWNER\n\n• 0759570743\n• 0707751710',
      contactOwnerKeyboard()
    );
  });

  bot.command(['setbanner'], async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    const photo = ctx.message?.reply_to_message?.photo;
    if (!photo || !photo.length) {
      await ctx.reply('Reply to a photo with /setbanner (founder only).');
      return;
    }
    const fileId = photo[photo.length - 1].file_id;
    const r = await setBotSetting('banner_file_id', fileId);
    await ctx.reply(r.ok ? 'Banner saved. Next /menu will prefer this photo (when sendPhoto path is used).' : 'Saved in memory only: ' + (r.error || ''));
  });

  bot.command(['banner'], async (ctx) => {
    const id = await getBotSetting('banner_file_id');
    if (!id) {
      await ctx.reply('No custom banner yet. Reply to a photo with /setbanner');
      return;
    }
    try {
      await ctx.replyWithPhoto(id, { caption: 'Current banner' });
    } catch (e) {
      await ctx.reply('Banner file_id stored but send failed: ' + (e.message || e));
    }
  });

  bot.command(['resetbanner'], async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    await setBotSetting('banner_file_id', null);
    await ctx.reply('Banner reset (text digital frame).');
  });

  bot.command(['testwelcome'], async (ctx) => {
    const name = ctx.from?.first_name || 'Member';
    const w = await getBotSetting('welcome_text_global');
    const photo = await getBotSetting('welcome_photo_id');
    const caption =
      (w || 'Welcome to RADIANT QUEEN · PASIYA MAX group 👑') +
      '\n\nHi ' + name + '!';
    try {
      if (photo) await ctx.replyWithPhoto(photo, { caption: caption.slice(0, 1024) });
      else await ctx.reply(caption);
    } catch (e) {
      await ctx.reply(caption);
    }
  });

  bot.command(['setwelcomemedia'], async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    const rep = ctx.message?.reply_to_message;
    if (!rep) {
      await ctx.reply('Reply to a photo with /setwelcomemedia (optional caption becomes welcome text).');
      return;
    }
    if (rep.photo?.length) {
      await setBotSetting('welcome_photo_id', rep.photo[rep.photo.length - 1].file_id);
    }
    if (rep.caption || (ctx.message.text || '').split(' ').slice(1).join(' ')) {
      const t = rep.caption || (ctx.message.text || '').split(' ').slice(1).join(' ');
      await setBotSetting('welcome_text_global', t);
    }
    await ctx.reply('Welcome media/text saved. Use /testwelcome');
  });

  bot.command(['nowelcome'], async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    await setBotSetting('welcome_photo_id', null);
    await setBotSetting('welcome_text_global', null);
    await ctx.reply('Custom global welcome media cleared (group /setwelcome still works).');
  });

  bot.command(['kick'], async (ctx) => {
    if (!(await requireFeature(ctx, 'group', 'Group pack'))) return;
    if (!(await requireAdmin(ctx))) return;
    if (ctx.chat?.type !== 'group' && ctx.chat?.type !== 'supergroup') {
      await ctx.reply('Use in a group.');
      return;
    }
    const target = await resolveTargetUser(ctx);
    if (!target?.id) {
      await ctx.reply('Reply to a user message with /kick');
      return;
    }
    try {
      await ctx.telegram.banChatMember(ctx.chat.id, target.id);
      await ctx.telegram.unbanChatMember(ctx.chat.id, target.id, { only_if_banned: true });
      await ctx.reply('Kicked user ' + target.id);
    } catch (e) {
      await ctx.reply('kick failed: ' + (e.message || e));
    }
  });

  bot.command(['ban'], async (ctx) => {
    if (!(await requireFeature(ctx, 'group', 'Group pack'))) return;
    if (!(await requireAdmin(ctx))) return;
    const target = await resolveTargetUser(ctx);
    if (!target?.id) {
      await ctx.reply('Reply to a user with /ban');
      return;
    }
    try {
      await ctx.telegram.banChatMember(ctx.chat.id, target.id);
      await ctx.reply('Banned ' + target.id);
    } catch (e) {
      await ctx.reply('ban failed: ' + (e.message || e));
    }
  });

  bot.command(['unban'], async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    const target = await resolveTargetUser(ctx);
    if (!target?.id) {
      await ctx.reply('Reply to a user with /unban (or /unban <id>)');
      return;
    }
    try {
      await ctx.telegram.unbanChatMember(ctx.chat.id, target.id, { only_if_banned: true });
      await ctx.reply('Unbanned ' + target.id);
    } catch (e) {
      await ctx.reply('unban failed: ' + (e.message || e));
    }
  });

  bot.command(['pin'], async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    const mid = ctx.message?.reply_to_message?.message_id;
    if (!mid) {
      await ctx.reply('Reply to a message with /pin');
      return;
    }
    try {
      await ctx.telegram.pinChatMessage(ctx.chat.id, mid);
      await ctx.reply('Pinned.');
    } catch (e) {
      await ctx.reply('pin failed: ' + (e.message || e));
    }
  });

  bot.command(['unpin'], async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    try {
      await ctx.telegram.unpinChatMessage(ctx.chat.id);
      await ctx.reply('Unpinned.');
    } catch (e) {
      await ctx.reply('unpin failed: ' + (e.message || e));
    }
  });

  bot.command(['mute'], async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    const target = await resolveTargetUser(ctx);
    if (!target?.id) {
      await ctx.reply('Reply to a user with /mute');
      return;
    }
    try {
      const until = Math.floor(Date.now() / 1000) + 3600;
      await ctx.telegram.restrictChatMember(ctx.chat.id, target.id, {
        permissions: {
          can_send_messages: false,
          can_send_media_messages: false,
          can_send_other_messages: false,
          can_add_web_page_previews: false,
        },
        until_date: until,
      });
      await ctx.reply('Muted 1 hour: ' + target.id);
    } catch (e) {
      await ctx.reply('mute failed: ' + (e.message || e));
    }
  });

  bot.command(['unmute'], async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    const target = await resolveTargetUser(ctx);
    if (!target?.id) {
      await ctx.reply('Reply to a user with /unmute');
      return;
    }
    try {
      await ctx.telegram.restrictChatMember(ctx.chat.id, target.id, {
        permissions: {
          can_send_messages: true,
          can_send_media_messages: true,
          can_send_other_messages: true,
          can_add_web_page_previews: true,
          can_send_polls: true,
          can_invite_users: true,
        },
      });
      await ctx.reply('Unmuted: ' + target.id);
    } catch (e) {
      await ctx.reply('unmute failed: ' + (e.message || e));
    }
  });

  bot.command(['promote'], async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    const target = await resolveTargetUser(ctx);
    if (!target?.id) {
      await ctx.reply('Reply to a user with /promote');
      return;
    }
    try {
      await ctx.telegram.promoteChatMember(ctx.chat.id, target.id, {
        can_manage_chat: true,
        can_delete_messages: true,
        can_restrict_members: true,
        can_invite_users: true,
        can_pin_messages: true,
      });
      await ctx.reply('Promoted: ' + target.id);
    } catch (e) {
      await ctx.reply('promote failed: ' + (e.message || e));
    }
  });

  bot.command(['demote'], async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    const target = await resolveTargetUser(ctx);
    if (!target?.id) {
      await ctx.reply('Reply to a user with /demote');
      return;
    }
    try {
      await ctx.telegram.promoteChatMember(ctx.chat.id, target.id, {
        can_manage_chat: false,
        can_delete_messages: false,
        can_restrict_members: false,
        can_invite_users: false,
        can_pin_messages: false,
        can_promote_members: false,
        can_change_info: false,
        can_manage_video_chats: false,
      });
      await ctx.reply('Demoted: ' + target.id);
    } catch (e) {
      await ctx.reply('demote failed: ' + (e.message || e));
    }
  });

  bot.command(['settitle'], async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    const target = ctx.message?.reply_to_message?.from;
    const title = (ctx.message?.text || '').split(/\s+/).slice(1).join(' ').trim();
    if (!target?.id || !title) {
      await ctx.reply('Reply to admin with /settitle Custom Title');
      return;
    }
    try {
      await ctx.telegram.setChatAdministratorCustomTitle(ctx.chat.id, target.id, title.slice(0, 16));
      await ctx.reply('Title set.');
    } catch (e) {
      await ctx.reply('settitle failed: ' + (e.message || e));
    }
  });

  bot.command(['setgtitle'], async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    const title = (ctx.message?.text || '').split(/\s+/).slice(1).join(' ').trim();
    if (!title) {
      await ctx.reply('Usage: /setgtitle New Group Name');
      return;
    }
    try {
      await ctx.telegram.setChatTitle(ctx.chat.id, title);
      await ctx.reply('Group title updated.');
    } catch (e) {
      await ctx.reply('setgtitle failed: ' + (e.message || e));
    }
  });

  bot.command(['setgphoto'], async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    const photo = ctx.message?.reply_to_message?.photo;
    if (!photo?.length) {
      await ctx.reply('Reply to a photo with /setgphoto');
      return;
    }
    try {
      await ctx.telegram.setChatPhoto(ctx.chat.id, photo[photo.length - 1].file_id);
      await ctx.reply('Group photo updated.');
    } catch (e) {
      await ctx.reply('setgphoto failed: ' + (e.message || e));
    }
  });

  bot.command(['invitelink', 'link'], async (ctx) => {
    try {
      const link = await ctx.telegram.exportChatInviteLink(ctx.chat.id);
      await ctx.reply('Invite link:\n' + link);
    } catch (e) {
      try {
        const inv = await ctx.telegram.createChatInviteLink(ctx.chat.id, {
          name: 'RadiantQueen',
          creates_join_request: false,
        });
        await ctx.reply('Invite link:\n' + inv.invite_link);
      } catch (e2) {
        await ctx.reply('invitelink failed: ' + (e2.message || e.message || e));
      }
    }
  });

  bot.action('tap_invitelink', async (ctx) => {
    await ctx.answerCbQuery();
    try {
      const link = await ctx.telegram.exportChatInviteLink(ctx.chat.id);
      await uiReply(ctx, '🔗 Invite link\n' + link, gadminKeyboard());
    } catch (e) {
      await uiReply(ctx, 'Invite failed: ' + (e.message || e) + '\nType /invitelink in group as admin.', gadminKeyboard());
    }
  });

  bot.command(['admins', 'tagadmins'], async (ctx) => {
    try {
      const admins = await ctx.telegram.getChatAdministrators(ctx.chat.id);
      const title = ctx.chat?.title || 'Group';
      const lines = ['👑 ADMINS - ' + title, ''];
      for (const a of admins) {
        const u = a.user;
        const name = [u.first_name, u.last_name].filter(Boolean).join(' ') || 'Admin';
        const uname = u.username ? ' @' + u.username : '';
        const role = a.status === 'creator' ? ' (owner)' : '';
        lines.push('• ' + name + uname + role);
        lines.push('  id: ' + u.id);
      }
      await ctx.reply(lines.join('\n'));
    } catch (e) {
      await ctx.reply('admins failed: ' + (e.message || e));
    }
  });

  bot.action('tap_tagadmins', async (ctx) => {
    await ctx.answerCbQuery();
    try {
      const admins = await ctx.telegram.getChatAdministrators(ctx.chat.id);
      const lines = ['👑 GROUP ADMINS'];
      for (const a of admins) {
        const u = a.user;
        const name = u.first_name || 'Admin';
        lines.push('• ' + (u.username ? '@' + u.username : name + ' (' + u.id + ')'));
      }
      await uiReply(ctx, lines.join('\n'), gadminKeyboard());
    } catch (e) {
      await uiReply(ctx, 'admins failed: ' + (e.message || e), gadminKeyboard());
    }
  });

  bot.command(['tagall', 'all', 'mentionall'], async (ctx) => {
    if (!(await requireFeature(ctx, 'group', 'Group pack'))) return;
    if (!(await requireAdmin(ctx))) return;
    const cid = String(ctx.chat.id);
    const map = groupActiveUsers.get(cid);
    const lines = ['📣 TAG ACTIVE MEMBERS', '(Users who talked recently — Bot API cannot list everyone)', ''];
    let i = 0;
    if (map) {
      for (const u of map.values()) {
        if (i >= 40) break;
        const mention = u.username ? '@' + u.username : u.name + ' (' + u.id + ')';
        lines.push('• ' + mention);
        i++;
      }
    }
    if (i === 0) lines.push('No active users tracked yet. Members must send a message first.');
    lines.push('', 'Admins: /admins');
    await ctx.reply(lines.join('\n').slice(0, 4000));
  });

  bot.action('tap_tagall', async (ctx) => {
    await ctx.answerCbQuery();
    const cid = String(ctx.chat.id);
    const map = groupActiveUsers.get(cid);
    const lines = ['📣 ACTIVE MEMBERS'];
    let i = 0;
    if (map) {
      for (const u of map.values()) {
        if (i >= 30) break;
        lines.push('• ' + (u.username ? '@' + u.username : u.name));
        i++;
      }
    }
    if (i === 0) lines.push('No tracked users yet.');
    await uiReply(ctx, lines.join('\n'), gadminKeyboard());
  });

  bot.command(['members', 'list'], async (ctx) => {
    try {
      const count = await ctx.telegram.getChatMemberCount(ctx.chat.id);
      const cid = String(ctx.chat.id);
      const map = groupActiveUsers.get(cid);
      const active = map ? map.size : 0;
      await ctx.reply(
        '👥 MEMBERS\nCount: ' + count + '\nTracked active: ' + active + '\n/admins · /tagall · /groupinfo'
      );
    } catch (e) {
      await ctx.reply('members failed: ' + (e.message || e));
    }
  });

  bot.command(['addmember'], async (ctx) => {
    await ctx.reply(
      'Telegram bots cannot force-add a phone number.\n\n' +
        '1) /invitelink — get invite link\n' +
        '2) Share link to the person\n' +
        '3) They join themselves\n\n' +
        'Contact owner: /contact'
    );
  });

  bot.command(['purge'], async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    const startId = ctx.message?.reply_to_message?.message_id;
    const endId = ctx.message?.message_id;
    if (!startId) {
      await ctx.reply('Reply to the first message to delete from, with /purge');
      return;
    }
    let deleted = 0;
    for (let id = startId; id <= endId; id++) {
      try {
        await ctx.telegram.deleteMessage(ctx.chat.id, id);
        deleted++;
      } catch (_) {}
    }
    await ctx.reply('Purge attempted. Deleted ~' + deleted);
  });


  
  
  // ===== v4.0 Bot Factory Phase 2 =====
  bot.command(['factory', 'studio', 'templates'], async (ctx) => {
    try {
      const templates = await listFactoryTemplates();
      const st = await getOwnerFactoryState(ctx.from.id);
      const lines = [
        'BOT FACTORY · STABLE v4.0',
        'Brand: RADIANT QUEEN · PASIYA MAX',
        '',
        'Your pack: ' + (st.template_id || 'none'),
        'Channel: ' + (st.version_channel || 'stable'),
        'Flags: ' + JSON.stringify(st.flags || {}),
        '',
        'Create flow:',
        '1) @BotFather → /newbot → token',
        '2) /setbot <token>',
        '3) /factoryapply club|shop|school|gold',
        '4) /mybot · /settenantwelcome',
        '',
        'Templates:',
      ];
      for (const t of templates) {
        lines.push('• ' + t.id + ' — ' + (t.name || '') + (t.description ? ' · ' + t.description : ''));
      }
      lines.push('');
      lines.push('/factoryapply <id> — apply flags to your tenant');
      lines.push('/factoryflags — show flags');
      lines.push('/factorychannel stable|beta — founder');
        lines.push('/factorywelcome — pack welcome → tenant');
        lines.push('/factorystatus · /factorybeta (beta)');
        lines.push('/market — template marketplace');
      lines.push('Studio: https://radiant-queen-pasiya-max-v2.vercel.app/bot/studio.html');
      await uiReply(ctx, lines.join('\n'), mainMenuKeyboard(ctx));
    } catch (e) {
      await ctx.reply('factory failed: ' + (e.message || e));
    }
  });

  bot.command(['factoryset', 'factoryapply'], async (ctx) => {
    try {
      const raw = (ctx.message?.text || '')
        .replace(/^\/(factoryset|factoryapply)(@\w+)?\s*/i, '')
        .trim()
        .toLowerCase();
      const id = (raw.split(/\s+/)[0] || '').trim();
      if (!id) {
        await ctx.reply('Usage: /factoryapply club|shop|school|gold');
        return;
      }
      // Anyone can apply pack to their own tenant; founder also ok
      const r = await applyFactoryToOwner(ctx.from.id, id, 'stable');
      if (!r.ok) {
        await ctx.reply('factoryapply failed: ' + (r.error || 'error'));
        return;
      }
      await ctx.reply(
        'Pack applied\n' +
          'Template: ' + r.template_id + (r.name ? ' (' + r.name + ')' : '') + '\n' +
          'Tenant: ' + r.bot_username + '\n' +
          'Channel: ' + r.version_channel + '\n' +
          'Flags: ' + JSON.stringify(r.flags) + '\n\n' +
          'group=' + !!r.flags.group + ' gold=' + !!r.flags.gold +
          ' stride=' + !!r.flags.stride + ' ai=' + !!r.flags.ai + '\n' +
          'Tenant welcome preset: ' + (r.welcome_applied ? 'yes' : 'no') +
          ' · commands: ' + (r.commands_set ? 'yes' : 'no') +
          (r.welcome_error ? ' (' + r.welcome_error + ')' : '') + '\n' +
          '/factoryflags · /factorywelcome · /factory'
      );
    } catch (e) {
      await ctx.reply('factoryapply failed: ' + (e.message || e));
    }
  });

  bot.command(['factoryflags', 'myflags'], async (ctx) => {
    try {
      const st = await getOwnerFactoryState(ctx.from.id);
      let botU = '';
      try {
        const row = await getUserBot(ctx.from.id);
        botU = row?.bot_username || '';
      } catch (_) {}
      await ctx.reply(
        'FACTORY FLAGS\n' +
          'Owner: ' + ctx.from.id + '\n' +
          'Tenant bot: ' + (botU ? '@' + botU : '(none)') + '\n' +
          'Template: ' + (st.template_id || 'none') + '\n' +
          'Channel: ' + (st.version_channel || 'stable') + '\n' +
          'Flags: ' + JSON.stringify(st.flags || {}) + '\n\n' +
          'Apply: /factoryapply club'
      );
    } catch (e) {
      await ctx.reply('factoryflags failed: ' + (e.message || e));
    }
  });

  bot.command(['factorychannel'], async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    const ch = (ctx.message?.text || '')
      .replace(/^\/factorychannel(@\w+)?\s*/i, '')
      .trim()
      .toLowerCase();
    if (ch !== 'stable' && ch !== 'beta') {
      await ctx.reply('Usage: /factorychannel stable|beta');
      return;
    }
    const st = await getOwnerFactoryState(ctx.from.id);
    const r = await setTenantTemplate(
      ctx.from.id,
      '',
      st.template_id || null,
      ch,
      st.flags || {}
    );
    await ctx.reply(r.ok ? 'Version channel set: ' + ch : 'failed: ' + (r.error || ''));
  });

  bot.command(['factorywelcome'], async (ctx) => {
    try {
      const st = await getOwnerFactoryState(ctx.from.id);
      const id = st.template_id;
      if (!id) {
        await ctx.reply('No pack yet. /factoryapply club first');
        return;
      }
      const r = await applyTemplateWelcome(ctx.from.id, id);
      if (!r.ok) {
        await ctx.reply('factorywelcome failed: ' + (r.error || ''));
        return;
      }
      await ctx.reply(
        'Tenant welcome set from pack: ' + id + '\n' +
          'Bot: @' + (r.bot_username || '') + '\n\n' +
          'Preview:\n' + String(r.welcome || '').slice(0, 500) + '\n\n' +
          'Test: open your tenant bot → /start'
      );
    } catch (e) {
      await ctx.reply('factorywelcome failed: ' + (e.message || e));
    }
  });

  bot.command(['factorystatus', 'factoryinfo'], async (ctx) => {
    try {
      const st = await getOwnerFactoryState(ctx.from.id);
      let botU = '';
      try {
        const row = await getUserBot(ctx.from.id);
        botU = row?.bot_username || '';
      } catch (_) {}
      const lines = [
        'FACTORY STATUS · Phase 3',
        'Owner: ' + ctx.from.id,
        'Tenant: ' + (botU ? '@' + botU : '(none)'),
        'Template: ' + (st.template_id || 'none'),
        'Channel: ' + (st.version_channel || 'stable'),
        'Flags: ' + JSON.stringify(st.flags || {}),
        '',
        'group=' + flagOn(st.flags, 'group'),
        'gold=' + flagOn(st.flags, 'gold'),
        'stride=' + flagOn(st.flags, 'stride'),
        'ai=' + flagOn(st.flags, 'ai'),
        '',
        'Beta features: ' + ((st.version_channel || '') === 'beta' || isAdmin(ctx) ? 'UNLOCKED' : 'locked'),
        '/factoryapply · /factorywelcome · /factorychannel',
      ];
      await uiReply(ctx, lines.join('\n'), mainMenuKeyboard(ctx));
    } catch (e) {
      await ctx.reply('factorystatus failed: ' + (e.message || e));
    }
  });

  bot.command(['factorybeta'], async (ctx) => {
    if (!(await requireBeta(ctx, 'factorybeta'))) return;
    await ctx.reply(
      'BETA LAB (Phase 3)\n\n' +
        'Unlocked because channel=beta or founder.\n' +
        '• /factorystatus — full pack pulse\n' +
        '• /factorywelcome — re-apply pack welcome to tenant\n' +
        '• /factorychannel stable — leave beta\n\n' +
        'Experimental ideas (coming):\n' +
        '• per-tenant tool menus\n' +
        '• pack marketplace cards\n' +
        '• auto /start keyboard on tenant bots'
    );
  });

  bot.command(['factorypreview'], async (ctx) => {
    if (!(await requireBeta(ctx, 'factorypreview'))) return;
    const st = await getOwnerFactoryState(ctx.from.id);
    await ctx.reply(
      'BETA PREVIEW\n' +
        'If this pack is public, users see:\n' +
        'Template: ' + (st.template_id || 'none') + '\n' +
        'AI: ' + flagOn(st.flags, 'ai') + '\n' +
        'Group tools: ' + flagOn(st.flags, 'group') + '\n' +
        'Gold: ' + flagOn(st.flags, 'gold') + '\n' +
        'Stride: ' + flagOn(st.flags, 'stride') + '\n\n' +
        'Tenant /start uses pack welcome when applied.'
    );
  });

  bot.command(['factorypacks', 'packs'], async (ctx) => {
    try {
      const lines = [
        'FACTORY PACKS · Phase 4',
        '',
        '🏃 club — Running Club (AI + group + gold + stride)',
        '🛒 shop — Shop helper (AI + gold)',
        '📚 school — Class / FAQ (AI + gold)',
        '💰 gold — Gold economy focus (AI + gold)',
        '',
        'Apply: /factoryapply club|shop|school|gold',
        'Welcome: /factorywelcome',
        'Status: /factorystatus',
        'Studio: https://radiant-queen-pasiya-max-v2.vercel.app/bot/studio.html',
      ];
      await uiReply(ctx, lines.join('\n'), mainMenuKeyboard(ctx));
    } catch (e) {
      await ctx.reply('factorypacks failed: ' + (e.message || e));
    }
  });

  bot.command(['market', 'factorymarket', 'marketplace'], async (ctx) => {
    try {
      const st = await getOwnerFactoryState(ctx.from.id);
      await uiReply(ctx, marketText(st), marketKeyboard());
    } catch (e) {
      await ctx.reply('market failed: ' + (e.message || e));
    }
  });

  bot.command(['invitepack', 'sharepack', 'packlink'], async (ctx) => {
    try {
      const arg = (ctx.message?.text || '')
        .replace(/^\/(invitepack|sharepack|packlink)(@\w+)?\s*/i, '')
        .trim()
        .toLowerCase();
      const id = ['club', 'shop', 'school', 'gold'].includes(arg)
        ? arg
        : (await getOwnerFactoryState(ctx.from.id)).template_id || 'club';
      const card = invitePackCard(id, ctx.from);
      await ctx.reply(card, {
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Open pack link', url: packStartLink(id) }],
            [{ text: '🏪 Marketplace', callback_data: 'mkt_home' }],
            [
              {
                text: '📤 Forward tip',
                callback_data: 'mkt_share_' + id,
              },
            ],
          ],
        },
      });
    } catch (e) {
      await ctx.reply('invitepack failed: ' + (e.message || e));
    }
  });

  bot.command(['invitemarket', 'sharemarket'], async (ctx) => {
    try {
      const link = marketStartLink();
      const text =
        `👑 RADIANT QUEEN · PASIYA MAX\n` +
        `Template Marketplace\n\n` +
        `Open: ${link}\n` +
        `Web: ${WEB_HUB}/bot/studio.html\n\n` +
        `Free packs: club · shop · school · gold\n` +
        `400 Radiant Gold on /start · /daily +50\n` +
        `— Share with friends`;
      await ctx.reply(text, {
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Open Marketplace', url: link }],
            [{ text: 'Web Studio', url: WEB_HUB + '/bot/studio.html' }],
          ],
        },
      });
    } catch (e) {
      await ctx.reply('invitemarket failed: ' + (e.message || e));
    }
  });

  bot.command(['sharelinks', 'publiclinks', 'deeplinks'], async (ctx) => {
    try {
      const lines = [
        '⚡ RADIANT QUEEN · PUBLIC SHARE LINKS',
        'Version: ' + (typeof BOT_VERSION !== 'undefined' ? BOT_VERSION : ''),
        '',
        'Marketplace:',
        marketStartLink(),
        '',
        'Pack deep links:',
        'club   ' + packStartLink('club'),
        'shop   ' + packStartLink('shop'),
        'school ' + packStartLink('school'),
        'gold   ' + packStartLink('gold'),
        '',
        'Web hub: ' + (typeof WEB_HUB !== 'undefined' ? WEB_HUB : 'https://radiant-queen-pasiya-max-v2.vercel.app') + '/bot/',
        'Studio:  ' + (typeof WEB_HUB !== 'undefined' ? WEB_HUB : 'https://radiant-queen-pasiya-max-v2.vercel.app') + '/bot/studio.html',
        '',
        'Commands: /invitepack club · /invitemarket · /market',
      ];
      await ctx.reply(lines.join('\n'), {
        reply_markup: {
          inline_keyboard: [
            [{ text: '🏪 Open market', url: marketStartLink() }],
            [{ text: '🏃 Share club pack', callback_data: 'mkt_share_club' }],
            [{ text: '🔗 Share market', callback_data: 'mkt_share_market' }],
          ],
        },
      });
    } catch (e) {
      await ctx.reply('sharelinks failed: ' + (e.message || e));
    }
  });





  bot.action(/^mkt_info_(club|shop|school|gold)$/, async (ctx) => {
    try {
      await ctx.answerCbQuery();
      const id = (ctx.match && ctx.match[1]) || '';
      await ctx.reply(packDetailText(id), {
        reply_markup: {
          inline_keyboard: [
            [{ text: '✅ Apply ' + id, callback_data: 'mkt_apply_' + id }],
            [{ text: '🏪 Marketplace', callback_data: 'mkt_home' }],
            [{ text: '🎁 Share pack', callback_data: 'mkt_share_' + id }],
          ],
        },
      });
    } catch (e) {
      try { await ctx.answerCbQuery('error'); } catch (_) {}
    }
  });

  bot.action(/^mkt_apply_(club|shop|school|gold)$/, async (ctx) => {
    try {
      await ctx.answerCbQuery('Applying…');
      const id = (ctx.match && ctx.match[1]) || '';
      const r = await applyFactoryToOwner(ctx.from.id, id);
      if (!r.ok) {
        await ctx.reply('Apply failed: ' + (r.error || 'error'));
        return;
      }
      await ctx.reply(
        '✅ Pack applied from Marketplace\n' +
          'Template: ' + r.template_id + (r.name ? ' (' + r.name + ')' : '') + '\n' +
          'Tenant: ' + r.bot_username + '\n' +
          'Channel: ' + r.version_channel + '\n' +
          'Flags: ' + JSON.stringify(r.flags) + '\n' +
          'Welcome: ' + (r.welcome_applied ? 'yes' : 'no') +
          ' · commands: ' + (r.commands_set ? 'yes' : 'no') + '\n\n' +
          'Open tenant bot → /start · /menu'
      );
    } catch (e) {
      try {
        await ctx.reply('Apply failed: ' + (e.message || e));
      } catch (_) {}
    }
  });

  bot.action(/^mkt_share_(club|shop|school|gold|market)$/, async (ctx) => {
    try {
      await ctx.answerCbQuery();
      const id = (ctx.match && ctx.match[1]) || 'club';
      if (id === 'market') {
        const link = marketStartLink();
        await ctx.reply(
          `Share Marketplace:\n${link}\n\nWeb: ${WEB_HUB}/bot/studio.html\n\nForward this message to friends.`
        );
        return;
      }
      const card = invitePackCard(id, ctx.from);
      await ctx.reply(card + '\n\n(Forward this message)');
    } catch (e) {
      try { await ctx.answerCbQuery('error'); } catch (_) {}
    }
  });



  bot.action('mkt_status', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      const st = await getOwnerFactoryState(ctx.from.id);
      let botU = '';
      try {
        const row = await getUserBot(ctx.from.id);
        botU = row?.bot_username || '';
      } catch (_) {}
      await ctx.reply(
        'Marketplace · My status\n' +
          'Tenant: ' + (botU ? '@' + botU : '(none — /setbot)') + '\n' +
          'Pack: ' + (st.template_id || 'none') + '\n' +
          'Channel: ' + (st.version_channel || 'stable') + '\n' +
          'Flags: ' + JSON.stringify(st.flags || {})
      );
    } catch (e) {
      try { await ctx.answerCbQuery('error'); } catch (_) {}
    }
  });

  bot.action(['mkt_home', 'mkt_menu'], async (ctx) => {
    try {
      await ctx.answerCbQuery();
      if (ctx.callbackQuery?.data === 'mkt_menu') {
        // open main menu text if possible
        try {
          await ctx.reply('Main menu: /menu');
        } catch (_) {}
        return;
      }
      const st = await getOwnerFactoryState(ctx.from.id);
      await ctx.reply(marketText(st), { reply_markup: marketKeyboard() });
    } catch (e) {
      try { await ctx.answerCbQuery('error'); } catch (_) {}
    }
  });





  bot.command(['factorylist'], async (ctx) => {
    try {
      if (!(await requireAdmin(ctx))) return;
      if (!supabase) {
        await ctx.reply('Supabase offline');
        return;
      }
      const { data: bots } = await supabase
        .from('rq_user_bots')
        .select('owner_id,bot_username,is_active,webhook_set,welcome_text')
        .order('owner_id', { ascending: true })
        .limit(30);
      const { data: flags } = await supabase
        .from('rq_tenant_flags')
        .select('owner_id,bot_username,template_id,version_channel,flags')
        .limit(30);
      const flagMap = {};
      for (const f of flags || []) {
        flagMap[String(f.owner_id)] = f;
      }
      const lines = ['FACTORY LIST · Founder', 'Tenants: ' + ((bots || []).length)];
      for (const b of bots || []) {
        const f = flagMap[String(b.owner_id)] || {};
        lines.push(
          '• @' +
            (b.bot_username || '?') +
            ' owner=' +
            b.owner_id +
            ' pack=' +
            (f.template_id || '—') +
            ' ch=' +
            (f.version_channel || '—') +
            ' active=' +
            (b.is_active ? 'y' : 'n')
        );
      }
      if (!(bots || []).length) lines.push('(no tenant rows)');
      lines.push('', '/factorystatus · /factorypacks');
      await ctx.reply(lines.join('\n').slice(0, 3500));
    } catch (e) {
      await ctx.reply('factorylist failed: ' + (e.message || e));
    }
  });








  bot.command(['groupadmin', 'gadmin'], async (ctx) => {
    try {
      if (!(await requireFeature(ctx, 'group', 'Group Admin pack'))) return;
      const chat = ctx.chat;
      const isGroup = chat && (chat.type === 'group' || chat.type === 'supergroup');
      const lines = [
        'RADIANT QUEEN · GROUP ADMIN PACK',
        isGroup ? `Chat: ${chat.title || chat.id}` : '(Best used inside a group)',
        '',
        'SETUP',
        '/setwelcome <text>',
        '/setrules <text>',
        '/rules',
        '/antilink on|off|status',
        '/modcheck',
        '/groupinfo',
        '',
        'MODERATION',
        '/warn (reply) · /unwarn (reply) · /warns',
        '/mute · /unmute (reply)',
        '/slow <sec> · /shutup · /speak',
        '',
        'NOTES & FAQ',
        '/note · /notes · /clearnote',
        '/faqset · /faq · /faqs',
        '/stats · /report',
        '',
        'Promote bot as Admin (Delete + Restrict) for full power.',
        '— Radiant Queen · Pasiya Max',
      ];
      await uiReply(ctx, lines.join('\n').slice(0, 4000), gadminKeyboard());
    } catch (err) {
      console.error('groupadmin', err);
      await ctx.reply('groupadmin failed.');
    }
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


  // P8 Group analytics
  bot.command(['groupstats', 'gstats'], async (ctx) => {
    try {
      if (ctx.chat?.type !== 'group' && ctx.chat?.type !== 'supergroup') {
        await ctx.reply('Use /groupstats inside a group.');
        return;
      }
      const chatId = ctx.chat.id;
      const chat = await ctx.telegram.getChat(chatId);
      let count = '?';
      try {
        count = await ctx.telegram.callApi('getChatMemberCount', { chat_id: chatId });
      } catch (_) {
        try {
          count = await ctx.telegram.callApi('getChatMembersCount', { chat_id: chatId });
        } catch (_) {
          count = 'n/a';
        }
      }
      const settings = await loadGroupSettings(chatId);
      let botAdmin = 'unknown';
      try {
        const me = await ctx.telegram.getChatMember(chatId, ctx.botInfo.id);
        botAdmin = me.status;
      } catch (_) {}
      const map = groupActiveUsers.get(String(chatId));
      const tracked = map ? map.size : 0;
      let top = [];
      if (map) {
        top = [...map.values()]
          .sort((a, b) => (b.ts || 0) - (a.ts || 0))
          .slice(0, 8)
          .map((u) => (u.username ? '@' + u.username : u.name || u.id));
      }
      let warnRows = 0;
      if (supabase) {
        try {
          const { count: wc } = await supabase
            .from('rq_warns')
            .select('*', { count: 'exact', head: true })
            .eq('chat_id', chatId);
          warnRows = wc ?? 0;
        } catch (_) {}
      }
      const lines = [
        '📊 GROUP STATS',
        'Title: ' + (chat.title || '-'),
        'Chat ID: ' + chatId,
        'Members: ' + count,
        'Bot: ' + botAdmin,
        'Anti-link: ' + (settings.antiLink ? 'ON' : 'OFF'),
        'Slow: ' + (settings.slow_seconds || settings.slowSeconds || 0) + 's',
        'Welcome: ' + (settings.welcome ? 'set' : 'not set'),
        'Warn records: ' + warnRows,
        'Tracked active (this instance): ' + tracked,
      ];
      if (top.length) {
        lines.push('');
        lines.push('Recent active:');
        lines.push(top.join(', '));
      }
      lines.push('');
      lines.push('/groupinfo · /modcheck · /admins');
      await ctx.reply(lines.join('\n').slice(0, 3500));
      await logEvent(ctx.from?.id, 'groupstats', { chat_id: chatId });
    } catch (e) {
      await ctx.reply('groupstats failed: ' + String(e.message || e).slice(0, 160));
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
    if (!(await requireFeature(ctx, 'stride', 'Stride pack'))) return;
    try {
      const arg = (ctx.message.text || '')
        .replace(/^\/stride(@\w+)?\s*/i, '')
        .trim()
        .toLowerCase();

      if (arg === 'help' || arg === '?') {
        await ctx.reply(
          `STRIDECLUB BRIDGE\n\n` +
            `/stride — health + leaderboard + club pulse\n` +
            `/stride agents — agent pulse\n` +
            `/stride site — open link\n` +
            `/runxp /xptop /logrun /streak /me\n\n` +
            `SnapDeploy free tier may sleep (30–60s wake).`
        );
        return;
      }

      if (arg === 'site' || arg === 'open') {
        await ctx.reply(
          `Open StrideClub:\n${STRIDE_BASE}`,
          Markup.inlineKeyboard([
            [Markup.button.url('Open StrideClub', STRIDE_BASE)],
          ])
        );
        return;
      }

      await ctx.sendChatAction('typing');
      {
        const payS = await spendGold(ctx, 'stride');
        if (!payS.ok) {
          await ctx.reply(payS.message || 'Not enough gold. /balance');
          return;
        }
      }


      // Parallel, short timeouts — never hard-fail whole command if one path fails
      const [healthR, boardR, runsR, eventsR] = await Promise.all([
        fetchStrideJson('/api/health', 8000),
        fetchStrideJson('/api/leaderboard', 8000),
        fetchStrideJson('/api/runs', 8000),
        fetchStrideJson('/api/events', 8000),
      ]);

      if (arg === 'agents') {
        let msg = `STRIDE AGENTS / PULSE\nBase: ${STRIDE_BASE}\n\n`;
        if (healthR.ok && healthR.data) {
          const d = healthR.data;
          const c = d.counts || {};
          msg += `Health: OK\n`;
          msg += `ok: ${d.ok}\n`;
          if (c.users != null) msg += `users: ${c.users}\n`;
          if (c.runs != null) msg += `runs: ${c.runs}\n`;
          if (c.events != null) msg += `events: ${c.events}\n`;
          if (c.agentLogs != null) msg += `agentLogs: ${c.agentLogs}\n`;
          if (d.checks) {
            msg += `checks: ${JSON.stringify(d.checks).slice(0, 220)}\n`;
          }
        } else {
          msg += `Health: ${healthR.error || 'down'}\n`;
          if (healthR.waking || (healthR.status && healthR.status >= 500)) {
            msg += `Tip: Open site once, wait 30–60s, retry.\n`;
          }
        }
        msg += `\nTelegram: /agentpulse /runxp /xptop`;
        await ctx.reply(msg.slice(0, 3500));
        return;
      }

      // Default /stride
      let msg = `STRIDECLUB BRIDGE\nBase: ${STRIDE_BASE}\n\n`;

      if (healthR.ok && healthR.data) {
        const d = healthR.data;
        const c = d.counts || {};
        msg += `HEALTH: OK\n`;
        if (d.ok != null) msg += `ok: ${d.ok}\n`;
        if (c.users != null) msg += `Users: ${c.users}\n`;
        if (c.runs != null) msg += `Runs: ${c.runs}\n`;
        if (c.events != null) msg += `Events: ${c.events}\n`;
        if (c.agentLogs != null) msg += `Agent logs: ${c.agentLogs}\n`;
      } else {
        msg += `HEALTH: ${healthR.error || 'unavailable'}\n`;
        if (healthR.waking || healthR.status === 503 || (healthR.error || '').includes('HTML')) {
          msg += `(Container may be waking — open site, wait, retry)\n`;
        }
      }

      msg += `\nLEADERBOARD\n`;
      if (boardR.ok && boardR.data) {
        const data = boardR.data;
        let rows = data.leaderboard || data.runners || data.rows || data.items || data;
        if (!Array.isArray(rows) && data && typeof data === 'object') {
          rows = Object.values(data).find((v) => Array.isArray(v)) || [];
        }
        if (Array.isArray(rows) && rows.length) {
          rows.slice(0, 5).forEach((r, i) => {
            if (!r || typeof r !== 'object') return;
            const name =
              r.display_name || r.name || r.username || r.user_name || `User ${i + 1}`;
            const km =
              r.total_km ?? r.distance_km ?? r.km ?? r.totalDistance ?? r.distance ?? '—';
            const runsN = r.runs ?? r.run_count ?? r.count;
            msg += `${i + 1}. ${name} — ${km} km${runsN != null ? ` (${runsN} runs)` : ''}\n`;
          });
        } else {
          msg += `(no leaderboard rows)\n`;
        }
      } else {
        msg += `(unavailable: ${boardR.error || 'n/a'})\n`;
      }

      if (runsR.ok && runsR.data) {
        const list = Array.isArray(runsR.data)
          ? runsR.data
          : runsR.data.runs || runsR.data.items || [];
        if (Array.isArray(list)) {
          msg += `\nRuns API: ${list.length} item(s)\n`;
        }
      }

      if (eventsR.ok && eventsR.data) {
        const list = Array.isArray(eventsR.data)
          ? eventsR.data
          : eventsR.data.events || eventsR.data.items || [];
        if (Array.isArray(list) && list.length) {
          msg += `Events API: ${list.length} item(s)\n`;
          list.slice(0, 3).forEach((e, i) => {
            if (!e || typeof e !== 'object') return;
            const title = e.title || e.name || `Event ${i + 1}`;
            const when = e.event_date || e.date || e.starts_at || '';
            msg += `  • ${title}${when ? ` (${when})` : ''}\n`;
          });
        }
      }

      msg += `\n/stride agents · /runxp · /xptop · /logrun`;

      try {
        await ctx.reply(
          msg.slice(0, 3500),
          Markup.inlineKeyboard([
            [Markup.button.url('Open StrideClub', STRIDE_BASE)],
          ])
        );
      } catch (replyErr) {
        // keyboard optional — never fail whole command
        console.error('stride reply kb', replyErr);
        await ctx.reply(msg.slice(0, 3500));
      }
    } catch (err) {
      console.error('stride', err);
      await ctx.reply(
        `Stride bridge error: ${String(err?.message || err).slice(0, 150)}\n` +
          `Base: ${STRIDE_BASE}\n` +
          `Try /stride agents or open the site once if hosting slept.`
      );
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



  bot.command('badges', async (ctx) => {
    try {
      if (!supabase) {
        await ctx.reply('Supabase not connected.');
        return;
      }
      const userId = Number(ctx.from.id);
      const { data } = await supabase
        .from('rq_run_xp')
        .select('xp, streak, runs_logged, username, stride_name')
        .eq('user_id', userId)
        .maybeSingle();

      const list = computeBadges(data || {});
      const lv = xpLevel(data?.xp || 0);
      await ctx.reply(
        `BADGES\n` +
          `Name: ${data?.username || ctx.from.first_name}\n` +
          (data?.stride_name ? `Stride: ${data.stride_name}\n` : '') +
          `XP ${lv.xp} | L${lv.level} | Streak ${data?.streak || 0} | Runs ${data?.runs_logged || 0}\n\n` +
          (list.length ? list.map((b) => `• ${b}`).join('\n') : '• None yet — try /logrun') +
          `\n\nChallenge: /challenge`
      );
    } catch (err) {
      console.error('badges', err);
      await ctx.reply('badges failed.');
    }
  });

  bot.command('challenge', async (ctx) => {
    try {
      if (!supabase) {
        await ctx.reply('Supabase not connected.');
        return;
      }

      const arg = (ctx.message.text || '')
        .replace(/^\/challenge(@\w+)?\s*/i, '')
        .trim();

      // Founder set: /challenge set <text>
      if (arg.toLowerCase().startsWith('set ')) {
        if (!isAdmin(ctx)) {
          await ctx.reply('Only founder can set the club challenge.');
          return;
        }
        const text = arg.slice(4).trim().slice(0, 300);
        if (!text) {
          await ctx.reply('Usage:\n/challenge set Run 3 times this week');
          return;
        }
        const { error } = await supabase.from('rq_club_meta').upsert({
          key: 'weekly_challenge',
          value: text,
          updated_at: new Date().toISOString(),
        });
        if (error) {
          await ctx.reply(`Save failed: ${error.message}\nCreate table rq_club_meta if needed.`);
          return;
        }
        await ctx.reply(`Club challenge set:\n${text}`);
        return;
      }

      const { data } = await supabase
        .from('rq_club_meta')
        .select('value, updated_at')
        .eq('key', 'weekly_challenge')
        .maybeSingle();

      const challenge =
        data?.value ||
        'Default: Log at least 3 runs this week with /logrun. Climb /weekly board.';

      // personal progress hint
      let progress = '';
      const userId = Number(ctx.from.id);
      const { data: me } = await supabase
        .from('rq_run_xp')
        .select('runs_logged, streak, xp')
        .eq('user_id', userId)
        .maybeSingle();
      if (me) {
        progress =
          `\n\nYour pulse:\n` +
          `Runs: ${me.runs_logged || 0} | Streak: ${me.streak || 0} | XP: ${me.xp || 0}\n` +
          `/logrun · /badges · /weekly`;
      }

      await ctx.reply(
        `CLUB CHALLENGE\n\n${challenge}` +
          (data?.updated_at ? `\n\nUpdated: ${String(data.updated_at).slice(0, 10)}` : '') +
          progress
      );
    } catch (err) {
      console.error('challenge', err);
      await ctx.reply('challenge failed.');
    }
  });



  bot.command('mute', async (ctx) => {
    try {
      if (ctx.chat?.type !== 'group' && ctx.chat?.type !== 'supergroup') {
        await ctx.reply('Use in a group. Reply to user:\n/mute 10');
        return;
      }
      if (!(await ensureGroupAdmin(ctx))) return;
      if (!(await isUserGroupAdmin(ctx))) {
        await ctx.reply('Only group admins can mute.');
        return;
      }
      const target = ctx.message.reply_to_message?.from;
      if (!target || target.is_bot) {
        await ctx.reply('Reply to the user, then:\n/mute 10\n(minutes, 1–1440)');
        return;
      }
      const arg = (ctx.message.text || '')
        .replace(/^\/mute(@\w+)?\s*/i, '')
        .trim();
      let mins = parseInt(arg, 10);
      if (!Number.isFinite(mins)) mins = 10;
      mins = Math.max(1, Math.min(1440, mins));
      const until = Math.floor(Date.now() / 1000) + mins * 60;
      await ctx.telegram.restrictChatMember(ctx.chat.id, target.id, {
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
      const name = target.username ? `@${target.username}` : target.first_name;
      await ctx.reply(`Muted ${name} for ${mins} min.\nUnmute: reply + /unmute`);
    } catch (err) {
      console.error('mute', err);
      await ctx.reply(
        `mute failed: ${String(err?.message || err).slice(0, 120)}\nBot needs Restrict members.`
      );
    }
  });

  bot.command('unmute', async (ctx) => {
    try {
      if (ctx.chat?.type !== 'group' && ctx.chat?.type !== 'supergroup') {
        await ctx.reply('Use in a group. Reply to user:\n/unmute');
        return;
      }
      if (!(await ensureGroupAdmin(ctx))) return;
      if (!(await isUserGroupAdmin(ctx))) {
        await ctx.reply('Only group admins can unmute.');
        return;
      }
      const target = ctx.message.reply_to_message?.from;
      if (!target) {
        await ctx.reply('Reply to the user, then /unmute');
        return;
      }
      await ctx.telegram.restrictChatMember(ctx.chat.id, target.id, {
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
      const name = target.username ? `@${target.username}` : target.first_name;
      await ctx.reply(`Unmuted ${name}.`);
    } catch (err) {
      console.error('unmute', err);
      await ctx.reply(`unmute failed: ${String(err?.message || err).slice(0, 120)}`);
    }
  });

  bot.command('slow', async (ctx) => {
    try {
      if (ctx.chat?.type !== 'group' && ctx.chat?.type !== 'supergroup') {
        await ctx.reply('Use in a group:\n/slow 30\n/slow 0');
        return;
      }
      if (!(await ensureGroupAdmin(ctx))) return;
      if (!(await isUserGroupAdmin(ctx))) {
        await ctx.reply('Only group admins can set slow mode.');
        return;
      }
      const arg = (ctx.message.text || '')
        .replace(/^\/slow(@\w+)?\s*/i, '')
        .trim();
      let sec = parseInt(arg, 10);
      if (!Number.isFinite(sec)) {
        const cur = await loadGroupSettings(ctx.chat.id);
        await ctx.reply(
          `Bot slow mode (enforced by bot, works everywhere).\n` +
            `Current: ${cur.slowSeconds || 0}s\n\n` +
            `Usage:\n/slow 30\n/slow 0 (off)\n` +
            `Range: 0–300 seconds`
        );
        return;
      }
      sec = Math.max(0, Math.min(300, sec));
      const result = await saveGroupSettings(ctx.chat.id, { slowSeconds: sec });
      if (!result.ok) {
        await ctx.reply(`Save failed: ${result.error}\nRun SQL to add slow_seconds column.`);
        return;
      }
      await ctx.reply(
        sec === 0
          ? 'Bot slow mode OFF.'
          : `Bot slow mode ON: ${sec}s between member messages.\nAdmins ignored. Needs Delete messages permission.`
      );
    } catch (err) {
      console.error('slow', err);
      await ctx.reply(`slow failed: ${String(err?.message || err).slice(0, 160)}`);
    }
  });



  bot.command('title', async (ctx) => {
    try {
      if (ctx.chat?.type !== 'group' && ctx.chat?.type !== 'supergroup') {
        await ctx.reply('Use /title inside a group.');
        return;
      }
      const chat = await ctx.telegram.getChat(ctx.chat.id);
      let members = '?';
      try {
        members = await ctx.telegram.callApi('getChatMemberCount', {
          chat_id: ctx.chat.id,
        });
      } catch (_) {
        try {
          members = await ctx.telegram.callApi('getChatMembersCount', {
            chat_id: ctx.chat.id,
          });
        } catch (_) {}
      }
      let anti = 'unknown';
      try {
        const s = await loadGroupSettings(ctx.chat.id);
        anti = s?.antiLink ? 'ON' : 'OFF';
      } catch (_) {}
      await ctx.reply(
        `GROUP\n` +
          `Title: ${chat.title || ctx.chat.title || '—'}\n` +
          `Chat ID: ${ctx.chat.id}\n` +
          `Members: ${members}\n` +
          `Anti-link: ${anti}\n` +
          `Type: ${ctx.chat.type}\n\n` +
          `/groupinfo · /rules · /challenge`
      );
    } catch (err) {
      console.error('title', err);
      await ctx.reply('title failed.');
    }
  });



  bot.command('note', async (ctx) => {
    try {
      if (ctx.chat?.type !== 'group' && ctx.chat?.type !== 'supergroup') {
        await ctx.reply('Use /note inside a group.\nExample:\n/note Practice 6AM Sunday');
        return;
      }
      if (!(await ensureGroupAdmin(ctx))) return;
      if (!(await isUserGroupAdmin(ctx)) && !isAdmin(ctx)) {
        await ctx.reply('Only group admins can add notes.');
        return;
      }
      if (!supabase) {
        await ctx.reply('Supabase not connected.');
        return;
      }
      const text = (ctx.message.text || '')
        .replace(/^\/note(@\w+)?\s*/i, '')
        .trim()
        .slice(0, 500);
      if (!text) {
        await ctx.reply('Usage:\n/note Your group note text');
        return;
      }
      const chatId = toChatId(ctx.chat.id);
      const { error } = await supabase.from('rq_group_notes').insert({
        chat_id: chatId,
        text,
        created_by: Number(ctx.from.id),
        created_by_name: ctx.from.username || ctx.from.first_name || String(ctx.from.id),
      });
      if (error) {
        await ctx.reply(`note failed: ${error.message}\nRun Phase G SQL in Supabase.`);
        return;
      }
      await ctx.reply(`Note saved.\nView: /notes`);
    } catch (err) {
      console.error('note', err);
      await ctx.reply('note failed.');
    }
  });

  bot.command('notes', async (ctx) => {
    try {
      if (ctx.chat?.type !== 'group' && ctx.chat?.type !== 'supergroup') {
        await ctx.reply('Use /notes inside a group.');
        return;
      }
      if (!supabase) {
        await ctx.reply('Supabase not connected.');
        return;
      }
      const chatId = toChatId(ctx.chat.id);
      const { data, error } = await supabase
        .from('rq_group_notes')
        .select('id, text, created_by_name, created_at')
        .eq('chat_id', chatId)
        .order('created_at', { ascending: false })
        .limit(15);
      if (error) {
        await ctx.reply(`notes failed: ${error.message}`);
        return;
      }
      if (!data?.length) {
        await ctx.reply('No notes yet.\nAdmins: /note Your text');
        return;
      }
      const lines = data
        .map((n, i) => {
          const who = n.created_by_name || 'admin';
          const t = String(n.text || '').slice(0, 120);
          return `${i + 1}. [${n.id}] ${t}\n   — ${who}`;
        })
        .join('\n\n');
      await ctx.reply(
        `GROUP NOTES (latest)\n\n${lines}\n\nAdd: /note text\nClear one: /clearnote <id>\nClear all: /clearnote all`
      );
    } catch (err) {
      console.error('notes', err);
      await ctx.reply('notes failed.');
    }
  });

  bot.command('clearnote', async (ctx) => {
    try {
      if (ctx.chat?.type !== 'group' && ctx.chat?.type !== 'supergroup') {
        await ctx.reply('Use /clearnote inside a group.');
        return;
      }
      if (!(await ensureGroupAdmin(ctx))) return;
      if (!(await isUserGroupAdmin(ctx)) && !isAdmin(ctx)) {
        await ctx.reply('Only group admins can clear notes.');
        return;
      }
      if (!supabase) {
        await ctx.reply('Supabase not connected.');
        return;
      }
      const arg = (ctx.message.text || '')
        .replace(/^\/clearnote(@\w+)?\s*/i, '')
        .trim()
        .toLowerCase();
      const chatId = toChatId(ctx.chat.id);

      if (arg === 'all') {
        const { error } = await supabase
          .from('rq_group_notes')
          .delete()
          .eq('chat_id', chatId);
        if (error) {
          await ctx.reply(`clear failed: ${error.message}`);
          return;
        }
        await ctx.reply('All notes cleared for this group.');
        return;
      }

      const id = parseInt(arg, 10);
      if (!Number.isFinite(id)) {
        await ctx.reply('Usage:\n/clearnote 3\n/clearnote all\n(see ids in /notes)');
        return;
      }

      const { error } = await supabase
        .from('rq_group_notes')
        .delete()
        .eq('chat_id', chatId)
        .eq('id', id);
      if (error) {
        await ctx.reply(`clear failed: ${error.message}`);
        return;
      }
      await ctx.reply(`Note #${id} removed.`);
    } catch (err) {
      console.error('clearnote', err);
      await ctx.reply('clearnote failed.');
    }
  });



  bot.command('stats', async (ctx) => {
    try {
      if (ctx.chat?.type !== 'group' && ctx.chat?.type !== 'supergroup') {
        await ctx.reply('Use /stats inside a group.');
        return;
      }

      let members = '?';
      try {
        members = await ctx.telegram.callApi('getChatMemberCount', {
          chat_id: ctx.chat.id,
        });
      } catch (_) {
        try {
          members = await ctx.telegram.callApi('getChatMembersCount', {
            chat_id: ctx.chat.id,
          });
        } catch (_) {}
      }

      const settings = await loadGroupSettings(ctx.chat.id);
      let notesCount = 0;
      let reportsCount = 0;
      if (supabase) {
        const chatId = toChatId(ctx.chat.id);
        const n = await supabase
          .from('rq_group_notes')
          .select('*', { count: 'exact', head: true })
          .eq('chat_id', chatId);
        notesCount = n.count ?? 0;
        const r = await supabase
          .from('rq_group_reports')
          .select('*', { count: 'exact', head: true })
          .eq('chat_id', chatId);
        reportsCount = r.count ?? 0;
      }

      await ctx.reply(
        `GROUP STATS\n` +
          `Title: ${ctx.chat.title || '—'}\n` +
          `Members: ${members}\n` +
          `Anti-link: ${settings?.antiLink ? 'ON' : 'OFF'}\n` +
          `Slow mode: ${settings?.slowSeconds || 0}s\n` +
          `Notes: ${notesCount}\n` +
          `Reports logged: ${reportsCount}\n\n` +
          `/notes · /challenge · /title · /modcheck`
      );
    } catch (err) {
      console.error('stats', err);
      await ctx.reply('stats failed.');
    }
  });

  bot.command('report', async (ctx) => {
    try {
      if (ctx.chat?.type !== 'group' && ctx.chat?.type !== 'supergroup') {
        await ctx.reply('Use /report in a group. Reply to a message:\n/report spam');
        return;
      }

      const targetMsg = ctx.message.reply_to_message;
      if (!targetMsg) {
        await ctx.reply('Reply to the message you want to report, then:\n/report reason');
        return;
      }

      const reason =
        (ctx.message.text || '')
          .replace(/^\/report(@\w+)?\s*/i, '')
          .trim()
          .slice(0, 200) || 'No reason';

      const reported = targetMsg.from;
      const reportedName = reported?.username
        ? `@${reported.username}`
        : reported?.first_name || String(reported?.id || '?');

      if (supabase) {
        await supabase.from('rq_group_reports').insert({
          chat_id: toChatId(ctx.chat.id),
          reporter_id: Number(ctx.from.id),
          reporter_name: ctx.from.username || ctx.from.first_name || String(ctx.from.id),
          reported_id: reported?.id ? Number(reported.id) : null,
          reported_name: reportedName,
          message_id: targetMsg.message_id,
          reason,
        });
      }

      await ctx.reply(
        `Report logged.\nTarget: ${reportedName}\nReason: ${reason}\nAdmins can review.`
      );

      // Notify founder if configured
      if (ADMIN_ID) {
        try {
          await ctx.telegram.sendMessage(
            ADMIN_ID,
            `REPORT\nGroup: ${ctx.chat.title || ctx.chat.id}\n` +
              `From: ${ctx.from.username || ctx.from.id}\n` +
              `Target: ${reportedName}\n` +
              `Reason: ${reason}\n` +
              `Msg id: ${targetMsg.message_id}`
          );
        } catch (_) {}
      }
    } catch (err) {
      console.error('report', err);
      await ctx.reply('report failed.');
    }
  });



  bot.command('pace', async (ctx) => {
    try {
      const raw = (ctx.message.text || '').replace(/^\/pace(@\w+)?\s*/i, '').trim();
      const parts = raw.split(/\s+/).filter(Boolean);
      if (parts.length < 2) {
        await ctx.reply(
          'PACE calculator\n\nUsage:\n/pace <km> <time>\n\nExamples:\n/pace 5 25:00\n/pace 10 55:30\n/pace 21.1 2:05:00'
        );
        return;
      }
      const km = parseFloat(parts[0]);
      const sec = parseTimeToSec(parts[1]);
      if (!Number.isFinite(km) || km <= 0 || !sec || sec <= 0) {
        await ctx.reply('Invalid input.\nExample: /pace 5 25:00');
        return;
      }
      const pace = sec / km;
      await ctx.reply(
        `PACE\n` +
          `Distance: ${km} km\n` +
          `Time: ${formatSec(sec)}\n` +
          `Pace: ${formatSec(pace)} /km\n` +
          `Speed: ${(km / (sec / 3600)).toFixed(2)} km/h\n\n` +
          `/split · /logrun`
      );
    } catch (err) {
      console.error('pace', err);
      await ctx.reply('pace failed.');
    }
  });

  bot.command('split', async (ctx) => {
    try {
      const raw = (ctx.message.text || '').replace(/^\/split(@\w+)?\s*/i, '').trim();
      const parts = raw.split(/\s+/).filter(Boolean);
      if (parts.length < 2) {
        await ctx.reply(
          'SPLIT / finish-time predictor\n\nUsage:\n/split <pace_per_km> <km>\n\nExamples:\n/split 5:30 10\n/split 6:00 21.1'
        );
        return;
      }
      const paceSec = parseTimeToSec(parts[0]);
      const km = parseFloat(parts[1]);
      if (!paceSec || paceSec <= 0 || !Number.isFinite(km) || km <= 0) {
        await ctx.reply('Invalid input.\nExample: /split 5:30 10');
        return;
      }
      const total = paceSec * km;
      await ctx.reply(
        `SPLIT PLAN\n` +
          `Pace: ${formatSec(paceSec)} /km\n` +
          `Distance: ${km} km\n` +
          `Predicted time: ${formatSec(total)}\n\n` +
          `/pace · /dailytip · /logrun`
      );
    } catch (err) {
      console.error('split', err);
      await ctx.reply('split failed.');
    }
  });

  bot.command('convert', async (ctx) => {
    try {
      const raw = (ctx.message.text || '').replace(/^\/convert(@\w+)?\s*/i, '').trim().toLowerCase();
      const m = raw.match(/^([\d.]+)\s*(km|mi|mile|miles)?$/i);
      if (!m) {
        await ctx.reply(
          'Distance convert\n\nUsage:\n/convert 10 km\n/convert 6.2 mi'
        );
        return;
      }
      const n = parseFloat(m[1]);
      const unit = (m[2] || 'km').toLowerCase();
      if (!Number.isFinite(n) || n <= 0) {
        await ctx.reply('Invalid number.');
        return;
      }
      if (unit.startsWith('mi')) {
        const km = n * 1.60934;
        await ctx.reply(`CONVERT\n${n} mi → ${km.toFixed(2)} km`);
      } else {
        const mi = n / 1.60934;
        await ctx.reply(`CONVERT\n${n} km → ${mi.toFixed(2)} mi`);
      }
    } catch (err) {
      console.error('convert', err);
      await ctx.reply('convert failed.');
    }
  });



  bot.command('quote', async (ctx) => {
    try {
      const uid = String(ctx.from.id);
      if (!isAdmin(ctx)) {
        const rate = await checkRateLimit(uid);
        if (!rate.ok) {
          await ctx.reply(`Slow down. Retry in ~${rate.waitSec}s.`);
          return;
        }
      }
      await ctx.sendChatAction('typing');
      const out = await generateReply(
        'Write ONE short motivational line for amateur runners (max 2 sentences). No medical claims. Sinhala or English matching the user vibe; default English if unclear.',
        ctx
      );
      await ctx.reply(`QUOTE\n\n${out}`);
    } catch (err) {
      console.error('quote', err);
      await ctx.reply('quote failed (AI busy). Try /dailytip');
    }
  });

  bot.command('roll', async (ctx) => {
    try {
      const arg = (ctx.message.text || '')
        .replace(/^\/roll(@\w+)?\s*/i, '')
        .trim();
      let sides = parseInt(arg, 10);
      if (!Number.isFinite(sides)) sides = 6;
      sides = Math.max(2, Math.min(100, sides));
      const n = 1 + Math.floor(Math.random() * sides);
      await ctx.reply(`ROLL d${sides} → ${n}`);
    } catch (err) {
      await ctx.reply('roll failed.');
    }
  });

  bot.command('pick', async (ctx) => {
    try {
      const raw = (ctx.message.text || '')
        .replace(/^\/pick(@\w+)?\s*/i, '')
        .trim();
      if (!raw) {
        await ctx.reply('Usage:\n/pick option1 | option2 | option3\nExample:\n/pick Track | Long run | Rest');
        return;
      }
      const options = raw
        .split('|')
        .map((s) => s.trim())
        .filter(Boolean);
      if (options.length < 2) {
        await ctx.reply('Need at least 2 options separated by |\n/pick A | B | C');
        return;
      }
      const choice = options[Math.floor(Math.random() * options.length)];
      await ctx.reply(
        `PICK\nOptions: ${options.join(' · ')}\n\nChosen: ${choice}`
      );
    } catch (err) {
      await ctx.reply('pick failed.');
    }
  });



  bot.command('ping', async (ctx) => {
    const t0 = Date.now();
    const msg = await ctx.reply('Pong…');
    const ms = Date.now() - t0;
    try {
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        msg.message_id,
        undefined,
        `Pong · ${ms}ms · uptime ${Math.round((Date.now() - bootTime) / 1000)}s`
      );
    } catch (_) {
      await ctx.reply(`Pong · ${ms}ms`);
    }
  });

  bot.command('version', async (ctx) => {
    await ctx.reply(
      `RADIANT QUEEN · PASIYA MAX\n` +
        `Version: ${typeof BOT_VERSION !== 'undefined' ? BOT_VERSION : 'v2.5'}\n` +
        `Gemini: ${GEMINI_KEY ? 'yes' : 'no'}\n` +
        `Supabase: ${supabase ? 'yes' : 'no'}\n` +
        `Stride bridge: Agent 6\n` +
        `/commands · /agentpulse · /stride`
    );
  });

bot.command('commands', async (ctx) => {
    await ctx.reply(
      `RADIANT QUEEN · PASIYA MAX  ${typeof BOT_VERSION !== 'undefined' ? BOT_VERSION : 'v2.7'}\n` +
        `COMMAND MAP\n\n` +
        `AI & chat\n` +
        `/menu /ask /quote /dailytip /help /status /id /today\n\n` +
        `Knowledge\n` +
        `/wiki /web /code /define /tr\n\n` +
        `Runner\n` +
        `/runxp /xptop /logrun /streak /weekly /badges /linkstride\n` +
        `/pace /split /convert /challenge /me /habit /habits\n\n` +
        `Stride\n` +
        `/stride /strideclub /links\n\n` +
        `Personal\n` +
        `/save /saves /unsave /todo /todos /done\n\n` +
        `Group mod\n` +
        `/setwelcome /setrules /rules /groupinfo /antilink\n` +
        `/warn /unwarn /warns /mute /unmute /slow /title /modcheck\n` +
        `/note /notes /clearnote /stats /report /shutup /speak\n` +
        `/faqset /faq /faqs\n\n` +
        `Tools\n` +
        `/calc /time /uuid /pw /b64 /hash /roll /pick\n\n` +
        `Founder\n` +
        `/admin /usage /broadcast /agentpulse /version /ping /feedback /feedbacks\n\n` +
        `Buttons: /menu`
    );
  });




  bot.command('feedback', async (ctx) => {
    try {
      if (!supabase) {
        await ctx.reply('Supabase not connected.');
        return;
      }
      const text = (ctx.message.text || '')
        .replace(/^\/feedback(@\w+)?\s*/i, '')
        .trim()
        .slice(0, 1000);
      if (!text) {
        await ctx.reply(
          'Send feedback to the founder:\n/feedback Your message here'
        );
        return;
      }
      const { error } = await supabase.from('rq_feedback').insert({
        user_id: Number(ctx.from.id),
        username: ctx.from.username || ctx.from.first_name || String(ctx.from.id),
        chat_id: ctx.chat?.id ? toChatId(ctx.chat.id) : null,
        text,
      });
      if (error) {
        await ctx.reply(`feedback failed: ${error.message}\nRun Phase L SQL.`);
        return;
      }
      await ctx.reply('Thanks — feedback saved for the founder.');
      if (ADMIN_ID) {
        try {
          await ctx.telegram.sendMessage(
            ADMIN_ID,
            `FEEDBACK\nFrom: ${ctx.from.username || ctx.from.id}\n${text.slice(0, 500)}`
          );
        } catch (_) {}
      }
    } catch (err) {
      console.error('feedback', err);
      await ctx.reply('feedback failed.');
    }
  });

  bot.command('feedbacks', async (ctx) => {
    try {
      if (!isAdmin(ctx)) {
        await ctx.reply('Founder only.');
        return;
      }
      if (!supabase) {
        await ctx.reply('Supabase not connected.');
        return;
      }
      const { data, error } = await supabase
        .from('rq_feedback')
        .select('id, username, text, created_at')
        .order('created_at', { ascending: false })
        .limit(10);
      if (error) {
        await ctx.reply(`feedbacks failed: ${error.message}`);
        return;
      }
      if (!data?.length) {
        await ctx.reply('No feedback yet.');
        return;
      }
      const lines = data
        .map(
          (f, i) =>
            `${i + 1}. #${f.id} ${f.username || '?'}\n${String(f.text || '').slice(0, 140)}`
        )
        .join('\n\n');
      await ctx.reply(`LATEST FEEDBACK\n\n${lines}`);
    } catch (err) {
      console.error('feedbacks', err);
      await ctx.reply('feedbacks failed.');
    }
  });



  bot.command('faqset', async (ctx) => {
    try {
      if (!(await isUserGroupAdmin(ctx)) && !isAdmin(ctx)) {
        // allow founder in private too
        if (!(ctx.chat?.type === 'private' && isAdmin(ctx))) {
          await ctx.reply('Admins only.\nUsage:\n/faqset rules Club rules text here');
          return;
        }
      }
      if (!supabase) {
        await ctx.reply('Supabase not connected.');
        return;
      }
      const raw = (ctx.message.text || '')
        .replace(/^\/faqset(@\w+)?\s*/i, '')
        .trim();
      const sp = raw.indexOf(' ');
      if (sp < 1) {
        await ctx.reply('Usage:\n/faqset <key> <answer text>\nExample:\n/faqset meetup We meet Sunday 6AM at the gate');
        return;
      }
      const key = raw.slice(0, sp).toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 40);
      const answer = raw.slice(sp + 1).trim().slice(0, 1500);
      if (!key || !answer) {
        await ctx.reply('Need key and answer text.');
        return;
      }
      const chatId =
        ctx.chat?.type === 'group' || ctx.chat?.type === 'supergroup'
          ? toChatId(ctx.chat.id)
          : 0;
      const { error } = await supabase.from('rq_faq').upsert(
        {
          chat_id: chatId,
          key,
          answer,
          updated_by: Number(ctx.from.id),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'chat_id,key' }
      );
      if (error) {
        await ctx.reply(`faqset failed: ${error.message}\nRun Phase M SQL.`);
        return;
      }
      await ctx.reply(`FAQ saved.\nKey: ${key}\nRead: /faq ${key}`);
    } catch (err) {
      console.error('faqset', err);
      await ctx.reply('faqset failed.');
    }
  });

  bot.command('faq', async (ctx) => {
    try {
      if (!supabase) {
        await ctx.reply('Supabase not connected.');
        return;
      }
      const key = (ctx.message.text || '')
        .replace(/^\/faq(@\w+)?\s*/i, '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, '')
        .slice(0, 40);
      if (!key) {
        await ctx.reply('Usage:\n/faq meetup\nList: /faqs');
        return;
      }
      const chatId =
        ctx.chat?.type === 'group' || ctx.chat?.type === 'supergroup'
          ? toChatId(ctx.chat.id)
          : 0;
      let { data } = await supabase
        .from('rq_faq')
        .select('key, answer')
        .eq('chat_id', chatId)
        .eq('key', key)
        .maybeSingle();
      if (!data && chatId !== 0) {
        const g = await supabase
          .from('rq_faq')
          .select('key, answer')
          .eq('chat_id', 0)
          .eq('key', key)
          .maybeSingle();
        data = g.data;
      }
      if (!data) {
        await ctx.reply(`No FAQ for "${key}".\n/faqs`);
        return;
      }
      await ctx.reply(`FAQ · ${data.key}\n\n${data.answer}`);
    } catch (err) {
      console.error('faq', err);
      await ctx.reply('faq failed.');
    }
  });

  bot.command('faqs', async (ctx) => {
    try {
      if (!supabase) {
        await ctx.reply('Supabase not connected.');
        return;
      }
      const chatId =
        ctx.chat?.type === 'group' || ctx.chat?.type === 'supergroup'
          ? toChatId(ctx.chat.id)
          : 0;
      const { data, error } = await supabase
        .from('rq_faq')
        .select('key')
        .eq('chat_id', chatId)
        .order('key')
        .limit(40);
      if (error) {
        await ctx.reply(`faqs failed: ${error.message}`);
        return;
      }
      if (!data?.length) {
        await ctx.reply('No FAQs yet.\nAdmins: /faqset key answer');
        return;
      }
      await ctx.reply(
        `FAQ KEYS\n${data.map((r) => `• ${r.key}`).join('\n')}\n\nOpen: /faq <key>`
      );
    } catch (err) {
      console.error('faqs', err);
      await ctx.reply('faqs failed.');
    }
  });



  bot.command('warns', async (ctx) => {
    try {
      if (ctx.chat?.type !== 'group' && ctx.chat?.type !== 'supergroup') {
        await ctx.reply('Use /warns inside a group.');
        return;
      }
      if (!(await isUserGroupAdmin(ctx)) && !isAdmin(ctx)) {
        await ctx.reply('Admins only.');
        return;
      }
      if (!supabase) {
        await ctx.reply('Supabase not connected.');
        return;
      }
      const chatId = toChatId(ctx.chat.id);
      const { data, error } = await supabase
        .from('rq_warns')
        .select('user_id, warn_count, last_reason, updated_at')
        .eq('chat_id', chatId)
        .order('warn_count', { ascending: false })
        .limit(15);
      if (error) {
        await ctx.reply(`warns failed: ${error.message}`);
        return;
      }
      if (!data?.length) {
        await ctx.reply('No warns stored for this group.');
        return;
      }
      const lines = data
        .map(
          (w, i) =>
            `${i + 1}. User ${w.user_id} — ${w.warn_count} warn(s)\n` +
            `   Last: ${String(w.last_reason || '—').slice(0, 80)}`
        )
        .join('\n');
      await ctx.reply(
        `WARN BOARD\n\n${lines}\n\n/warn (reply) · /unwarn (reply)`
      );
    } catch (err) {
      console.error('warns', err);
      await ctx.reply('warns failed.');
    }
  });



  bot.command('me', async (ctx) => {
    try {
      const u = ctx.from;
      const name = u.username ? `@${u.username}` : u.first_name || String(u.id);
      let xpLine = 'XP: — (start with /logrun)';
      let badgeLine = 'Badges: —';
      let strideLine = '';
      let warnLine = '';

      if (supabase) {
        const { data } = await supabase
          .from('rq_run_xp')
          .select('xp, streak, runs_logged, stride_name, username')
          .eq('user_id', Number(u.id))
          .maybeSingle();
        if (data) {
          const lv = xpLevel(data.xp || 0);
          xpLine =
            `XP: ${lv.xp} · Level ${lv.level}\n` +
            `Streak: ${data.streak || 0}d · Runs: ${data.runs_logged || 0}`;
          if (data.stride_name) strideLine = `Stride: ${data.stride_name}\n`;
          const badges = computeBadges(data);
          badgeLine = badges.length
            ? `Badges: ${badges.slice(0, 6).join(', ')}`
            : 'Badges: none yet';
        }

        if (ctx.chat?.type === 'group' || ctx.chat?.type === 'supergroup') {
          const { data: w } = await supabase
            .from('rq_warns')
            .select('warn_count')
            .eq('chat_id', toChatId(ctx.chat.id))
            .eq('user_id', Number(u.id))
            .maybeSingle();
          if (w?.warn_count) warnLine = `Warns here: ${w.warn_count}\n`;
        }
      }

      await ctx.reply(
        `PROFILE\n` +
          `Name: ${name}\n` +
          `ID: ${u.id}\n` +
          strideLine +
          `${xpLine}\n` +
          warnLine +
          `${badgeLine}\n\n` +
          `/runxp · /streak · /badges · /logrun`
      );
    } catch (err) {
      console.error('me', err);
      await ctx.reply('me failed.');
    }
  });



  bot.command('today', async (ctx) => {
    try {
      await ctx.sendChatAction('typing');
      let challenge = 'Log a run with /logrun. Climb /weekly.';
      let streak = 0;
      let xp = 0;
      let level = 1;

      if (supabase) {
        const { data: ch } = await supabase
          .from('rq_club_meta')
          .select('value')
          .eq('key', 'weekly_challenge')
          .maybeSingle();
        if (ch?.value) challenge = ch.value;

        const { data: me } = await supabase
          .from('rq_run_xp')
          .select('xp, streak')
          .eq('user_id', Number(ctx.from.id))
          .maybeSingle();
        if (me) {
          streak = me.streak || 0;
          const lv = xpLevel(me.xp || 0);
          xp = lv.xp;
          level = lv.level;
        }
      }

      let tip = 'Easy miles build the engine. Stay consistent.';
      try {
        tip = await generateReply(
          'One short practical running tip for today (max 2 sentences). No medical claims.',
          ctx
        );
      } catch (_) {}

      await ctx.reply(
        `TODAY\n\n` +
          `Challenge:\n${challenge}\n\n` +
          `You: Level ${level} · ${xp} XP · Streak ${streak}d\n\n` +
          `Tip:\n${tip}\n\n` +
          `/logrun · /pace · /me · /challenge`
      );
    } catch (err) {
      console.error('today', err);
      await ctx.reply('today failed.');
    }
  });



  bot.command('shutup', async (ctx) => {
    try {
      if (ctx.chat?.type !== 'group' && ctx.chat?.type !== 'supergroup') {
        await ctx.reply('Use /shutup in a group.');
        return;
      }
      if (!(await ensureGroupAdmin(ctx))) return;
      if (!(await isUserGroupAdmin(ctx)) && !isAdmin(ctx)) {
        await ctx.reply('Admins only.');
        return;
      }
      const res = await saveGroupSettings(ctx.chat.id, { botQuiet: true });
      await ctx.reply(
        res.ok
          ? 'Quiet mode ON.\nBot ignores casual chat (commands still work).\nOff: /speak'
          : `Failed: ${res.error}\nRun Phase Q SQL for bot_quiet.`
      );
    } catch (err) {
      console.error('shutup', err);
      await ctx.reply('shutup failed.');
    }
  });

  bot.command('speak', async (ctx) => {
    try {
      if (ctx.chat?.type !== 'group' && ctx.chat?.type !== 'supergroup') {
        await ctx.reply('Use /speak in a group.');
        return;
      }
      if (!(await ensureGroupAdmin(ctx))) return;
      if (!(await isUserGroupAdmin(ctx)) && !isAdmin(ctx)) {
        await ctx.reply('Admins only.');
        return;
      }
      const res = await saveGroupSettings(ctx.chat.id, { botQuiet: false });
      await ctx.reply(
        res.ok
          ? 'Quiet mode OFF.\nBot can reply when mentioned / replied.'
          : `Failed: ${res.error}`
      );
    } catch (err) {
      console.error('speak', err);
      await ctx.reply('speak failed.');
    }
  });




  bot.command('links', async (ctx) => {
    try {
      const site = 'https://radiant-queen-pasiya-max-v2.vercel.app';
      const stride =
        (typeof STRIDE_BASE === 'string' && STRIDE_BASE.startsWith('http')
          ? STRIDE_BASE
          : 'https://strideclub-platform-6b71a.containers.snapdeploy.app'
        ).replace(/\/$/, '');
      await ctx.reply(
        `RADIANT QUEEN · LINKS\n\n` +
          `Bot: https://t.me/PasiyaMaxQueen_bot\n` +
          `Web app: ${site}\n` +
          `Create / Gold hub: ${site}/bot/\n` +
          `Sign up info: ${site}/bot/create.html\n` +
          `Settings guide: ${site}/bot/setting.html\n` +
          `StrideClub: ${stride}\n\n` +
          `Share: /invite\n` +
          `— Radiant Queen · Pasiya Max`
      );
    } catch (err) {
      await ctx.reply('links failed.');
    }
  });


  bot.command(['invite', 'share'], async (ctx) => {
    const text =
      `Join RADIANT QUEEN · PASIYA MAX\n\n` +
      `Free Telegram AI bot + group tools + Radiant Gold.\n` +
      `Start bonus 400 gold · daily +50 · admin tools for groups.\n\n` +
      `Open bot:\nhttps://t.me/PasiyaMaxQueen_bot\n\n` +
      `Web hub:\nhttps://radiant-queen-pasiya-max-v2.vercel.app/bot/\n\n` +
      `Copy & share this message with friends.`;
    await ctx.reply(text);
  });





  bot.command('wiki', async (ctx) => {
    try {
      const topic = (ctx.message.text || '')
        .replace(/^\/wiki(@\w+)?\s*/i, '')
        .trim();
      if (!topic) {
        await ctx.reply('Usage:\n/wiki Albert Einstein\n/wiki Sri Lanka');
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
      await ctx.sendChatAction('typing');
      const res = await fetchWikipediaSummary(topic);
      if (!res.ok) {
        await ctx.reply(res.error || 'wiki failed');
        return;
      }
      await ctx.reply(res.text.slice(0, 3500));
    } catch (err) {
      console.error('wiki', err);
      await ctx.reply('wiki failed.');
    }
  });

  bot.command('web', async (ctx) => {
    try {
      const url = (ctx.message.text || '')
        .replace(/^\/web(@\w+)?\s*/i, '')
        .trim()
        .split(/\s+/)[0];
      if (!url) {
        await ctx.reply(
          'Usage:\n/web https://example.com\n\nPublic pages only. No logins/paywalls.'
        );
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
      await ctx.sendChatAction('typing');
      const page = await fetchPublicPageText(url);
      if (!page.ok) {
        await ctx.reply(`web failed: ${page.error}`);
        return;
      }
      const summary = await generateReply(
        `Summarize this public webpage for a user in clear short bullets (max 12 lines). ` +
          `Include main topic and 3 key points. If not useful, say so.\n\nURL: ${page.finalUrl}\n\nCONTENT:\n${page.text.slice(0, 6000)}`,
        ctx
      );
      await ctx.reply(`WEB SUMMARY\n${page.finalUrl}\n\n${summary}`.slice(0, 3500));
    } catch (err) {
      console.error('web', err);
      await ctx.reply('web failed.');
    }
  });

  bot.command('code', async (ctx) => {
    try {
      const q = (ctx.message.text || '')
        .replace(/^\/code(@\w+)?\s*/i, '')
        .trim();
      if (!q) {
        await ctx.reply(
          'Coding assistant\n\nUsage:\n/code How to sort an array in JS?\n/code Fix this error: ...'
        );
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
      await ctx.sendChatAction('typing');
      const out = await generateReply(
        `You are a senior software engineer. Answer the coding question with clear steps and a minimal correct example. ` +
          `Prefer JavaScript/TypeScript when unspecified. No fluff.\n\nQUESTION:\n${q}`,
        ctx
      );
      await ctx.reply(`CODE\n\n${out}`.slice(0, 3500));
    } catch (err) {
      console.error('code', err);
      await ctx.reply('code failed (AI busy). Try again.');
    }
  });



  bot.command('define', async (ctx) => {
    try {
      const word = (ctx.message.text || '')
        .replace(/^\/define(@\w+)?\s*/i, '')
        .trim();
      if (!word) {
        await ctx.reply('Usage:\n/define resilience\n/define අධිෂ්ඨානය');
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
      await ctx.sendChatAction('typing');
      // try free dictionary API first (English), else Gemini
      let out = '';
      try {
        if (/^[a-zA-Z][a-zA-Z\s-]{0,40}$/.test(word)) {
          const r = await fetch(
            `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word.split(/\s+/)[0])}`,
            { signal: AbortSignal.timeout(10000) }
          );
          if (r.ok) {
            const j = await r.json();
            const e0 = j?.[0];
            const meaning = e0?.meanings?.[0];
            const def = meaning?.definitions?.[0]?.definition;
            const part = meaning?.partOfSpeech || '';
            if (def) {
              out =
                `DEFINE\n${e0.word}${part ? ` (${part})` : ''}\n\n${def}` +
                (meaning?.definitions?.[0]?.example
                  ? `\nExample: ${meaning.definitions[0].example}`
                  : '');
            }
          }
        }
      } catch (_) {}

      if (!out) {
        out = await generateReply(
          `Define this word/phrase simply for a runner community user. Max 6 lines. Include part of speech if clear.\n\nWORD: ${word}`,
          ctx
        );
        out = `DEFINE\n\n${out}`;
      }
      await ctx.reply(out.slice(0, 3000));
    } catch (err) {
      console.error('define', err);
      await ctx.reply('define failed.');
    }
  });

  bot.command('tr', async (ctx) => {
    try {
      const raw = (ctx.message.text || '')
        .replace(/^\/tr(@\w+)?\s*/i, '')
        .trim();
      // /tr si Hello world  OR  /tr en මම යනවා
      const m = raw.match(/^([a-zA-Z]{2,5})\s+([\s\S]+)$/);
      if (!m) {
        await ctx.reply(
          'Translate\n\nUsage:\n/tr si Hello, how are you?\n/tr en මම හොඳින් ඉන්නවා\n\nLang codes: si, en, ta, hi, ...'
        );
        return;
      }
      const lang = m[1].toLowerCase();
      const text = m[2].trim().slice(0, 1500);
      const uid = String(ctx.from.id);
      if (!isAdmin(ctx)) {
        const rate = await checkRateLimit(uid);
        if (!rate.ok) {
          await ctx.reply(`Slow down. Retry in ~${rate.waitSec}s.`);
          return;
        }
      }
      await ctx.sendChatAction('typing');
      const out = await generateReply(
        `Translate the text into language code "${lang}". Return only the translation, keep meaning natural.\n\nTEXT:\n${text}`,
        ctx
      );
      await ctx.reply(`TR → ${lang}\n\n${out}`.slice(0, 3000));
    } catch (err) {
      console.error('tr', err);
      await ctx.reply('tr failed.');
    }
  });



  bot.command('calc', async (ctx) => {
    try {
      const expr = (ctx.message.text || '')
        .replace(/^\/calc(@\w+)?\s*/i, '')
        .trim();
      if (!expr) {
        await ctx.reply('Usage:\n/calc 12 * (5 + 3)\n/calc 10 / 4');
        return;
      }
      // safe math only: digits, operators, parentheses, decimal, spaces
      if (!/^[0-9+\-*/().%\s]+$/.test(expr)) {
        await ctx.reply('Only numbers and + - * / % ( ) allowed.');
        return;
      }
      if (expr.length > 80) {
        await ctx.reply('Expression too long.');
        return;
      }
      // eslint-disable-next-line no-new-func
      const result = Function(`"use strict"; return (${expr});`)();
      if (typeof result !== 'number' || !Number.isFinite(result)) {
        await ctx.reply('Could not calculate.');
        return;
      }
      await ctx.reply(`CALC\n${expr}\n= ${result}`);
    } catch (err) {
      await ctx.reply('calc failed. Check expression.');
    }
  });

  bot.command('time', async (ctx) => {
    try {
      const arg = (ctx.message.text || '')
        .replace(/^\/time(@\w+)?\s*/i, '')
        .trim()
        .toLowerCase();
      const zones = {
        lk: 'Asia/Colombo',
        colombo: 'Asia/Colombo',
        sri: 'Asia/Colombo',
        utc: 'UTC',
        india: 'Asia/Kolkata',
        dubai: 'Asia/Dubai',
        london: 'Europe/London',
        ny: 'America/New_York',
        tokyo: 'Asia/Tokyo',
      };
      const zone = zones[arg] || (arg.includes('/') ? arg : 'Asia/Colombo');
      const now = new Date();
      let formatted;
      try {
        formatted = now.toLocaleString('en-GB', {
          timeZone: zone,
          weekday: 'short',
          year: 'numeric',
          month: 'short',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        });
      } catch {
        await ctx.reply(
          'Unknown timezone.\nExamples:\n/time\n/time lk\n/time utc\n/time dubai\n/time London'
        );
        return;
      }
      await ctx.reply(
        `TIME\nZone: ${zone}\n${formatted}\n\nShortcuts: lk · utc · india · dubai · london · ny · tokyo`
      );
    } catch (err) {
      await ctx.reply('time failed.');
    }
  });

  bot.command('uuid', async (ctx) => {
    try {
      const id =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
              const r = (Math.random() * 16) | 0;
              const v = c === 'x' ? r : (r & 0x3) | 0x8;
              return v.toString(16);
            });
      await ctx.reply(`UUID\n${id}`);
    } catch (err) {
      await ctx.reply('uuid failed.');
    }
  });



  bot.command('pw', async (ctx) => {
    try {
      const arg = (ctx.message.text || '')
        .replace(/^\/pw(@\w+)?\s*/i, '')
        .trim();
      let len = parseInt(arg, 10);
      if (!Number.isFinite(len)) len = 16;
      len = Math.max(8, Math.min(64, len));
      const chars =
        'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
      let out = '';
      for (let i = 0; i < len; i++) {
        out += chars[Math.floor(Math.random() * chars.length)];
      }
      await ctx.reply(
        `PASSWORD (${len})\n${out}\n\nDo not share in public groups.`
      );
    } catch (err) {
      await ctx.reply('pw failed.');
    }
  });

  bot.command('b64', async (ctx) => {
    try {
      const raw = (ctx.message.text || '')
        .replace(/^\/b64(@\w+)?\s*/i, '')
        .trim();
      const m = raw.match(/^(enc|dec)\s+([\s\S]+)$/i);
      if (!m) {
        await ctx.reply(
          'Base64\n\nUsage:\n/b64 enc Hello\n/b64 dec SGVsbG8='
        );
        return;
      }
      const mode = m[1].toLowerCase();
      const payload = m[2].trim();
      if (mode === 'enc') {
        const encoded = Buffer.from(payload, 'utf8').toString('base64');
        await ctx.reply(`B64 ENC\n${encoded.slice(0, 3000)}`);
      } else {
        try {
          const decoded = Buffer.from(payload, 'base64').toString('utf8');
          await ctx.reply(`B64 DEC\n${decoded.slice(0, 3000)}`);
        } catch {
          await ctx.reply('Invalid base64.');
        }
      }
    } catch (err) {
      await ctx.reply('b64 failed.');
    }
  });

  bot.command('hash', async (ctx) => {
    try {
      const text = (ctx.message.text || '')
        .replace(/^\/hash(@\w+)?\s*/i, '')
        .trim();
      if (!text) {
        await ctx.reply('Usage:\n/hash some text');
        return;
      }
      const crypto = await import('crypto');
      const sha = crypto.createHash('sha256').update(text, 'utf8').digest('hex');
      await ctx.reply(`SHA-256\n${sha}`);
    } catch (err) {
      console.error('hash', err);
      await ctx.reply('hash failed.');
    }
  });



  bot.command('save', async (ctx) => {
    try {
      if (!supabase) {
        await ctx.reply('Supabase not connected.');
        return;
      }
      const text = (ctx.message.text || '')
        .replace(/^\/save(@\w+)?\s*/i, '')
        .trim()
        .slice(0, 500);
      if (!text) {
        await ctx.reply(
          'Save a personal note/link:\n/save https://...\n/save Buy new shoes\n\nList: /saves'
        );
        return;
      }
      const { error } = await supabase.from('rq_saves').insert({
        user_id: Number(ctx.from.id),
        username: ctx.from.username || ctx.from.first_name || String(ctx.from.id),
        text,
      });
      if (error) {
        await ctx.reply(`save failed: ${error.message}\nRun Phase W SQL.`);
        return;
      }
      await ctx.reply('Saved.\nView: /saves');
    } catch (err) {
      console.error('save', err);
      await ctx.reply('save failed.');
    }
  });

  bot.command('saves', async (ctx) => {
    try {
      if (!supabase) {
        await ctx.reply('Supabase not connected.');
        return;
      }
      const { data, error } = await supabase
        .from('rq_saves')
        .select('id, text, created_at')
        .eq('user_id', Number(ctx.from.id))
        .order('created_at', { ascending: false })
        .limit(15);
      if (error) {
        await ctx.reply(`saves failed: ${error.message}`);
        return;
      }
      if (!data?.length) {
        await ctx.reply('No saves yet.\n/save your note or link');
        return;
      }
      const lines = data
        .map((r, i) => `${i + 1}. [${r.id}] ${String(r.text).slice(0, 120)}`)
        .join('\n');
      await ctx.reply(
        `YOUR SAVES\n\n${lines}\n\nRemove: /unsave <id>\nClear all: /unsave all`
      );
    } catch (err) {
      console.error('saves', err);
      await ctx.reply('saves failed.');
    }
  });

  bot.command('unsave', async (ctx) => {
    try {
      if (!supabase) {
        await ctx.reply('Supabase not connected.');
        return;
      }
      const arg = (ctx.message.text || '')
        .replace(/^\/unsave(@\w+)?\s*/i, '')
        .trim()
        .toLowerCase();
      const uid = Number(ctx.from.id);

      if (arg === 'all') {
        const { error } = await supabase
          .from('rq_saves')
          .delete()
          .eq('user_id', uid);
        if (error) {
          await ctx.reply(`unsave failed: ${error.message}`);
          return;
        }
        await ctx.reply('All your saves cleared.');
        return;
      }

      const id = parseInt(arg, 10);
      if (!Number.isFinite(id)) {
        await ctx.reply('Usage:\n/unsave 3\n/unsave all');
        return;
      }

      const { error } = await supabase
        .from('rq_saves')
        .delete()
        .eq('user_id', uid)
        .eq('id', id);
      if (error) {
        await ctx.reply(`unsave failed: ${error.message}`);
        return;
      }
      await ctx.reply(`Removed save #${id}.`);
    } catch (err) {
      console.error('unsave', err);
      await ctx.reply('unsave failed.');
    }
  });



  bot.command('todo', async (ctx) => {
    try {
      if (!supabase) {
        await ctx.reply('Supabase not connected.');
        return;
      }
      const text = (ctx.message.text || '')
        .replace(/^\/todo(@\w+)?\s*/i, '')
        .trim()
        .slice(0, 300);
      if (!text) {
        await ctx.reply(
          'Add a personal todo:\n/todo Stretch after run\n\nList: /todos\nDone: /done <id>'
        );
        return;
      }
      const { error } = await supabase.from('rq_todos').insert({
        user_id: Number(ctx.from.id),
        username: ctx.from.username || ctx.from.first_name || String(ctx.from.id),
        text,
        done: false,
      });
      if (error) {
        await ctx.reply(`todo failed: ${error.message}\nRun Phase X SQL.`);
        return;
      }
      await ctx.reply('Todo added.\n/todos');
    } catch (err) {
      console.error('todo', err);
      await ctx.reply('todo failed.');
    }
  });

  bot.command('todos', async (ctx) => {
    try {
      if (!supabase) {
        await ctx.reply('Supabase not connected.');
        return;
      }
      const { data, error } = await supabase
        .from('rq_todos')
        .select('id, text, done, created_at')
        .eq('user_id', Number(ctx.from.id))
        .order('done', { ascending: true })
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) {
        await ctx.reply(`todos failed: ${error.message}`);
        return;
      }
      if (!data?.length) {
        await ctx.reply('No todos.\n/todo Your task');
        return;
      }
      const lines = data
        .map((t) => {
          const mark = t.done ? '✅' : '⬜';
          return `${mark} [${t.id}] ${String(t.text).slice(0, 100)}`;
        })
        .join('\n');
      await ctx.reply(
        `YOUR TODOS\n\n${lines}\n\nDone: /done <id>\nClear done: /done clear`
      );
    } catch (err) {
      console.error('todos', err);
      await ctx.reply('todos failed.');
    }
  });

  bot.command('done', async (ctx) => {
    try {
      if (!supabase) {
        await ctx.reply('Supabase not connected.');
        return;
      }
      const arg = (ctx.message.text || '')
        .replace(/^\/done(@\w+)?\s*/i, '')
        .trim()
        .toLowerCase();
      const uid = Number(ctx.from.id);

      if (arg === 'clear') {
        const { error } = await supabase
          .from('rq_todos')
          .delete()
          .eq('user_id', uid)
          .eq('done', true);
        if (error) {
          await ctx.reply(`done clear failed: ${error.message}`);
          return;
        }
        await ctx.reply('Cleared completed todos.');
        return;
      }

      const id = parseInt(arg, 10);
      if (!Number.isFinite(id)) {
        await ctx.reply('Usage:\n/done 3\n/done clear');
        return;
      }

      const { error } = await supabase
        .from('rq_todos')
        .update({ done: true })
        .eq('user_id', uid)
        .eq('id', id);
      if (error) {
        await ctx.reply(`done failed: ${error.message}`);
        return;
      }
      await ctx.reply(`Todo #${id} marked done.`);
    } catch (err) {
      console.error('done', err);
      await ctx.reply('done failed.');
    }
  });



  bot.command('habit', async (ctx) => {
    try {
      if (!supabase) {
        await ctx.reply('Supabase not connected.');
        return;
      }
      const name = (ctx.message.text || '')
        .replace(/^\/habit(@\w+)?\s*/i, '')
        .trim()
        .slice(0, 40)
        .toLowerCase() || 'run';
      const uid = Number(ctx.from.id);
      const day = new Date().toISOString().slice(0, 10); // UTC date key

      const { data: prev } = await supabase
        .from('rq_habits')
        .select('id, streak, last_day, total')
        .eq('user_id', uid)
        .eq('habit', name)
        .maybeSingle();

      if (prev?.last_day === day) {
        await ctx.reply(
          `HABIT · ${name}\nAlready checked in today.\nStreak: ${prev.streak || 0}\nTotal: ${prev.total || 0}`
        );
        return;
      }

      let streak = 1;
      let total = 1;
      if (prev) {
        total = (prev.total || 0) + 1;
        const last = prev.last_day ? new Date(prev.last_day + 'T00:00:00Z') : null;
        const today = new Date(day + 'T00:00:00Z');
        const diffDays = last
          ? Math.round((today - last) / 86400000)
          : 999;
        streak = diffDays === 1 ? (prev.streak || 0) + 1 : 1;
      }

      const { error } = await supabase.from('rq_habits').upsert(
        {
          user_id: uid,
          username: ctx.from.username || ctx.from.first_name || String(uid),
          habit: name,
          streak,
          total,
          last_day: day,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,habit' }
      );
      if (error) {
        await ctx.reply(`habit failed: ${error.message}\nRun Phase Y SQL.`);
        return;
      }
      await ctx.reply(
        `HABIT · ${name}\nChecked in for ${day} (UTC).\nStreak: ${streak}\nTotal: ${total}\n\n/habits`
      );
    } catch (err) {
      console.error('habit', err);
      await ctx.reply('habit failed.');
    }
  });

  bot.command('habits', async (ctx) => {
    try {
      if (!supabase) {
        await ctx.reply('Supabase not connected.');
        return;
      }
      const { data, error } = await supabase
        .from('rq_habits')
        .select('habit, streak, total, last_day')
        .eq('user_id', Number(ctx.from.id))
        .order('streak', { ascending: false })
        .limit(15);
      if (error) {
        await ctx.reply(`habits failed: ${error.message}`);
        return;
      }
      if (!data?.length) {
        await ctx.reply(
          'No habits yet.\nExamples:\n/habit run\n/habit stretch\n/habit water'
        );
        return;
      }
      const lines = data
        .map(
          (h) =>
            `• ${h.habit} — streak ${h.streak || 0} · total ${h.total || 0} · last ${h.last_day || '—'}`
        )
        .join('\n');
      await ctx.reply(`YOUR HABITS\n\n${lines}\n\nCheck in: /habit <name>`);
    } catch (err) {
      console.error('habits', err);
      await ctx.reply('habits failed.');
    }
  });




  bot.command('about', async (ctx) => {
    await ctx.reply(
      `RADIANT QUEEN · PASIYA MAX\n` +
        `Public AI + group tools + Radiant Gold\n` +
        `Status: STABLE v4.0 — Bot Factory locked — Bot Factory + Marketplace locked release\n\n` +
        `Version: ${typeof BOT_VERSION !== 'undefined' ? BOT_VERSION : 'v3.0'}\n` +
        `Bot: @PasiyaMaxQueen_bot\n` +
        `Web: https://radiant-queen-pasiya-max-v2.vercel.app\n` +
        `Create hub: https://radiant-queen-pasiya-max-v2.vercel.app/bot/\n` +
        `StrideClub: https://strideclub-platform-6b71a.containers.snapdeploy.app\n\n` +
        `What you get\n` +
        `• AI chat (uses Radiant Gold)\n` +
        `• Daily +50 gold · /daily\n` +
        `• Group admin pack · /groupadmin\n` +
        `• Weather, currency, runner tools\n` +
        `• Tenant bots · /setbot\n\n` +
        `Free tier = fair gold limits (no fake unlimited).\n` +
        `Invite friends: /invite\n` +
        `Free tools list: /tools\n` +
        `/menu · /balance · /links`
    );
  });



  bot.command('ghpath', async (ctx) => {
    try {
      if (!isAdmin(ctx)) {
        await ctx.reply('Founder only.');
        return;
      }
      if (ctx.chat?.type !== 'private') {
        await ctx.reply('Use /ghpath only in private chat with the bot.');
        return;
      }
      const path = (ctx.message.text || '')
        .replace(/^\/ghpath(@\w+)?\s*/i, '')
        .trim()
        .replace(/^\/+/, '');
      if (!path) {
        await ctx.reply(
          'Founder GitHub upload\n\n' +
            '1) /ghpath lib/aiRouter.js   ← FULL path with folder\n' +
            '2) Send file as Document\n\n' +
            'BEST: caption the document:\ngh lib/aiRouter.js\n' +
            '(caption never loses folder on cold start)\n\n' +
            `Repo: ${GITHUB_REPO}\nToken: ${GITHUB_TOKEN ? 'yes' : 'NO — set GITHUB_TOKEN with Contents: Read and write'}\n` +
            `Admin email (meta): ${ADMIN_EMAIL}`
        );
        return;
      }
      const saved = await setPendingGhPath(ctx.from.id, path);
      await ctx.reply(
        `Ready.\nPath: ${saved.path || path}\n` +
          `(saved for next document — survives Vercel cold start)\n` +
          `Now send the file as a Document (not photo).\n` +
          `Or caption the file: gh ${saved.path || path}`
      );
    } catch (err) {
      console.error('ghpath', err);
      await ctx.reply('ghpath failed.');
    }
  });

  bot.command('ghstatus', async (ctx) => {
    try {
      if (!isAdmin(ctx)) {
        await ctx.reply('Founder only.');
        return;
      }
      await ctx.reply(
        `GitHub upload\n` +
          `Repo: ${GITHUB_REPO}\n` +
          `Token: ${GITHUB_TOKEN ? 'yes' : 'NO'}\n` +
          `Admin Telegram ID: ${ADMIN_ID || '—'}\n` +
          `Admin email: ${ADMIN_EMAIL}\n` +
          `Pending path: ${(await getPendingGhPath(ctx.from.id)) || 'none'}\n\n` +
          `/ghpath api/telegram.js  then send file`
      );
    } catch (err) {
      await ctx.reply('ghstatus failed.');
    }
  });



  bot.command('ghlist', async (ctx) => {
    try {
      if (!isAdmin(ctx)) {
        await ctx.reply('Founder only.');
        return;
      }
      if (ctx.chat?.type !== 'private') {
        await ctx.reply('Use /ghlist in private chat.');
        return;
      }
      const path = (ctx.message.text || '')
        .replace(/^\/ghlist(@\w+)?\s*/i, '')
        .trim();
      await ctx.sendChatAction('typing');
      const res = await githubListPath(path);
      if (!res.ok) {
        await ctx.reply(`ghlist failed:\n${res.error}`);
        return;
      }
      await ctx.reply(
        `GITHUB LIST · ${GITHUB_REPO}\nPath: ${res.path}\n\n${res.lines.join('\n')}`.slice(0, 3500)
      );
    } catch (err) {
      console.error('ghlist', err);
      await ctx.reply('ghlist failed.');
    }
  });

  bot.command('ghget', async (ctx) => {
    try {
      if (!isAdmin(ctx)) {
        await ctx.reply('Founder only.');
        return;
      }
      if (ctx.chat?.type !== 'private') {
        await ctx.reply('Use /ghget in private chat.');
        return;
      }
      const path = (ctx.message.text || '')
        .replace(/^\/ghget(@\w+)?\s*/i, '')
        .trim()
        .replace(/^\/+/, '');
      if (!path) {
        await ctx.reply('Usage:\n/ghget api/telegram.js\n/ghget README.md');
        return;
      }
      await ctx.sendChatAction('typing');
      const res = await githubGetFile(path);
      if (!res.ok) {
        await ctx.reply(`ghget failed:\n${res.error}`);
        return;
      }
      if (res.binary) {
        await ctx.reply(
          `Binary file (${res.size || '?'} bytes).\nOpen on GitHub:\n${res.url || path}`
        );
        return;
      }
      const body = res.text || '';
      if (body.length <= 3500) {
        await ctx.reply(
          `GITHUB FILE · ${res.path}\n${res.url || ''}\n\n${body}`.slice(0, 4000)
        );
      } else {
        // send as document
        const buf = Buffer.from(body, 'utf8');
        await ctx.replyWithDocument(
          { source: buf, filename: path.split('/').pop() || 'file.txt' },
          { caption: `From GitHub: ${res.path}` }
        );
      }
    } catch (err) {
      console.error('ghget', err);
      await ctx.reply(`ghget failed: ${String(err?.message || err).slice(0, 120)}`);
    }
  });

  bot.command('export', async (ctx) => {
    try {
      if (!supabase) {
        await ctx.reply('Supabase not connected.');
        return;
      }
      const uid = Number(ctx.from.id);
      await ctx.sendChatAction('typing');

      const [xp, saves, todos, habits] = await Promise.all([
        supabase.from('rq_run_xp').select('*').eq('user_id', uid).maybeSingle(),
        supabase.from('rq_saves').select('id, text, created_at').eq('user_id', uid).order('created_at', { ascending: false }).limit(50),
        supabase.from('rq_todos').select('id, text, done, created_at').eq('user_id', uid).order('created_at', { ascending: false }).limit(50),
        supabase.from('rq_habits').select('habit, streak, total, last_day').eq('user_id', uid).limit(30),
      ]);

      const payload = {
        exported_at: new Date().toISOString(),
        telegram_id: uid,
        username: ctx.from.username || ctx.from.first_name || null,
        run_xp: xp.data || null,
        saves: saves.data || [],
        todos: todos.data || [],
        habits: habits.data || [],
      };
      const json = JSON.stringify(payload, null, 2);
      if (json.length < 3000) {
        await ctx.reply(`EXPORT (JSON)\n\n${json}`.slice(0, 4000));
      } else {
        await ctx.replyWithDocument(
          {
            source: Buffer.from(json, 'utf8'),
            filename: `pasiya-export-${uid}.json`,
          },
          { caption: 'Your personal data export (Supabase)' }
        );
      }
    } catch (err) {
      console.error('export', err);
      await ctx.reply('export failed.');
    }
  });



  bot.command('ghlog', async (ctx) => {
    try {
      if (!isAdmin(ctx)) {
        await ctx.reply('Founder only.');
        return;
      }
      if (ctx.chat?.type !== 'private') {
        await ctx.reply('Use /ghlog in private chat.');
        return;
      }
      const arg = (ctx.message.text || '')
        .replace(/^\/ghlog(@\w+)?\s*/i, '')
        .trim();
      const n = parseInt(arg, 10) || 5;
      await ctx.sendChatAction('typing');
      const res = await githubRecentCommits(n);
      if (!res.ok) {
        await ctx.reply(`ghlog failed:\n${res.error}`);
        return;
      }
      await ctx.reply(
        `GITHUB COMMITS · ${res.repo}\n\n${res.lines.join('\n\n')}`.slice(0, 3500)
      );
    } catch (err) {
      console.error('ghlog', err);
      await ctx.reply('ghlog failed.');
    }
  });



  bot.command('sysbackup', async (ctx) => {
    try {
      if (!isAdmin(ctx)) {
        await ctx.reply('Founder only.');
        return;
      }
      if (ctx.chat?.type !== 'private') {
        await ctx.reply('Use /sysbackup in private chat.');
        return;
      }
      if (!supabase) {
        await ctx.reply('Supabase not connected.');
        return;
      }
      await ctx.sendChatAction('typing');

      const tables = [
        'group_settings',
        'rq_run_xp',
        'rq_warns',
        'rq_group_notes',
        'rq_feedback',
        'rq_faq',
        'rq_saves',
        'rq_todos',
        'rq_habits',
        'rq_group_reports',
      ];
      const snapshot = {
        exported_at: new Date().toISOString(),
        by: ctx.from.id,
        admin_email: typeof ADMIN_EMAIL !== 'undefined' ? ADMIN_EMAIL : null,
        repo: GITHUB_REPO,
        version: typeof BOT_VERSION !== 'undefined' ? BOT_VERSION : 'v2.9',
        tables: {},
      };

      for (const t of tables) {
        try {
          const { data, error, count } = await supabase
            .from(t)
            .select('*', { count: 'exact' })
            .limit(100);
          snapshot.tables[t] = error
            ? { error: error.message }
            : { count: count ?? (data?.length || 0), sample: data || [] };
        } catch (e) {
          snapshot.tables[t] = { error: String(e?.message || e) };
        }
      }

      const json = JSON.stringify(snapshot, null, 2);
      await ctx.replyWithDocument(
        {
          source: Buffer.from(json, 'utf8'),
          filename: `sysbackup-${Date.now()}.json`,
        },
        { caption: 'Founder system backup (samples up to 100 rows/table). Keep private.' }
      );
    } catch (err) {
      console.error('sysbackup', err);
      await ctx.reply(`sysbackup failed: ${String(err?.message || err).slice(0, 150)}`);
    }
  });



  bot.command('ocr', async (ctx) => {
    try {
      const uid = String(ctx.from.id);
      pendingTool.set(uid, 'ocr');
      await ctx.reply(
        'OCR mode ON.\nSend a photo of text (receipt, whiteboard, screenshot).\nCancel: send any other /command'
      );
    } catch (err) {
      await ctx.reply('ocr failed.');
    }
  });



  bot.command('weather', async (ctx) => {
    try {
      const place = (ctx.message.text || '')
        .replace(/^\/weather(@\w+)?\s*/i, '')
        .trim();
      if (!place) {
        await ctx.reply(
          'Usage:\n/weather Colombo\n/weather Kotte\n\nOr share a Telegram location.'
        );
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
      await ctx.sendChatAction('typing');
      const geo = await geocodePlace(place);
      if (!geo) {
        await ctx.reply('Place not found. Try another name.');
        return;
      }
      const w = await fetchWeather(geo.lat, geo.lon);
      if (!w.ok) {
        await ctx.reply(`weather failed: ${w.error}`);
        return;
      }
      const label = [geo.name, geo.admin1, geo.country].filter(Boolean).join(', ');
      await ctx.reply(
        `WEATHER · ${label}\n` +
          `Now: ${w.temp}°C (feels ${w.feels}°C)\n` +
          `Condition: ${weatherCodeText(w.code)}\n` +
          `Humidity: ${w.humidity}% · Wind: ${w.wind} km/h\n` +
          `Precip now: ${w.precip} mm\n` +
          `Today: ${w.tmin}°C – ${w.tmax}°C · Rain day: ${w.precipDay} mm\n` +
          `TZ: ${w.timezone}\n\n` +
          `Tip: Hydrate early if heat/humidity high. Reflective gear if dark.`
      );
    } catch (err) {
      console.error('weather', err);
      await ctx.reply('weather failed.');
    }
  });



  bot.command('forecast', async (ctx) => {
    try {
      const raw = (ctx.message.text || '')
        .replace(/^\/forecast(@\w+)?\s*/i, '')
        .trim();
      if (!raw) {
        await ctx.reply(
          'Usage:\n/forecast Colombo\n/forecast Kotte 5\n\nDays: 1–7 (default 3)'
        );
        return;
      }
      const parts = raw.split(/\s+/);
      let days = 3;
      let place = raw;
      const last = parts[parts.length - 1];
      if (/^\d+$/.test(last) && parts.length >= 2) {
        days = parseInt(last, 10);
        place = parts.slice(0, -1).join(' ');
      }
      const uid = String(ctx.from.id);
      if (!isAdmin(ctx)) {
        const rate = await checkRateLimit(uid);
        if (!rate.ok) {
          await ctx.reply(`Slow down. Retry in ~${rate.waitSec}s.`);
          return;
        }
      }
      await ctx.sendChatAction('typing');
      const geo = await geocodePlace(place);
      if (!geo) {
        await ctx.reply('Place not found. Try another name.');
        return;
      }
      const f = await fetchForecast(geo.lat, geo.lon, days);
      if (!f.ok) {
        await ctx.reply(`forecast failed: ${f.error}`);
        return;
      }
      const label = [geo.name, geo.admin1, geo.country].filter(Boolean).join(', ');
      await ctx.reply(
        `FORECAST · ${label}\nTZ: ${f.timezone}\n\n${f.lines.join('\n')}`.slice(0, 3500)
      );
    } catch (err) {
      console.error('forecast', err);
      await ctx.reply('forecast failed.');
    }
  });



  bot.command('sun', async (ctx) => {
    try {
      const place = (ctx.message.text || '')
        .replace(/^\/sun(@\w+)?\s*/i, '')
        .trim();
      if (!place) {
        await ctx.reply('Usage:\n/sun Colombo\n/sun Kotte\n\nSunrise / sunset for runners.');
        return;
      }
      await ctx.sendChatAction('typing');
      const geo = await geocodePlace(place);
      if (!geo) {
        await ctx.reply('Place not found.');
        return;
      }
      const s = await fetchSun(geo.lat, geo.lon);
      if (!s.ok) {
        await ctx.reply(`sun failed: ${s.error}`);
        return;
      }
      const label = [geo.name, geo.admin1, geo.country].filter(Boolean).join(', ');
      const dayH = s.daylight != null ? (Number(s.daylight) / 3600).toFixed(1) : '—';
      await ctx.reply(
        `SUN · ${label}\n` +
          `Sunrise: ${s.sunrise}\n` +
          `Sunset: ${s.sunset}\n` +
          `Daylight: ~${dayH} h\n` +
          `TZ: ${s.timezone}\n\n` +
          `Tip: Early run after sunrise or finish before sunset for visibility.`
      );
    } catch (err) {
      console.error('sun', err);
      await ctx.reply('sun failed.');
    }
  });

  bot.command('aqi', async (ctx) => {
    try {
      const place = (ctx.message.text || '')
        .replace(/^\/aqi(@\w+)?\s*/i, '')
        .trim();
      if (!place) {
        await ctx.reply('Usage:\n/aqi Colombo\n/aqi Kotte\n\nAir quality for outdoor training.');
        return;
      }
      await ctx.sendChatAction('typing');
      const geo = await geocodePlace(place);
      if (!geo) {
        await ctx.reply('Place not found.');
        return;
      }
      const a = await fetchAqi(geo.lat, geo.lon);
      if (!a.ok) {
        await ctx.reply(`aqi failed: ${a.error}`);
        return;
      }
      const label = [geo.name, geo.admin1, geo.country].filter(Boolean).join(', ');
      await ctx.reply(
        `AQI · ${label}\n` +
          `European AQI: ${a.eaqi} (${aqiLabel(a.eaqi)})\n` +
          `PM2.5: ${a.pm25} · PM10: ${a.pm10}\n` +
          `NO2: ${a.no2} · O3: ${a.o3} · CO: ${a.co}\n` +
          `TZ: ${a.timezone}\n\n` +
          `Tip: If AQI is Poor or worse, prefer easy indoor / shorter outdoor sessions.`
      );
    } catch (err) {
      console.error('aqi', err);
      await ctx.reply('aqi failed.');
    }
  });



  bot.command('currency', async (ctx) => {
    try {
      await handleCurrencyCommand(ctx);
    } catch (err) {
      console.error('currency', err);
      await ctx.reply('currency failed.');
    }
  });

  bot.command('moon', async (ctx) => {
    try {
      await handleMoonCommand(ctx);
    } catch (err) {
      console.error('moon', err);
      await ctx.reply('moon failed.');
    }
  });




  bot.command('competitor', async (ctx) => {
    try {
      if (!isAdmin(ctx)) {
        await ctx.reply('Founder only.');
        return;
      }
      await ctx.reply('Running Radiant Queen competitor watch (Gemini)…');
      await ctx.sendChatAction('typing');
      const prompt =
        `You are a product strategist for STRIDECLUB (AI running club by Radiant Queen / Pasiya Max).\n` +
        `Write a concise COMPETITOR POSITIONING brief (max 400 words) on Strava, Nike Run Club, Adidas Running.\n` +
        `End with 5 free-tier feature ideas for StrideClub. Plain text. Brands: StrideClub, Radiant Queen only.`;
      const out = await generateReply(prompt, ctx);
      await ctx.reply(
        (`RADIANT QUEEN · COMPETITOR WATCH\n\n` + out).slice(0, 4000)
      );
    } catch (err) {
      console.error('competitor', err);
      await ctx.reply(`competitor failed: ${String(err?.message || err).slice(0, 150)}`);
    }
  });



  bot.command('setbot', async (ctx) => {
    try {
      if (ctx.chat?.type !== 'private') {
        await ctx.reply('For safety, /setbot works only in private chat.');
        return;
      }
      const token = (ctx.message.text || '')
        .replace(/^\/setbot(@\w+)?\s*/i, '')
        .trim();
      if (!token || token.length < 30 || !token.includes(':')) {
        await ctx.reply(
          `Radiant Queen · Host your bot\n\n` +
            `1) @BotFather → /newbot\n` +
            `2) Copy the HTTP API token\n` +
            `3) Send:\n/setbot 123456:ABC-DEF...\n\n` +
            `Your bot will answer with the Radiant Queen engine.\n` +
            `Token is stored in Supabase (service role). Private chat only.`
        );
        return;
      }
      // try delete user message to reduce token leak in chat history
      try {
        await ctx.deleteMessage();
      } catch (_) {}

      await ctx.reply('Validating token with Telegram…');
      const me = await telegramGetMe(token);
      if (!me.ok) {
        await ctx.reply(`Invalid token: ${me.error}`);
        return;
      }

      const appBase = (
        process.env.APP_URL ||
        process.env.PUBLIC_APP_URL ||
        'https://radiant-queen-pasiya-max-v2.vercel.app'
      )
        .trim()
        .replace(/\/$/, '');
      const base = appBase.startsWith('http') ? appBase : `https://${appBase}`;
      // Prefer stable production URL — never ephemeral VERCEL_URL preview host
      const hook = `${base}/api/tenant-webhook?owner=${ctx.from.id}`;

      const wh = await telegramSetWebhook(token, hook);
      if (!wh.ok) {
        await ctx.reply(`Webhook failed: ${wh.error || 'unknown'}\nToken not saved.`);
        return;
      }

      const saved = await saveUserBot(ctx.from.id, token, {
        bot_id: me.bot_id,
        bot_username: me.bot_username,
        bot_name: me.bot_name,
        webhook_set: true,
      });
      if (!saved.ok) {
        await ctx.reply(`DB save failed: ${saved.error}`);
        return;
      }

      await ctx.reply(
        `Radiant Queen tenant bot linked!\n\n` +
          `Bot: @${me.bot_username} (${me.bot_name})\n` +
          `Webhook: set\n` +
          `Engine: Radiant Queen\n\n` +
          `Open your bot and send /start\n` +
          `/mybot · /delbot`
      );
    } catch (err) {
      console.error('setbot', err);
      await ctx.reply(`setbot failed: ${String(err?.message || err).slice(0, 150)}`);
    }
  });



  bot.command('settenantwelcome', async (ctx) => {
    try {
      if (ctx.chat?.type !== 'private') {
        await ctx.reply('Private chat only.');
        return;
      }
      const text = (ctx.message.text || '')
        .replace(/^\/settenantwelcome(@\w+)?\s*/i, '')
        .trim();
      if (!text) {
        await ctx.reply(
          `Set welcome for YOUR tenant bot:\n` +
            `/settenantwelcome Welcome to my Radiant Queen powered bot!\n\n` +
            `Clear: /settenantwelcome clear`
        );
        return;
      }
      const row = await getUserBot(ctx.from.id);
      if (!row) {
        await ctx.reply('No tenant bot. /setbot first.');
        return;
      }
      if (text.toLowerCase() === 'clear') {
        const r = await setTenantWelcome(ctx.from.id, '');
        await ctx.reply(r.ok ? 'Tenant welcome cleared (default used).' : `Fail: ${r.error}`);
        return;
      }
      const r = await setTenantWelcome(ctx.from.id, text);
      if (!r.ok) {
        await ctx.reply(
          `Save failed: ${r.error}\n` +
            `If column missing, run SQL:\n` +
            `alter table public.rq_user_bots add column if not exists welcome_text text;`
        );
        return;
      }
      await ctx.reply(
        `Tenant welcome saved for @${row.bot_username || 'bot'}.\n` +
          `Users see it on /start.\n\nPreview:\n${text.slice(0, 500)}`
      );
    } catch (err) {
      await ctx.reply(`settenantwelcome failed: ${String(err?.message || err).slice(0, 120)}`);
    }
  });

  bot.command('tenantwelcome', async (ctx) => {
    try {
      const row = await getUserBot(ctx.from.id);
      if (!row) {
        await ctx.reply('No tenant bot.');
        return;
      }
      const w = row.welcome_text || '(default Radiant Queen welcome)';
      await ctx.reply(`Current tenant welcome:\n\n${w}`);
    } catch (err) {
      await ctx.reply('tenantwelcome failed.');
    }
  });


  bot.command('resyncbot', async (ctx) => {
    try {
      if (ctx.chat?.type !== 'private') {
        await ctx.reply('Use /resyncbot in private chat.');
        return;
      }
      const row = await getUserBot(ctx.from.id);
      if (!row?.bot_token) {
        await ctx.reply('No bot linked. Use /setbot <token> first.');
        return;
      }
      const appBase = (
        process.env.APP_URL ||
        process.env.PUBLIC_APP_URL ||
        'https://radiant-queen-pasiya-max-v2.vercel.app'
      )
        .trim()
        .replace(/\/$/, '');
      const base = appBase.startsWith('http') ? appBase : `https://${appBase}`;
      const hook = `${base}/api/tenant-webhook?owner=${ctx.from.id}`;
      const wh = await telegramSetWebhook(row.bot_token, hook);
      if (!wh.ok) {
        await ctx.reply(`Webhook re-set failed: ${wh.error || 'unknown'}`);
        return;
      }
      await saveUserBot(ctx.from.id, row.bot_token, {
        bot_id: row.bot_id,
        bot_username: row.bot_username,
        bot_name: row.bot_name,
        webhook_set: true,
      });
      await ctx.reply(
        `Webhook re-synced!\nURL:\n${hook}\n\nOpen @${row.bot_username || 'your_bot'} and send /start again.`
      );
    } catch (err) {
      console.error('resyncbot', err);
      await ctx.reply(`resyncbot failed: ${String(err?.message || err).slice(0, 150)}`);
    }
  });


  bot.command('mybot', async (ctx) => {
    try {
      const row = await getUserBot(ctx.from.id);
      if (!row) {
        await ctx.reply('No tenant bot linked.\nUse /setbot <token> in private chat.');
        return;
      }
      await ctx.reply(
        `YOUR RADIANT QUEEN TENANT BOT\n\n` +
          `Username: @${row.bot_username || '—'}\n` +
          `Name: ${row.bot_name || '—'}\n` +
          `Active: ${row.is_active ? 'yes' : 'no'}\n` +
          `Webhook: ${row.webhook_set ? 'yes' : 'no'}\n` +
          `Owner ID: ${row.owner_id}\n\n` +
          `/delbot to remove`
      );
    } catch (err) {
      await ctx.reply('mybot failed.');
    }
  });

  bot.command('delbot', async (ctx) => {
    try {
      if (ctx.chat?.type !== 'private') {
        await ctx.reply('Use /delbot in private chat.');
        return;
      }
      const r = await deleteUserBot(ctx.from.id);
      if (!r.ok) {
        await ctx.reply(`delbot failed: ${r.error || 'error'}`);
        return;
      }
      await ctx.reply('Tenant bot removed + webhook deleted.');
    } catch (err) {
      await ctx.reply('delbot failed.');
    }
  });




  bot.command(['tools', 'freetools', 'utilities'], async (ctx) => {
    const msg =
      `RADIANT QUEEN · FREE TOOLS\n` +
      `(Work even when AI quota is resting)\n\n` +
      `SYSTEM\n` +
      `/ping · /version · /about · /links · /invite\n\n` +
      `GOLD\n` +
      `/balance · /gold · /daily · /claim · /prices\n\n` +
      `WEATHER & SKY\n` +
      `/weather <city> · /forecast <city>\n` +
      `/sun <city> · /aqi <city> · /moon\n\n` +
      `MONEY & MATH\n` +
      `/currency USD LKR · /calc 10*5\n` +
      `/time · /uuid\n\n` +
      `CRYPTO UTILS\n` +
      `/pw · /b64 · /hash\n\n` +
      `PERSONAL DB\n` +
      `/todo · /todos · /done\n` +
      `/save · /saves · /unsave\n` +
      `/habit · /habits · /export\n\n` +
      `RUNNER\n` +
      `/pace · /split · /convert\n` +
      `/stride · /runxp · /xptop\n\n` +
      `GROUP ADMIN\n` +
      `/groupadmin · /gadmin\n\n` +
      `AI (uses Radiant Gold / Gemini quota)\n` +
      `Send any text · vision · voice\n` +
      `/wiki · /web · /code · /define · /tr\n\n` +
      `When AI is busy → use this list.\n` +
      `— Radiant Queen · Pasiya Max`;
    await uiReply(ctx, msg.slice(0, 4000), toolsKeyboard());
  });


  // P3 Referral
  bot.command(['ref', 'myref', 'invitegold'], async (ctx) => {
    try {
      const { refStartLink, referralStats, REF_BONUS_REFERRER, REF_BONUS_REFERRED } = await import(
        '../lib/referral.js'
      );
      const me = ctx.botInfo?.username || process.env.BOT_USERNAME || 'PasiyaMaxQueen_bot';
      const link = refStartLink(me, ctx.from.id);
      const st = await referralStats(supabase, ctx.from.id);
      await ctx.reply(
        '🎁 RADIANT REFERRAL\n\n' +
          'Your link:\n' +
          link +
          '\n\n' +
          'Friend gets +' +
          REF_BONUS_REFERRED +
          ' gold\n' +
          'You get +' +
          REF_BONUS_REFERRER +
          ' gold per friend\n\n' +
          'Invites: ' +
          st.count +
          ' · Earned: ' +
          st.earned +
          ' gold\n' +
          '/refstats · /balance'
      );
    } catch (e) {
      await ctx.reply('ref failed: ' + (e.message || e));
    }
  });

  bot.command(['refstats', 'referrals'], async (ctx) => {
    try {
      const { referralStats } = await import('../lib/referral.js');
      const st = await referralStats(supabase, ctx.from.id);
      await ctx.reply(
        '📊 Referral stats\n' +
          'Friends invited: ' +
          st.count +
          '\n' +
          'Gold earned: ' +
          st.earned +
          '\n' +
          '/ref — get invite link'
      );
    } catch (e) {
      await ctx.reply('refstats failed: ' + (e.message || e));
    }
  });


  // P4 Founder pulse
  bot.command(['pulse', 'founderpulse', 'syspulse'], async (ctx) => {
    try {
      if (!isAdmin(ctx)) {
        await ctx.reply('Founder only. /version');
        return;
      }
      const lines = [
        '⚡ FOUNDER PULSE',
        'Version: ' + (typeof BOT_VERSION !== 'undefined' ? BOT_VERSION : ''),
        '',
      ];
      if (!supabase) {
        lines.push('Supabase: NO');
        await ctx.reply(lines.join('\n'));
        return;
      }
      async function countTable(table) {
        try {
          const { count, error } = await supabase
            .from(table)
            .select('*', { count: 'exact', head: true });
          if (error) return '?';
          return count ?? 0;
        } catch (_) {
          return '?';
        }
      }
      const goldUsers = await countTable('rq_gold');
      const reminders = await countTable('rq_reminders');
      const refs = await countTable('rq_referrals');
      const memory = await countTable('rq_ai_memory');
      let activeReminders = '?';
      try {
        const { count } = await supabase
          .from('rq_reminders')
          .select('*', { count: 'exact', head: true })
          .eq('active', true);
        activeReminders = count ?? 0;
      } catch (_) {}
      let totalGold = '?';
      try {
        const { data } = await supabase.from('rq_gold').select('gold');
        if (data) totalGold = data.reduce((s, r) => s + (Number(r.gold) || 0), 0);
      } catch (_) {}
      lines.push('Supabase: yes');
      lines.push('Gold wallets: ' + goldUsers);
      lines.push('Gold in circulation: ' + totalGold);
      lines.push('Referrals rows: ' + refs);
      lines.push('Reminders total: ' + reminders + ' · active: ' + activeReminders);
      lines.push('AI memory rows: ' + memory);
      lines.push('');
      lines.push('Keys');
      lines.push('BOT_TOKEN: ' + (BOT_TOKEN ? 'yes' : 'NO'));
      lines.push('GEMINI: ' + (GEMINI_KEY ? 'yes' : 'no'));
      lines.push('GROQ: ' + (process.env.GROQ_API_KEY ? 'yes' : 'no'));
      lines.push('OPENROUTER: ' + (process.env.OPENROUTER_API_KEY ? 'yes' : 'no'));
      lines.push('CRON_SECRET: ' + (process.env.CRON_SECRET ? 'yes' : 'no'));
      lines.push('');
      lines.push('Inline: type @' + (ctx.botInfo?.username || 'PasiyaMaxQueen_bot') + ' in any chat');
      lines.push('/ref · /remindlist · /aistatus · /agentpulse');
      await ctx.reply(lines.join('\n').slice(0, 3500));
    } catch (e) {
      await ctx.reply('pulse failed: ' + (e.message || e));
    }
  });


  // P5 Founder daily-style digest
  bot.command(['digest', 'dailydigest'], async (ctx) => {
    try {
      if (!isAdmin(ctx)) {
        await ctx.reply('Founder only.');
        return;
      }
      const now = new Date();
      const lines = [
        '📬 FOUNDER DIGEST',
        'Time: ' + now.toISOString(),
        'Version: ' + (typeof BOT_VERSION !== 'undefined' ? BOT_VERSION : ''),
        '',
      ];
      if (!supabase) {
        lines.push('Supabase offline.');
        await ctx.reply(lines.join('\n'));
        return;
      }
      let activeRem = 0;
      let dueSoon = [];
      try {
        const { data } = await supabase
          .from('rq_reminders')
          .select('id, message, due_at, user_id')
          .eq('active', true)
          .order('due_at', { ascending: true })
          .limit(8);
        if (data) {
          activeRem = data.length;
          dueSoon = data;
        }
      } catch (_) {}
      let refCount = 0;
      try {
        const { count } = await supabase
          .from('rq_referrals')
          .select('*', { count: 'exact', head: true });
        refCount = count ?? 0;
      } catch (_) {}
      let goldSum = 0;
      let wallets = 0;
      try {
        const { data } = await supabase.from('rq_gold').select('gold');
        if (data) {
          wallets = data.length;
          goldSum = data.reduce((s, r) => s + (Number(r.gold) || 0), 0);
        }
      } catch (_) {}
      lines.push('Wallets: ' + wallets + ' · Gold total: ' + goldSum);
      lines.push('Referrals: ' + refCount);
      lines.push('Active reminders listed: ' + activeRem);
      if (dueSoon.length) {
        lines.push('');
        lines.push('Next reminders:');
        for (const r of dueSoon.slice(0, 5)) {
          lines.push(
            '#' +
              r.id +
              ' @' +
              r.due_at +
              ' — ' +
              String(r.message || '').slice(0, 40)
          );
        }
      }
      lines.push('');
      lines.push('Tips: /pulse · /remindlist · /refstats · cron-job.org every 5m');
      await ctx.reply(lines.join('\n').slice(0, 3500));
    } catch (e) {
      await ctx.reply('digest failed: ' + (e.message || e));
    }
  });


  // P6 Premium + Analytics
  bot.command(['premium'], async (ctx) => {
    try {
      const raw = (ctx.message?.text || '')
        .replace(/^\/premium(@\w+)?\s*/i, '')
        .trim();
      const parts = raw.split(/\s+/).filter(Boolean);

      // /premium status  OR empty
      if (!parts.length || parts[0].toLowerCase() === 'status' || parts[0].toLowerCase() === 'me') {
        const g = await getOrCreateGold(ctx.from.id, ctx.from.username || ctx.from.first_name);
        await ctx.reply(
          '💎 PREMIUM STATUS\n' +
            'User: ' +
            ctx.from.id +
            '\n' +
            'Premium: ' +
            (g.premium ? 'YES' : 'no') +
            '\n' +
            'Gold: ' +
            (g.gold ?? '?') +
            '\n\n' +
            (isAdmin(ctx)
              ? 'Founder: /premium <user_id> on|off'
              : 'Ask founder for premium.')
        );
        await logEvent(ctx.from.id, 'premium_status', null);
        return;
      }

      if (!isAdmin(ctx)) {
        await ctx.reply('Only founder can change premium flags.');
        return;
      }

      // /premium <user_id> on|off
      const target = Number(parts[0]);
      const flag = String(parts[1] || '').toLowerCase();
      if (!Number.isFinite(target) || !['on', 'off', 'true', 'false', '1', '0'].includes(flag)) {
        await ctx.reply('Usage:\n/premium status\n/premium <user_id> on\n/premium <user_id> off');
        return;
      }
      const on = flag === 'on' || flag === 'true' || flag === '1';
      await getOrCreateGold(target, null);
      if (!supabase) {
        await ctx.reply('Supabase missing');
        return;
      }
      const { error } = await supabase
        .from('rq_gold')
        .update({ premium: on, updated_at: new Date().toISOString() })
        .eq('user_id', target);
      if (error) {
        await ctx.reply('premium failed: ' + error.message);
        return;
      }
      await logEvent(ctx.from.id, 'premium_set', { target, on });
      await ctx.reply(
        'Premium ' + (on ? 'ON' : 'OFF') + ' for user ' + target + '\nThey get unlimited AI spend.'
      );
    } catch (e) {
      await ctx.reply('premium failed: ' + (e.message || e));
    }
  });

  bot.command(['analytics', 'statsweb'], async (ctx) => {
    try {
      const url =
        'https://radiant-queen-pasiya-max-v2.vercel.app/bot/analytics.html';
      let extra = '';
      if (isAdmin(ctx) && supabase) {
        try {
          const { count: wallets } = await supabase
            .from('rq_gold')
            .select('*', { count: 'exact', head: true });
          const { count: premium } = await supabase
            .from('rq_gold')
            .select('*', { count: 'exact', head: true })
            .eq('premium', true);
          extra =
            '\n\nSnapshot\nWallets: ' +
            (wallets ?? '?') +
            '\nPremium: ' +
            (premium ?? '?');
        } catch (_) {}
      }
      await ctx.reply(
        '📊 ANALYTICS\n' +
          'Web: ' +
          url +
          '\n' +
          'API: /api/stats?secret=YOUR_CRON_SECRET\n' +
          extra +
          '\n\n/pulse · /digest · /premium status'
      );
      await logEvent(ctx.from?.id, 'analytics_open', null);
    } catch (e) {
      await ctx.reply('analytics failed: ' + (e.message || e));
    }
  });


  // P7 Perks + founder export
  bot.command(['perks', 'premiumperks'], async (ctx) => {
    try {
      const g = await getOrCreateGold(ctx.from.id, ctx.from.username || ctx.from.first_name);
      await ctx.reply(
        '💎 RADIANT PREMIUM PERKS\n\n' +
          'Free users\n' +
          '· Start gold: 400 · Daily +50\n' +
          '· AI ask 5 · Vision 10 · Voice 10\n' +
          '· Rate limit on AI (fair use)\n\n' +
          'Premium users\n' +
          '· Unlimited AI gold spend\n' +
          '· No AI rate limit\n' +
          '· Daily claim +' + GOLD_DAILY_PREMIUM + ' (vs +' + GOLD_DAILY + ')\n' +
          '· Priority inline ask\n' +
          '· Premium badge on /premium status\n\n' +
          'Your status: ' +
          (g.premium ? 'PREMIUM ✅' : 'Standard') +
          '\nGold: ' +
          (g.gold ?? '?') +
          '\n\nFounder sets: /premium <user_id> on'
      );
      await logEvent(ctx.from?.id, 'perks_view', { premium: !!g.premium });
    } catch (e) {
      await ctx.reply('perks failed: ' + (e.message || e));
    }
  });

  bot.command(['exportstats', 'exportjson'], async (ctx) => {
    try {
      if (!isAdmin(ctx)) {
        await ctx.reply('Founder only.');
        return;
      }
      if (!supabase) {
        await ctx.reply('Supabase missing');
        return;
      }
      await ctx.sendChatAction('upload_document');
      const payload = {
        exported_at: new Date().toISOString(),
        version: typeof BOT_VERSION !== 'undefined' ? BOT_VERSION : '',
        economy: {},
        activity: {},
      };
      try {
        const { data: goldRows } = await supabase.from('rq_gold').select('user_id, username, gold, premium, last_daily, updated_at');
        payload.economy.wallets = goldRows || [];
        payload.economy.goldSum = (goldRows || []).reduce((s, r) => s + (Number(r.gold) || 0), 0);
        payload.economy.premiumCount = (goldRows || []).filter((r) => r.premium).length;
      } catch (e) {
        payload.economy.error = String(e.message || e);
      }
      try {
        const { count: rem } = await supabase.from('rq_reminders').select('*', { count: 'exact', head: true }).eq('active', true);
        const { count: refs } = await supabase.from('rq_referrals').select('*', { count: 'exact', head: true });
        const { count: mem } = await supabase.from('rq_ai_memory').select('*', { count: 'exact', head: true });
        const { count: ev } = await supabase.from('rq_events').select('*', { count: 'exact', head: true });
        payload.activity = {
          activeReminders: rem ?? 0,
          referrals: refs ?? 0,
          memoryRows: mem ?? 0,
          events: ev ?? 0,
        };
      } catch (e) {
        payload.activity.error = String(e.message || e);
      }
      try {
        const since7 = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        const { data: evs } = await supabase.from('rq_events').select('event').gte('created_at', since7).limit(500);
        const map = {};
        for (const row of evs || []) {
          map[row.event] = (map[row.event] || 0) + 1;
        }
        payload.topEvents = Object.entries(map)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 20)
          .map(([event, count]) => ({ event, count }));
      } catch (_) {
        payload.topEvents = [];
      }
      const buf = Buffer.from(JSON.stringify(payload, null, 2), 'utf8');
      await ctx.replyWithDocument({
        source: buf,
        filename: 'radiant-queen-stats-' + Date.now() + '.json',
      });
      await logEvent(ctx.from.id, 'export_stats', null);
    } catch (e) {
      await ctx.reply('exportstats failed: ' + (e.message || e));
    }
  });


  bot.command(['exportcsv', 'csv'], async (ctx) => {
    try {
      if (!isAdmin(ctx)) {
        await ctx.reply('Founder only.');
        return;
      }
      if (!supabase) {
        await ctx.reply('Supabase missing');
        return;
      }
      await ctx.sendChatAction('upload_document');
      const { data: goldRows, error } = await supabase
        .from('rq_gold')
        .select('user_id, username, gold, premium, last_daily, updated_at')
        .order('gold', { ascending: false });
      if (error) {
        await ctx.reply('exportcsv failed: ' + error.message);
        return;
      }
      const esc = (v) => {
        const s = String(v == null ? '' : v);
        if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
        return s;
      };
      const header = 'user_id,username,gold,premium,last_daily,updated_at';
      const lines = [header];
      for (const r of goldRows || []) {
        lines.push(
          [
            esc(r.user_id),
            esc(r.username),
            esc(r.gold),
            esc(r.premium ? 'yes' : 'no'),
            esc(r.last_daily),
            esc(r.updated_at),
          ].join(',')
        );
      }
      const buf = Buffer.from(lines.join('\n'), 'utf8');
      await ctx.replyWithDocument({
        source: buf,
        filename: 'radiant-gold-' + Date.now() + '.csv',
      });
      await logEvent(ctx.from.id, 'export_csv', { rows: (goldRows || []).length });
    } catch (e) {
      await ctx.reply('exportcsv failed: ' + (e.message || e));
    }
  });

  bot.command(['balance', 'gold'], async (ctx) => {
    try {
      if (!(await requireFeature(ctx, 'gold', 'Gold pack'))) return;
      const g = await getOrCreateGold(
        ctx.from.id,
        ctx.from.username || ctx.from.first_name
      );
      if (!g.ok && g.error === 'no_db') {
        await ctx.reply('Gold DB not connected (Supabase).');
        return;
      }
      if (!g.ok) {
        await ctx.reply(`balance failed: ${g.error}`);
        return;
      }
      const name = ctx.from.first_name || ctx.from.username || 'Runner';
      const lines = [
        'RADIANT GOLD · WALLET',
        `Hi ${name}`,
        '',
        `Balance: ${g.gold} gold`,
        `Premium: ${g.premium ? 'YES ✅ · unlimited AI + no rate limit' : 'no · /perks'}`,
      ];
      if (g.newUser) {
        lines.push(`Welcome bonus applied: ${GOLD_START}`);
      }
      if (g.last_daily) {
        lines.push(`Last daily: ${g.last_daily}`);
      }
      lines.push('');
      lines.push('Earn');
      lines.push(`/daily → +${GOLD_DAILY}` + (g.premium ? ` / premium +${GOLD_DAILY_PREMIUM}` : '') + ' once per day');
      lines.push('');
      lines.push('Spend');
      lines.push(`AI text / ask → ${GOLD_COST.ask}`);
      lines.push(`Vision / photo → ${GOLD_COST.vision}`);
      lines.push(`Voice → ${GOLD_COST.voice}`);
      lines.push(`Stride bridge → ${GOLD_COST.stride}`);
      if (isAdmin(ctx)) {
        lines.push('');
        lines.push('Founder: unlimited (no charge)');
      }
      lines.push('');
      lines.push('— Radiant Queen · Pasiya Max');
      await uiReply(ctx, lines.join('\n'), goldKeyboard());
    } catch (err) {
      console.error('balance', err);
      await ctx.reply('balance failed.');
    }
  });



  bot.command(['daily', 'claim'], async (ctx) => {
    try {
      if (isAdmin(ctx)) {
        await ctx.reply(
          'Founder account — unlimited Radiant Gold.\n' +
            'No daily claim needed.\n/balance · /gold'
        );
        return;
      }
      const g = await getOrCreateGold(
        ctx.from.id,
        ctx.from.username || ctx.from.first_name
      );
      if (!g.ok) {
        await ctx.reply(`daily failed: ${g.error || 'db'}`);
        return;
      }
      const today = new Date().toISOString().slice(0, 10);
      const claimAmt = g.premium ? GOLD_DAILY_PREMIUM : GOLD_DAILY;
      if (g.last_daily === today) {
        await ctx.reply(
          `Already claimed today.\n` +
            `Balance: ${g.gold} gold\n` +
            `Come back tomorrow for +${claimAmt}` +
            (g.premium ? ' (premium boost).\n\n' : '.\n\n') +
            `/balance · /gold · /perks`
        );
        return;
      }
      const next = g.gold + claimAmt;
      await setGold(ctx.from.id, next, {
        username: ctx.from.username || ctx.from.first_name || null,
        last_daily: today,
      });
      await logEvent(ctx.from.id, 'daily_claim', { amount: claimAmt, premium: !!g.premium });
      await ctx.reply(
        `DAILY CLAIM OK\n` +
          `+${claimAmt} Radiant Gold` +
          (g.premium ? ' 👑 premium boost' : '') +
          `\n` +
          `New balance: ${next}\n\n` +
          `Use it for AI help, vision, voice.\n` +
          `/balance · /goldtop · /myreport\n` +
          `— Radiant Queen`
      );
    } catch (err) {
      console.error('daily', err);
      await ctx.reply('daily failed.');
    }
  });



  // P9: Gold leaderboard
  bot.command(['goldtop', 'topgold', 'richlist'], async (ctx) => {
    try {
      if (!supabase) {
        await ctx.reply('Supabase missing');
        return;
      }
      const { data, error } = await supabase
        .from('rq_gold')
        .select('user_id, username, gold, premium')
        .order('gold', { ascending: false })
        .limit(15);
      if (error) {
        await ctx.reply('goldtop failed: ' + error.message);
        return;
      }
      if (!data || !data.length) {
        await ctx.reply('No wallets yet. /balance to start.');
        return;
      }
      const lines = ['🏆 RADIANT GOLD · TOP'];
      data.forEach((r, i) => {
        const name = r.username ? '@' + String(r.username).replace(/^@/, '') : 'User ' + r.user_id;
        const badge = r.premium ? ' 👑' : '';
        lines.push((i + 1) + '. ' + name + badge + ' — ' + (r.gold ?? 0) + ' gold');
      });
      lines.push('');
      lines.push('/balance · /myreport · /perks');
      await ctx.reply(lines.join('\n'));
      await logEvent(ctx.from?.id, 'goldtop', { n: data.length });
    } catch (e) {
      await ctx.reply('goldtop failed: ' + String(e.message || e).slice(0, 160));
    }
  });

  // P9: Personal report
  bot.command(['myreport', 'report', 'mystats'], async (ctx) => {
    try {
      const uid = ctx.from?.id;
      if (!uid) return;
      const name = ctx.from.first_name || ctx.from.username || 'You';
      const lines = ['📋 MY REPORT', 'User: ' + name, 'ID: ' + uid, ''];
      if (supabase) {
        try {
          const g = await getOrCreateGold(uid, ctx.from.username || ctx.from.first_name);
          lines.push('Gold: ' + (g.gold ?? '?'));
          lines.push('Premium: ' + (g.premium ? 'YES 👑' : 'no'));
          if (g.last_daily) lines.push('Last daily: ' + g.last_daily);
        } catch (_) {}
        try {
          const { count: mem } = await supabase
            .from('rq_ai_memory')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', Number(uid));
          lines.push('AI memory rows: ' + (mem ?? 0));
        } catch (_) {}
        try {
          const { count: rem } = await supabase
            .from('rq_reminders')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', Number(uid))
            .eq('active', true);
          lines.push('Active reminders: ' + (rem ?? 0));
        } catch (_) {}
        try {
          const since7 = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
          const { count: ev } = await supabase
            .from('rq_events')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', Number(uid))
            .gte('created_at', since7);
          lines.push('Your events (7d): ' + (ev ?? 0));
        } catch (_) {}
        try {
          const { data: persona } = await supabase
            .from('rq_user_personas')
            .select('persona')
            .eq('user_id', Number(uid))
            .maybeSingle();
          if (persona?.persona) lines.push('Persona: ' + persona.persona);
        } catch (_) {}
      } else {
        lines.push('Supabase offline — limited report.');
      }
      lines.push('');
      lines.push('/balance · /goldtop · /persona · /remindlist');
      await ctx.reply(lines.join('\n'));
      await logEvent(uid, 'myreport', {});
    } catch (e) {
      await ctx.reply('myreport failed: ' + String(e.message || e).slice(0, 160));
    }
  });

  // P9: Group admin announce (text only, no spam tools)
  bot.command(['announce', 'gannounce'], async (ctx) => {
    try {
      if (ctx.chat?.type !== 'group' && ctx.chat?.type !== 'supergroup') {
        await ctx.reply('Use /announce inside a group.\nExample: /announce Training at 6am tomorrow');
        return;
      }
      const text = (ctx.message?.text || '').replace(/^\/announce(?:@\w+)?\s*/i, '').replace(/^\/gannounce(?:@\w+)?\s*/i, '').trim();
      if (!text) {
        await ctx.reply('Usage: /announce <message>\nAdmin only.');
        return;
      }
      // founder always; else check admin in group
      let allowed = isAdmin(ctx);
      if (!allowed) {
        try {
          const m = await ctx.telegram.getChatMember(ctx.chat.id, ctx.from.id);
          allowed = m.status === 'creator' || m.status === 'administrator';
        } catch (_) {}
      }
      if (!allowed) {
        await ctx.reply('Group admin or founder only.');
        return;
      }
      const body =
        '📢 ANNOUNCEMENT\n' +
        'From: ' +
        (ctx.from.first_name || ctx.from.username || 'Admin') +
        '\n\n' +
        text.slice(0, 3000);
      await ctx.reply(body);
      try {
        await ctx.deleteMessage(ctx.message.message_id);
      } catch (_) {}
      await logEvent(ctx.from.id, 'announce', { chat_id: ctx.chat.id });
    } catch (e) {
      await ctx.reply('announce failed: ' + String(e.message || e).slice(0, 160));
    }
  });

  bot.command(['prices', 'costs'], async (ctx) => {
    await ctx.reply(
      `RADIANT GOLD · PRICES\n\n` +
        `Start bonus: ${GOLD_START}\n` +
        `Daily claim: +${GOLD_DAILY} (premium +${GOLD_DAILY_PREMIUM})\n\n` +
        `AI text / ask: ${GOLD_COST.ask}\n` +
        `Vision / photo: ${GOLD_COST.vision}\n` +
        `Voice: ${GOLD_COST.voice}\n` +
        `Stride: ${GOLD_COST.stride}\n\n` +
        `/daily · /balance · /gold\n` +
        `— Radiant Queen`
    );
  });




  bot.command('admin', async (ctx) => {
    if (!isAdmin(ctx)) {
      await ctx.reply('Admin only.');
      return;
    }
    await uiReply(ctx, `Founder Admin Panel\nID: ${ctx.from.id}`, adminKeyboard());
  });

  bot.command('id', async (ctx) => {
    await uiReply(ctx, `Your Telegram id: ${ctx.from.id}\nUsername: @${ctx.from.username || 'none'}\nAdmin: ${isAdmin(ctx) ? 'YES' : 'NO'}`, mainMenuKeyboard(ctx));
  });

  bot.command('status', async (ctx) => {
    try {
      await uiReply(ctx, statusText(ctx), mainMenuKeyboard(ctx));
    } catch {
      await ctx.reply('Status unavailable.');
    }
  });

  bot.command('social', async (ctx) => {
    await uiReply(ctx, LINKS, mainMenuKeyboard(ctx));
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
      await uiReply(ctx, 'Usage: /ask your question', mainMenuKeyboard(ctx));
      return;
    }
    await ctx.sendChatAction('typing');
    await ctx.reply(await generateReply(q, ctx), afterReplyKeyboard(ctx));
  });

  bot.command(['imagine', 'draw', 'img'], async (ctx) => {
    try {
      const uid = String(ctx.from.id);
      if (!isAdmin(ctx)) {
        const rate = await checkRateLimit(uid);
        if (!rate.ok) {
          await ctx.reply('Slow down. Retry in ~' + rate.waitSec + 's.');
          return;
        }
      }
      try {
        const pay = await spendGold(ctx, 'vision');
        if (!pay.ok) {
          await ctx.reply(pay.message || 'Not enough gold. /balance');
          return;
        }
      } catch (_) {}

      const prompt = (ctx.message.text || '')
        .replace(/^\/(imagine|draw|img)(@\w+)?\s*/i, '')
        .trim();
      if (!prompt) {
        await ctx.reply('Usage: /imagine a runner at sunrise in Colombo');
        return;
      }
      await ctx.sendChatAction('upload_photo');
      const { generateImagineImage } = await import('../lib/imagine.js');
      const img = await generateImagineImage(prompt);
      if (!img.ok) {
        await ctx.reply('Imagine failed: ' + String(img.error || 'unknown').slice(0, 160));
        return;
      }
      await ctx.replyWithPhoto(
        { source: img.buffer },
        { caption: ('🎨 ' + img.prompt).slice(0, 900) }
      );
    } catch (err) {
      console.error('imagine', err);
      await ctx.reply('Imagine failed: ' + String(err && err.message ? err.message : err).slice(0, 160));
    }
  });


  // ——— P10a-free: founder video (paid MP4 or free storyboard) + free photoedit ———
  async function tgFileUrl(ctx, fileId) {
    const f = await ctx.telegram.getFile(fileId);
    if (!f?.file_path) throw new Error('no file_path');
    return 'https://api.telegram.org/file/bot' + process.env.BOT_TOKEN + '/' + f.file_path;
  }

  function founderOnlyVideoMsg() {
    return (
      '🎬 Video tools are founder-only right now.\n' +
      'Coming soon for premium tiers.\n\n' +
      'You can still use /imagine and /photoedit (free).'
    );
  }

  bot.command(['video', 'vid'], async (ctx) => {
    try {
      if (!isAdmin(ctx)) {
        await ctx.reply(founderOnlyVideoMsg());
        return;
      }
      const prompt = (ctx.message?.text || '')
        .replace(/^\/(video|vid)(@\w+)?\s*/i, '')
        .trim();
      if (!prompt) {
        await ctx.reply(
          'Usage (founder): /video a cat running on the beach\n\n' +
            'Free mode: 3-frame storyboard (no pollen)\n' +
            'Paid MP4: needs Paid Pollen on enter.pollinations.ai\n' +
            'Optional: POLLINATIONS_VIDEO_MODEL=seedance-2.0-fast'
        );
        return;
      }
      await ctx.reply('🎬 Working… (free storyboard if no Paid Pollen)');
      await ctx.sendChatAction('upload_photo');
      const { generateVideoFromPrompt } = await import('../lib/videoGen.js');
      const out = await generateVideoFromPrompt(prompt, {
        model: process.env.POLLINATIONS_VIDEO_MODEL || 'seedance-2.0-fast',
      });
      if (!out.ok) {
        await ctx.reply('Video failed: ' + String(out.error || 'unknown').slice(0, 400));
        return;
      }
      if (out.mode === 'free-storyboard' && out.frames?.length) {
        await ctx.reply(
          '🆓 FREE STORYBOARD (3 frames)\n' +
            'Real MP4 needs Paid Pollen on Pollinations.\n' +
            'Prompt: ' +
            prompt.slice(0, 200)
        );
        for (let i = 0; i < out.frames.length; i++) {
          await ctx.replyWithPhoto(
            { source: out.frames[i].buffer },
            { caption: ('🎬 Frame ' + (i + 1) + '/3 · ' + prompt).slice(0, 900) }
          );
        }
      } else if (out.buffer) {
        await ctx.replyWithVideo(
          { source: out.buffer },
          { caption: ('🎬 ' + prompt).slice(0, 900) }
        );
      }
      try {
        await logEvent(ctx.from.id, 'video_gen', { mode: out.mode || 'paid', prompt: prompt.slice(0, 80) });
      } catch (_) {}
    } catch (err) {
      console.error('video', err);
      await ctx.reply('Video failed: ' + String(err?.message || err).slice(0, 200));
    }
  });

  bot.command(['animate', 'img2vid'], async (ctx) => {
    try {
      if (!isAdmin(ctx)) {
        await ctx.reply(founderOnlyVideoMsg());
        return;
      }
      const reply = ctx.message?.reply_to_message;
      const photos = reply?.photo;
      if (!photos || !photos.length) {
        await ctx.reply('Reply to a photo with /animate\nOptional: /animate gentle camera zoom');
        return;
      }
      const best = photos[photos.length - 1];
      const prompt =
        (ctx.message?.text || '')
          .replace(/^\/(animate|img2vid)(@\w+)?\s*/i, '')
          .trim() || 'animate this image smoothly, natural motion';
      await ctx.reply('🎬 Animating… (free storyboard if no Paid Pollen)');
      await ctx.sendChatAction('upload_photo');
      let imageUrl = null;
      try {
        imageUrl = await tgFileUrl(ctx, best.file_id);
      } catch (_) {}
      const { generateVideoFromImage } = await import('../lib/videoGen.js');
      const out = await generateVideoFromImage(imageUrl, prompt, {
        model: process.env.POLLINATIONS_VIDEO_MODEL || 'seedance-2.0-fast',
      });
      if (!out.ok) {
        await ctx.reply('Animate failed: ' + String(out.error || 'unknown').slice(0, 400));
        return;
      }
      if (out.mode === 'free-storyboard' && out.frames?.length) {
        await ctx.reply('🆓 FREE animate storyboard (3 frames)');
        for (let i = 0; i < out.frames.length; i++) {
          await ctx.replyWithPhoto(
            { source: out.frames[i].buffer },
            { caption: ('🎬 Animate ' + (i + 1) + '/3 · ' + prompt).slice(0, 900) }
          );
        }
      } else if (out.buffer) {
        await ctx.replyWithVideo(
          { source: out.buffer },
          { caption: ('🎬 Animated: ' + prompt).slice(0, 900) }
        );
      }
      try {
        await logEvent(ctx.from.id, 'animate', { mode: out.mode || 'paid' });
      } catch (_) {}
    } catch (err) {
      console.error('animate', err);
      await ctx.reply('Animate failed: ' + String(err?.message || err).slice(0, 200));
    }
  });

  bot.command(['photoedit', 'editphoto', 'img2img'], async (ctx) => {
    try {
      const uid = String(ctx.from?.id || '');
      if (!isAdmin(ctx)) {
        const rate = await checkRateLimit(uid);
        if (!rate.ok) {
          await ctx.reply('Slow down. Retry in ~' + rate.waitSec + 's.');
          return;
        }
      }
      try {
        const pay = await spendGold(ctx, 'vision');
        if (!pay.ok) {
          await ctx.reply(pay.message || 'Not enough gold. /balance');
          return;
        }
      } catch (_) {}

      const reply = ctx.message?.reply_to_message;
      const photos = reply?.photo;
      if (!photos || !photos.length) {
        await ctx.reply(
          'Reply to a photo with /photoedit <instruction>\n' +
            'Examples: enhance | cartoon | anime | add neon background\n' +
            'P11-fix3: Groq vision (primary) + Gemini fallback.'
        );
        return;
      }
      const raw = (ctx.message?.text || '')
        .replace(/^\/(photoedit|editphoto|img2img)(@\w+)?\s*/i, '')
        .trim();
      if (!raw) {
        await ctx.reply('Add instruction. Example: /photoedit cartoon');
        return;
      }
      const { editPhotoWithPrompt, expandPhotoEditAlias } = await import('../lib/photoEdit.js');
      const instruction = expandPhotoEditAlias(raw);
      await ctx.sendChatAction('typing');

      const best = photos[photos.length - 1];
      const token = BOT_TOKEN || process.env.BOT_TOKEN || '';
      if (!token) {
        await ctx.reply('BOT_TOKEN missing');
        return;
      }

      let sceneDescription = '';
      let visionMeta = '';
      let imageUrl = null;
      try {
        const f = await ctx.telegram.getFile(best.file_id);
        console.log('[photoedit] file_path=', f?.file_path, 'file_size=', f?.file_size);
        if (!f?.file_path) throw new Error('Telegram getFile: no file_path');
        imageUrl = 'https://api.telegram.org/file/bot' + token + '/' + f.file_path;
        const fr = await fetch(imageUrl, { signal: AbortSignal.timeout(30000) });
        console.log('[photoedit] download status', fr.status, fr.headers.get('content-type'));
        if (!fr.ok) throw new Error('download HTTP ' + fr.status);
        const ab = await fr.arrayBuffer();
        const buf = Buffer.from(ab);
        console.log('[photoedit] bytes', buf.length, 'head', buf.slice(0, 4).toString('hex'));
        // JPEG FF D8, PNG 89 50
        let mime = 'image/jpeg';
        if (buf[0] === 0x89 && buf[1] === 0x50) mime = 'image/png';
        else if (buf[0] === 0xff && buf[1] === 0xd8) mime = 'image/jpeg';
        else if ((f.file_path || '').endsWith('.png')) mime = 'image/png';

        const { describeImageBuffer } = await import('../lib/visionDescribe.js');
        const vis = await describeImageBuffer(buf, mime);
        if (vis.ok) {
          sceneDescription = vis.text;
          visionMeta = 'model=' + (vis.model || '?') + ' bytes=' + (vis.bytes || buf.length);
        } else {
          visionMeta = 'vision fail: ' + String(vis.error || '').slice(0, 120);
          console.error('[photoedit]', visionMeta);
        }
      } catch (ve) {
        visionMeta = 'prep fail: ' + String(ve?.message || ve).slice(0, 120);
        console.error('[photoedit]', visionMeta);
      }

      await ctx.sendChatAction('upload_photo');
      const out = await editPhotoWithPrompt(imageUrl, instruction, {
        sceneDescription,
      });
      if (!out.ok) {
        await ctx.reply(
          'Photo edit failed: ' +
            String(out.error || 'unknown').slice(0, 250) +
            '\n' +
            visionMeta
        );
        return;
      }
      const cap = (
        (sceneDescription ? '👁️🆓 ' : '🆓 ') +
        instruction +
        '\n' +
        (out.note || '') +
        '\nSeen: ' +
        (sceneDescription ? sceneDescription.slice(0, 160) : '(no vision — text only)') +
        (out.seed ? '\nseed=' + out.seed : '') +
        (visionMeta ? '\n[' + visionMeta + ']' : '')
      ).slice(0, 1024);
      await ctx.replyWithPhoto({ source: out.buffer }, { caption: cap });
      try {
        await logEvent(ctx.from.id, 'photoedit', {
          mode: out.mode,
          vision: !!sceneDescription,
          seed: out.seed || null,
        });
      } catch (_) {}
    } catch (err) {
      console.error('photoedit', err);
      await ctx.reply('Photo edit failed: ' + String(err?.message || err).slice(0, 200));
    }
  });

    // ——— Pack A Step2: TTS ———
  bot.command(['tts', 'say', 'speaktext'], async (ctx) => {
    try {
      const uid = String(ctx.from?.id || '');
      if (!isAdmin(ctx)) {
        const rate = await checkRateLimit(uid);
        if (!rate.ok) {
          await ctx.reply('Slow down. Retry in ~' + rate.waitSec + 's.');
          return;
        }
      }
      let text = (ctx.message?.text || '')
        .replace(/^\/(tts|say|speaktext)(@\w+)?\s*/i, '')
        .trim();
      let langHint = '';
      const langMatch = text.match(/^(\w{2})\s+(.+)$/s);
      if (langMatch && ['si', 'en', 'ta', 'hi'].includes(langMatch[1].toLowerCase())) {
        langHint = langMatch[1].toLowerCase();
        text = langMatch[2].trim();
      }
      if (!text && ctx.message?.reply_to_message?.text) {
        text = String(ctx.message.reply_to_message.text).slice(0, 180);
      }
      if (!text) {
        await ctx.reply(
          'Usage:\n/tts <text>\n/tts si ආයුබෝවන්\n/tts en Hello founder\nReply to a message + /tts'
        );
        return;
      }
      await ctx.sendChatAction('record_voice');
      const { synthesizeSpeech } = await import('../lib/tts.js');
      const out = await synthesizeSpeech(text, langHint);
      if (!out.ok) {
        await ctx.reply('TTS failed: ' + String(out.error || 'unknown').slice(0, 180));
        return;
      }
      await ctx.replyWithVoice(
        { source: out.buffer, filename: 'rq-tts.mp3' },
        { caption: ('🔊 ' + (out.lang || '') + ' · ' + (out.provider || 'tts')).slice(0, 200) }
      );
      try {
        await logEvent(ctx.from.id, 'tts', { lang: out.lang, provider: out.provider });
      } catch (_) {}
    } catch (err) {
      console.error('tts', err);
      await ctx.reply('TTS failed: ' + String(err?.message || err).slice(0, 180));
    }
  });

  // ——— Pack A Step3: OCR.space ———
  bot.command(['ocrspace', 'ocr'], async (ctx) => {
    try {
      const uid = String(ctx.from?.id || '');
      if (!isAdmin(ctx)) {
        const rate = await checkRateLimit(uid);
        if (!rate.ok) {
          await ctx.reply('Slow down. Retry in ~' + rate.waitSec + 's.');
          return;
        }
      }
      const reply = ctx.message?.reply_to_message;
      const photos = reply?.photo;
      if (!photos || !photos.length) {
        await ctx.reply('Reply to a photo with /ocr or /ocrspace');
        return;
      }
      const best = photos[photos.length - 1];
      const token = BOT_TOKEN || process.env.BOT_TOKEN || '';
      const f = await ctx.telegram.getFile(best.file_id);
      const imageUrl = 'https://api.telegram.org/file/bot' + token + '/' + f.file_path;
      await ctx.sendChatAction('typing');
      const fr = await fetch(imageUrl, { signal: AbortSignal.timeout(30000) });
      const buf = Buffer.from(await fr.arrayBuffer());
      let mime = 'image/jpeg';
      if (buf[0] === 0x89 && buf[1] === 0x50) mime = 'image/png';
      const { ocrImageBuffer } = await import('../lib/ocrSpace.js');
      const out = await ocrImageBuffer(buf, mime, 'eng');
      if (!out.ok) {
        await ctx.reply('OCR failed: ' + String(out.error || 'unknown').slice(0, 200));
        return;
      }
      await ctx.reply(('OCR · ocr.space\n\n' + out.text).slice(0, 3500));
      try {
        await logEvent(ctx.from.id, 'ocr', { engine: 'ocr.space' });
      } catch (_) {}
    } catch (err) {
      console.error('ocr', err);
      await ctx.reply('OCR failed: ' + String(err?.message || err).slice(0, 180));
    }
  });

    // ——— Pack B: Supabase Storage vault ———
  bot.command(['vault', 'files', 'filevault'], async (ctx) => {
    try {
      if (!supabase) {
        await ctx.reply('Vault needs Supabase. Set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.');
        return;
      }
      const uid = String(ctx.from?.id || '');
      if (!isAdmin(ctx)) {
        const rate = await checkRateLimit(uid);
        if (!rate.ok) {
          await ctx.reply('Slow down. Retry in ~' + rate.waitSec + 's.');
          return;
        }
      }

      const raw = (ctx.message?.text || '')
        .replace(/^\/(vault|files|filevault)(@\w+)?\s*/i, '')
        .trim();
      const parts = raw ? raw.split(/\s+/) : [];
      const sub = (parts[0] || '').toLowerCase();
      const arg = parts.slice(1).join(' ').trim();

      const {
        listVaultFiles,
        saveVaultFile,
        getVaultFile,
        deleteVaultFile,
        ensureVaultBucket,
      } = await import('../lib/vault.js');

      // HELP
      if (!sub || sub === 'help') {
        await ctx.reply(
          'RADIANT VAULT · Supabase Storage\n\n' +
            'Save (reply to photo / document):\n' +
            '  /vault save\n' +
            '  /vault save my-note.pdf\n\n' +
            'List:\n  /vault list\n  /files\n\n' +
            'Get file:\n  /vault get <id>\n\n' +
            'Delete:\n  /vault del <id>\n\n' +
            'Limits: 40 files / user · 8MB each · private bucket rq_vault'
        );
        return;
      }

      // LIST
      if (sub === 'list' || sub === 'ls' || sub === 'all') {
        await ensureVaultBucket(supabase);
        const out = await listVaultFiles(supabase, ctx.from.id, 25);
        if (!out.ok) {
          await ctx.reply('Vault list failed: ' + out.error);
          return;
        }
        if (!out.files.length) {
          await ctx.reply('Vault empty. Reply to a photo/document with:\n/vault save');
          return;
        }
        const lines = out.files.map((f) => {
          const kb = f.size_bytes ? Math.round(f.size_bytes / 1024) + 'KB' : '?';
          return '#' + f.id + ' · ' + f.name + ' · ' + kb;
        });
        await ctx.reply(('Your vault\n\n' + lines.join('\n')).slice(0, 3500));
        return;
      }

      // GET
      if (sub === 'get' || sub === 'open' || sub === 'dl' || sub === 'download') {
        const id = parseInt(arg || parts[1] || '0', 10);
        if (!id) {
          await ctx.reply('Usage: /vault get <id>\nExample: /vault get 3');
          return;
        }
        await ctx.sendChatAction('upload_document');
        const out = await getVaultFile(supabase, ctx.from.id, id);
        if (!out.ok) {
          await ctx.reply('Vault get failed: ' + out.error);
          return;
        }
        const f = out.file;
        const cap = ('Vault #' + f.id + ' · ' + f.name).slice(0, 200);
        if (out.buffer && out.buffer.length) {
          const isImg = String(f.mime || '').startsWith('image/');
          if (isImg) {
            await ctx.replyWithPhoto({ source: out.buffer }, { caption: cap });
          } else {
            await ctx.replyWithDocument(
              { source: out.buffer, filename: f.name || 'file.bin' },
              { caption: cap }
            );
          }
        } else if (out.signedUrl) {
          await ctx.reply(cap + '\nLink (30 min):\n' + out.signedUrl);
        } else {
          await ctx.reply('File meta found but download failed.');
        }
        return;
      }

      // DELETE
      if (sub === 'del' || sub === 'delete' || sub === 'rm' || sub === 'remove') {
        const id = parseInt(arg || parts[1] || '0', 10);
        if (!id) {
          await ctx.reply('Usage: /vault del <id>');
          return;
        }
        const out = await deleteVaultFile(supabase, ctx.from.id, id);
        if (!out.ok) {
          await ctx.reply('Delete failed: ' + out.error);
          return;
        }
        await ctx.reply('Deleted vault #' + id + ' · ' + (out.deleted?.name || ''));
        return;
      }

      // SAVE (reply to media)
      if (sub === 'save' || sub === 'add' || sub === 'upload' || sub === 'put') {
        const reply = ctx.message?.reply_to_message;
        if (!reply) {
          await ctx.reply('Reply to a photo or document, then:\n/vault save\n/vault save my-name.jpg');
          return;
        }
        await ctx.sendChatAction('upload_document');
        let fileId = null;
        let mime = 'application/octet-stream';
        let defaultName = 'file.bin';

        if (reply.photo && reply.photo.length) {
          const best = reply.photo[reply.photo.length - 1];
          fileId = best.file_id;
          mime = 'image/jpeg';
          defaultName = 'photo.jpg';
        } else if (reply.document) {
          fileId = reply.document.file_id;
          mime = reply.document.mime_type || mime;
          defaultName = reply.document.file_name || defaultName;
        } else if (reply.audio) {
          fileId = reply.audio.file_id;
          mime = reply.audio.mime_type || 'audio/mpeg';
          defaultName = reply.audio.file_name || 'audio.mp3';
        } else if (reply.voice) {
          fileId = reply.voice.file_id;
          mime = 'audio/ogg';
          defaultName = 'voice.ogg';
        } else if (reply.video) {
          fileId = reply.video.file_id;
          mime = reply.video.mime_type || 'video/mp4';
          defaultName = 'video.mp4';
        } else {
          await ctx.reply('Reply to photo, document, audio, voice, or video.');
          return;
        }

        const tgFile = await ctx.telegram.getFile(fileId);
        const token = BOT_TOKEN || process.env.BOT_TOKEN || '';
        const url = 'https://api.telegram.org/file/bot' + token + '/' + tgFile.file_path;
        const fr = await fetch(url, { signal: AbortSignal.timeout(60000) });
        if (!fr.ok) {
          await ctx.reply('Telegram download failed: HTTP ' + fr.status);
          return;
        }
        const buffer = Buffer.from(await fr.arrayBuffer());
        if (buffer[0] === 0x89 && buffer[1] === 0x50) mime = 'image/png';
        else if (buffer[0] === 0xff && buffer[1] === 0xd8) mime = 'image/jpeg';

        const name = arg || defaultName;
        const out = await saveVaultFile(supabase, ctx.from.id, {
          buffer,
          name,
          mime,
          telegram_file_id: fileId,
        });
        if (!out.ok) {
          await ctx.reply('Vault save failed: ' + out.error);
          return;
        }
        await ctx.reply(
          'Saved to vault\n#' +
            out.file.id +
            ' · ' +
            out.file.name +
            '\n' +
            Math.round((out.file.size_bytes || 0) / 1024) +
            ' KB\n\n/vault list · /vault get ' +
            out.file.id
        );
        try {
          await logEvent(ctx.from.id, 'vault_save', { id: out.file.id, name: out.file.name });
        } catch (_) {}
        return;
      }

      await ctx.reply('Unknown vault command. Try /vault help');
    } catch (err) {
      console.error('vault', err);
      await ctx.reply('Vault error: ' + String(err?.message || err).slice(0, 200));
    }
  });

    bot.command(['notify', 'ntfy'], async (ctx) => {
    try {
      const msg = (ctx.message.text || '')
        .replace(/^\/(notify|ntfy)(@\w+)?\s*/i, '')
        .trim();
      const { ntfyTopic, sendNtfy } = await import('../lib/ntfy.js');
      if (!msg) {
        const topic = ntfyTopic(ADMIN_ID);
        await ctx.reply(
          'Phone push via ntfy.sh (free)\n\n' +
            '1) Install ntfy app\n' +
            '2) Subscribe to topic:\n' +
            topic +
            '\n3) Send: /notify Hello from Radiant Queen\n\n' +
            'Env: NTFY_TOPIC on Vercel'
        );
        return;
      }
      const who =
        ctx.from && ctx.from.username
          ? '@' + ctx.from.username
          : (ctx.from && ctx.from.first_name) || 'user';
      const r = await sendNtfy(
        'Radiant Queen',
        who + ': ' + msg,
        isAdmin(ctx) ? 'high' : 'default',
        ADMIN_ID
      );
      if (!r.ok) {
        await ctx.reply('ntfy failed: ' + (r.error || ''));
        return;
      }
      await ctx.reply('✅ Sent to ntfy topic: ' + r.topic);
    } catch (err) {
      await ctx.reply(
        'notify failed: ' + String(err && err.message ? err.message : err).slice(0, 120)
      );
    }
  });



  bot.command(['forget', 'clearmemory', 'memoryclear'], async (ctx) => {
    try {
      const { clearMemory } = await import('../lib/memory.js');
      const r = await clearMemory(supabase, ctx.from.id);
      await ctx.reply(
        r.ok
          ? '🧠 Memory cleared. Next replies start fresh.'
          : 'Memory clear failed: ' + (r.error || 'unknown')
      );
    } catch (err) {
      await ctx.reply('forget failed: ' + String(err && err.message ? err.message : err).slice(0, 120));
    }
  });

  bot.command(['memory', 'mem'], async (ctx) => {
    try {
      const { loadMemoryBlock } = await import('../lib/memory.js');
      const block = await loadMemoryBlock(supabase, ctx.from.id, 8);
      if (!block) {
        await ctx.reply('No saved chat memory yet. Chat with /ask first.');
        return;
      }
      await ctx.reply('🧠 Your recent memory:\\n\\n' + block.slice(0, 3200));
    } catch (err) {
      await ctx.reply('memory failed: ' + String(err && err.message ? err.message : err).slice(0, 120));
    }
  });

  bot.command(['remind'], async (ctx) => {
    try {
      const raw = (ctx.message.text || '')
        .replace(/^\/remind(@\w+)?\s*/i, '')
        .trim();
      const { parseReminder, addReminder, listReminders } = await import('../lib/reminders.js');
      if (!raw || raw === 'help') {
        await ctx.reply(
          'Reminders\\n\\n' +
            '/remind 10m drink water\\n' +
            '/remind 1h call Amma\\n' +
            '/remind 5pm stretch\\n' +
            '/remind daily 7am morning run\\n' +
            '/remindlist\\n' +
            '/remindcancel <id>\\n\\n' +
            'Uses ntfy + Telegram when due (cron).'
        );
        return;
      }
      const parsed = parseReminder(raw);
      if (!parsed.ok) {
        await ctx.reply(parsed.error || 'Could not parse. Try: /remind 10m message');
        return;
      }
      const r = await addReminder(supabase, {
        userId: ctx.from.id,
        chatId: ctx.chat.id,
        message: parsed.message,
        dueAt: parsed.dueAt,
        recurring: parsed.recurring,
      });
      if (!r.ok) {
        await ctx.reply('Save failed: ' + (r.error || ''));
        return;
      }
      await ctx.reply(
        '⏰ Reminder #' +
          r.id +
          '\\nWhen: ' +
          parsed.dueAt.toISOString() +
          (parsed.recurring ? '\\nRepeat: ' + parsed.recurring : '') +
          '\\nText: ' +
          parsed.message
      );
    } catch (err) {
      await ctx.reply('remind failed: ' + String(err && err.message ? err.message : err).slice(0, 140));
    }
  });

  bot.command(['remindlist', 'reminders'], async (ctx) => {
    try {
      const { listReminders } = await import('../lib/reminders.js');
      const rows = await listReminders(supabase, ctx.from.id);
      if (!rows.length) {
        await ctx.reply('No active reminders. /remind 10m test');
        return;
      }
      const lines = rows.map(function (r) {
        return (
          '#' +
          r.id +
          ' · ' +
          (r.due_at || '') +
          (r.recurring ? ' · ' + r.recurring : '') +
          '\\n  ' +
          String(r.message || '').slice(0, 80)
        );
      });
      await ctx.reply('⏰ Active reminders\\n\\n' + lines.join('\\n\\n'));
    } catch (err) {
      await ctx.reply('remindlist failed: ' + String(err && err.message ? err.message : err).slice(0, 120));
    }
  });

  bot.command(['remindcancel', 'reminddel', 'undoremind'], async (ctx) => {
    try {
      const id = (ctx.message.text || '')
        .replace(/^\/(remindcancel|reminddel|undoremind)(@\w+)?\s*/i, '')
        .trim();
      if (!id) {
        await ctx.reply('Usage: /remindcancel <id>  (see /remindlist)');
        return;
      }
      const { cancelReminder } = await import('../lib/reminders.js');
      const r = await cancelReminder(supabase, ctx.from.id, id);
      await ctx.reply(r.ok ? 'Cancelled reminder #' + id : 'Cancel failed: ' + (r.error || ''));
    } catch (err) {
      await ctx.reply('remindcancel failed: ' + String(err && err.message ? err.message : err).slice(0, 120));
    }
  });

  // menus
  bot.action('menu_home', async (ctx) => {
    await ctx.answerCbQuery();
    await sendMenuSmart(ctx, numberedMainMenuText(), mainMenuKeyboard(ctx));
  });

  bot.action('ui_mode_cycle', async (ctx) => {
    try {
      const next = cycleUiMode(ctx.from.id);
      const labels = {
        normal: '📜 Normal — messages go downward (classic)',
        phone: '📱 Phone — one digital frame, edits in place',
        clean: '🧹 Clean — ❌ delete · 🔼 fold each box',
      };
      await ctx.answerCbQuery('Mode: ' + next);
      if (next !== 'phone') phoneAnchor.delete(String(ctx.from.id));
      await uiReply(
        ctx,
        'Mode switched\n\n' + labels[next] + '\n\nTap Mode button again to cycle.\n/menu to continue.',
        mainMenuKeyboard(ctx)
      );
    } catch (e) {
      console.error('ui_mode_cycle', e);
      try { await ctx.answerCbQuery('Mode error'); } catch (_) {}
    }
  });

  bot.action('ui_dismiss', async (ctx) => {
    try {
      await ctx.answerCbQuery('Removed');
      await ctx.deleteMessage();
    } catch (e) {
      try { await ctx.answerCbQuery('Cannot delete'); } catch (_) {}
    }
  });

  bot.action('ui_collapse', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      const msg = ctx.callbackQuery?.message;
      if (!msg) return;
      const key = msg.chat.id + ':' + msg.message_id;
      const prev = collapseStore.get(key);
      if (prev && prev.collapsed) {
        await ctx.editMessageText(
          String(prev.fullText).slice(0, 4090),
          prev.markup || buildUiMarkup(ctx, mainMenuKeyboard(ctx))
        );
        collapseStore.set(key, Object.assign({}, prev, { collapsed: false }));
        return;
      }
      const fullText = msg.text || digitalFrame('…');
      const markup = { reply_markup: msg.reply_markup };
      collapseStore.set(key, { fullText: fullText, markup: markup, collapsed: true });
      const header =
        fullText.split('\n').slice(0, 4).join('\n') +
        '\n\n… folded · tap 🔽 to expand';
      await ctx.editMessageText(
        header.slice(0, 4090),
        Markup.inlineKeyboard([
          [
            Markup.button.callback('🔽 Expand', 'ui_collapse'),
            Markup.button.callback('❌ Close', 'ui_dismiss'),
          ],
          [Markup.button.callback(modeButtonLabel(ctx.from.id), 'ui_mode_cycle')],
        ])
      );
    } catch (e) {
      console.error('ui_collapse', e);
    }
  });



  bot.action('menu_ask', async (ctx) => {
    await ctx.answerCbQuery();
    pendingTool.delete(String(ctx.from.id));
    await uiReply(
      ctx,
      '🤖 AI MENU\n\nType your question now (Sinhala or English).\nPhoto = vision · Voice note = voice.',
      mainMenuKeyboard(ctx)
    );
  });

  bot.action('menu_tools', async (ctx) => {
    await ctx.answerCbQuery();
    await uiReply(ctx, 'TOOLS MENU', toolsKeyboard());
  });

  bot.action('menu_gold', async (ctx) => {
    await ctx.answerCbQuery();
    await uiReply(
      ctx,
      `RADIANT GOLD\nTap a button or type /balance /daily /prices`,
      goldKeyboard()
    );
  });

  bot.action('menu_weather', async (ctx) => {
    await ctx.answerCbQuery();
    await uiReply(
      ctx,
      `WEATHER & UTILS\nTap a city shortcut or type /weather <city>`,
      weatherKeyboard()
    );
  });

  bot.action('menu_gadmin', async (ctx) => {
    await ctx.answerCbQuery();
    const chat = ctx.chat;
    const isGroup = chat && (chat.type === 'group' || chat.type === 'supergroup');
    const lines = [
      'RADIANT QUEEN · GROUP ADMIN PACK',
      isGroup ? `Chat: ${chat.title || chat.id}` : '(Best used inside a group)',
      '',
      'SETUP: /setwelcome /setrules /antilink /modcheck /groupinfo',
      'MOD: /kick /ban /warn /mute /pin /purge /promote',
      'TAG: /tagall /admins /members · CONTACT: /contact',
      'Tap buttons or type /groupadmin',
    ];
    await uiReply(ctx, lines.join('\n'), gadminKeyboard());
  });

  bot.action('menu_edu', async (ctx) => {
    await ctx.answerCbQuery();
    await uiReply(ctx, `EDUCATION LAB\n` +
        `Type a topic or use:\n` +
        `/wiki <topic> · /define <word> · /tr <text>\n` +
        `/code <question>`, mainMenuKeyboard(ctx));
  });

  bot.action('menu_links', async (ctx) => {
    await ctx.answerCbQuery();
    await uiReply(ctx, `RADIANT QUEEN · LINKS\n\n` +
        `Bot: https://t.me/PasiyaMaxQueen_bot\n` +
        `Web: https://radiant-queen-pasiya-max-v2.vercel.app\n` +
        `Hub: https://radiant-queen-pasiya-max-v2.vercel.app/bot/\n` +
        `Stride: https://strideclub-platform-6b71a.containers.snapdeploy.app\n\n` +
        `/invite to share`, mainMenuKeyboard(ctx));
  });

  bot.action('menu_platforms', async (ctx) => {
    await ctx.answerCbQuery();
    await uiReply(ctx, `CONNECTED PLATFORMS\n` +
        `• Telegram main bot — live\n` +
        `• Tenant bots — /setbot /mybot\n` +
        `• StrideClub — /stride\n` +
        `• Web hub — /bot/\n` +
        `v4 later: Discord / official WhatsApp only`, mainMenuKeyboard(ctx));
  });

  bot.action('menu_invite', async (ctx) => {
    await ctx.answerCbQuery();
    await uiReply(ctx, `Join RADIANT QUEEN · PASIYA MAX\n\n` +
        `Free Telegram AI bot + group tools + Radiant Gold.\n` +
        `Start bonus 400 gold · daily +50.\n\n` +
        `Open: https://t.me/PasiyaMaxQueen_bot\n` +
        `Hub: https://radiant-queen-pasiya-max-v2.vercel.app/bot/\n\n` +
        `Copy & share this message.`, mainMenuKeyboard(ctx));
  });

  bot.action('menu_freetools', async (ctx) => {
    await ctx.answerCbQuery();
    await uiReply(ctx, `FREE TOOLS (work when AI quota rests)\n` +
        `/weather Colombo · /currency USD LKR · /moon\n` +
        `/calc 10*5 · /daily · /balance · /groupadmin\n` +
        `Full list: type /tools`, weatherKeyboard());
  });

  bot.action('menu_about', async (ctx) => {
    await ctx.answerCbQuery();
    await uiReply(ctx, `RADIANT QUEEN · PASIYA MAX\n` +
        `Status: STABLE v3.1 · Touch + Type\n` +
        `Public AI + group tools + Radiant Gold\n` +
        `Bot: @PasiyaMaxQueen_bot\n` +
        `/menu · /tools · /invite`, mainMenuKeyboard(ctx));
  });

  bot.action('menu_si_home', async (ctx) => {
    await ctx.answerCbQuery();
    await uiReply(ctx, siGuideIntroText(), siGuideHomeKeyboard());
  });

  bot.command(['si', 'sinhala', 'guide'], async (ctx) => {
    await uiReply(ctx, siGuideIntroText(), siGuideHomeKeyboard());
  });

  bot.hears(/^(10|🔟)$/, async (ctx) => {
    try {
      await uiReply(ctx, siGuideIntroText(), siGuideHomeKeyboard());
    } catch (e) {
      console.error('si10', e);
    }
  });



  async function replySiCat(ctx, key) {
    await ctx.answerCbQuery();
    const body = SI_CAT[key] || 'කාණ්ඩය හමු නොවීය.';
    await uiReply(ctx, body.slice(0, 4000), siBackKeyboard());
  }

  bot.action('si_cat_system', (ctx) => replySiCat(ctx, 'system'));
  bot.action('si_cat_gold', (ctx) => replySiCat(ctx, 'gold'));
  bot.action('si_cat_weather', (ctx) => replySiCat(ctx, 'weather'));
  bot.action('si_cat_math', (ctx) => replySiCat(ctx, 'math'));
  bot.action('si_cat_crypto', (ctx) => replySiCat(ctx, 'crypto'));
  bot.action('si_cat_personal', (ctx) => replySiCat(ctx, 'personal'));
  bot.action('si_cat_run', (ctx) => replySiCat(ctx, 'run'));
  bot.action('si_cat_group', (ctx) => replySiCat(ctx, 'group'));
  bot.action('si_cat_tools', (ctx) => replySiCat(ctx, 'tools'));
  bot.action('si_cat_learn', (ctx) => replySiCat(ctx, 'learn'));
  bot.action('si_cat_ai', (ctx) => replySiCat(ctx, 'ai'));
  bot.action('si_cat_tenant', (ctx) => replySiCat(ctx, 'tenant'));
  bot.action('si_cat_links', (ctx) => replySiCat(ctx, 'links'));



  bot.action('tap_balance', async (ctx) => {
    await ctx.answerCbQuery();
    try {
      const g = await getOrCreateGold(ctx.from.id, ctx.from.username || ctx.from.first_name);
      if (!g.ok) {
        await uiReply(ctx, `balance failed: ${g.error || 'db'}`, goldKeyboard());
        return;
      }
      const daily = typeof GOLD_DAILY !== 'undefined' ? GOLD_DAILY : 50;
      await uiReply(ctx, `RADIANT GOLD · WALLET\nBalance: ${g.gold}\nPremium: ${g.premium ? 'yes' : 'no'}\n/daily +${daily}`, goldKeyboard());
    } catch (e) {
      await uiReply(ctx, 'balance failed.', goldKeyboard());
    }
  });

  bot.action('tap_daily', async (ctx) => {
    await ctx.answerCbQuery();
    try {
      if (isAdmin(ctx)) {
        await uiReply(ctx, 'Founder — unlimited gold. No daily claim needed.', goldKeyboard());
        return;
      }
      const g = await getOrCreateGold(ctx.from.id, ctx.from.username || ctx.from.first_name);
      if (!g.ok) {
        await uiReply(ctx, `daily failed: ${g.error || 'db'}`, goldKeyboard());
        return;
      }
      const today = new Date().toISOString().slice(0, 10);
      if (g.last_daily === today) {
        await uiReply(ctx, `Already claimed today.\nBalance: ${g.gold}`, goldKeyboard());
        return;
      }
      const add = typeof GOLD_DAILY !== 'undefined' ? GOLD_DAILY : 50;
      const next = g.gold + add;
      await setGold(ctx.from.id, next, {
        username: ctx.from.username || ctx.from.first_name || null,
        last_daily: today,
      });
      await uiReply(ctx, `DAILY CLAIM OK\n+${add}\nBalance: ${next}`, goldKeyboard());
    } catch (e) {
      await uiReply(ctx, 'daily failed.', goldKeyboard());
    }
  });

  bot.action('tap_prices', async (ctx) => {
    await ctx.answerCbQuery();
    await uiReply(ctx, `RADIANT GOLD · PRICES\n` +
        `Start: 400 · Daily: +50\n` +
        `AI text: 5 · Vision: 10 · Voice: 10 · Stride: 5`, goldKeyboard());
  });

  bot.action('tap_weather_cmb', async (ctx) => {
    await ctx.answerCbQuery();
    await uiReply(ctx, 'Type: /weather Colombo', weatherKeyboard());
  });

  bot.action('tap_moon', async (ctx) => {
    await ctx.answerCbQuery();
    await uiReply(ctx, 'Type: /moon', weatherKeyboard());
  });

  bot.action('tap_sun_cmb', async (ctx) => {
    await ctx.answerCbQuery();
    await uiReply(ctx, 'Type: /sun Colombo', weatherKeyboard());
  });

  bot.action('tap_aqi_cmb', async (ctx) => {
    await ctx.answerCbQuery();
    await uiReply(ctx, 'Type: /aqi Colombo', weatherKeyboard());
  });

  bot.action('tap_currency', async (ctx) => {
    await ctx.answerCbQuery();
    await uiReply(ctx, 'Type: /currency USD LKR', weatherKeyboard());
  });

  bot.action('tap_modcheck', async (ctx) => {
    await ctx.answerCbQuery();
    await uiReply(ctx, 'Type in group: /modcheck', gadminKeyboard());
  });

  bot.action('tap_rules', async (ctx) => {
    await ctx.answerCbQuery();
    await uiReply(ctx, 'Type: /rules  · set: /setrules <text>', gadminKeyboard());
  });

  bot.action('tap_antilink_status', async (ctx) => {
    await ctx.answerCbQuery();
    await uiReply(ctx, 'Type: /antilink status', gadminKeyboard());
  });

  bot.action('tap_groupinfo', async (ctx) => {
    await ctx.answerCbQuery();
    await uiReply(ctx, 'Type in group: /groupinfo', gadminKeyboard());
  });



  bot.action('menu_social', async (ctx) => {
    await ctx.answerCbQuery();
    await uiReply(ctx, LINKS, mainMenuKeyboard(ctx));
  });

  bot.action('menu_status', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      await uiReply(ctx, statusText(ctx), mainMenuKeyboard(ctx));
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
    await uiReply(ctx, `GROUP HELP\n` +
        `• In groups: mention @${ctx.botInfo?.username || 'PasiyaMaxQueen_bot'} + question\n` +
        `• Or reply to my messages\n` +
        `• Full tools work best in private chat\n` +
        `• /menu — open this menu again`, mainMenuKeyboard(ctx));
  });

  bot.action('menu_id', async (ctx) => {
    await ctx.answerCbQuery();
    await uiReply(ctx, `ID: ${ctx.from.id}\nAdmin: ${isAdmin(ctx) ? 'YES' : 'NO'}`, mainMenuKeyboard(ctx));
  });

  bot.action('menu_admin', async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    await ctx.answerCbQuery();
    await uiReply(ctx, `Founder Admin Panel\nID: ${ctx.from.id}`, adminKeyboard());
  });

  // admin
  bot.action('admin_health', async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    await ctx.answerCbQuery();
    await uiReply(ctx, `Health\nToken: ${BOT_TOKEN ? 'set' : 'MISSING'}\nGemini: ${GEMINI_KEY ? 'set' : 'MISSING'}\nGitHub: ${GITHUB_TOKEN ? 'set' : 'no'}\nSupabase: ${supabase ? 'set' : 'MISSING'}\nUptime: ${uptimeText()}\nPending modes: ${pendingTool.size}`, adminKeyboard());
  });

  bot.action('admin_whoami', async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    await ctx.answerCbQuery();
    await uiReply(ctx, `Founder\nName: ${ctx.from.first_name || ''} ${ctx.from.last_name || ''}\n@${ctx.from.username || 'none'}\nID: ${ctx.from.id}\nADMIN match: YES`, adminKeyboard());
  });

  bot.action('admin_clear', async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    await ctx.answerCbQuery();
    pendingTool.clear();
    await uiReply(ctx, 'Cleared in-memory tool modes on this instance.', adminKeyboard());
  });

  bot.action('admin_model', async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    await ctx.answerCbQuery();
    await uiReply(ctx, `Model\nLast: ${resolvedModel || 'none'}\nCandidates:\n${MODELS.map((m) => `- ${m}`).join('\n')}`, adminKeyboard());
  });

  bot.action('admin_links', async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    await ctx.answerCbQuery();
    await uiReply(ctx, LINKS, adminKeyboard());
  });

  bot.action('admin_github', async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    await ctx.answerCbQuery();
    await ctx.sendChatAction('typing');
    await uiReply(ctx, await fetchGitHubStatus(), adminKeyboard());
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
    await uiReply(ctx, tip, toolsKeyboard());
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


  bot.on('document', async (ctx) => {
    try {
      if (!isAdmin(ctx)) return;
      if (ctx.chat?.type !== 'private') {
        // ignore group document spam
        return;
      }
      if (!GITHUB_TOKEN) {
        await ctx.reply('GITHUB_TOKEN not set on Vercel (need Contents: Read and write).');
        return;
      }

      const caption = (ctx.message.caption || '').trim();
      let path = await getPendingGhPath(ctx.from.id);

      // caption: "gh api/telegram.js" or "upload:README.md"
      const cap = caption.match(/^(?:gh|upload)\s*:?\s*(\S+)/i);
      if (cap) path = cap[1].replace(/^\/+/, '');

      const doc = ctx.message.document;
      if (!path && doc?.file_name) {
        path = doc.file_name;
        await ctx.reply(
          `⚠ No /ghpath set — would upload to ROOT as ${path}.\n` +
            `Cancel mentally & use:\n/ghpath lib/${doc.file_name}\nthen resend.\n` +
            `Or caption this file: gh lib/${doc.file_name}`
        );
      }
      if (!path) {
        await ctx.reply('Set path first:\n/ghpath lib/aiRouter.js\nor caption: gh lib/aiRouter.js');
        return;
      }
      path = String(path).replace(/^\/+/, '').replace(/\\/g, '/');

      // size limit ~4.5MB for GitHub API practicality on serverless
      if (doc.file_size && doc.file_size > 4_500_000) {
        await ctx.reply('File too large for bot upload (max ~4.5MB). Use GitHub web UI.');
        return;
      }

      await ctx.reply(`Uploading to ${GITHUB_REPO}:${path} …`);
      const file = await ctx.telegram.getFile(doc.file_id);
      const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`;
      const res = await fetch(fileUrl);
      const buf = Buffer.from(await res.arrayBuffer());

      const result = await githubPutFile(
        path,
        buf,
        `bot-upload: ${path} by founder`
      );
      await clearPendingGhPath(ctx.from.id);

      if (!result.ok) {
        await ctx.reply(`Upload failed:\n${result.error}`);
        return;
      }
      await ctx.reply(
        `Uploaded.\nRepo: ${result.repo}\nPath: ${result.path}\n${result.url || 'Open GitHub repo to verify.'}\n\nVercel will redeploy if this is the linked repo.`
      );
    } catch (err) {
      console.error('document', err);
      try {
        await ctx.reply(`document upload failed: ${String(err?.message || err).slice(0, 150)}`);
      } catch (_) {}
    }
  });




  async function handleVideoLike(ctx, fileId, kind) {
    const isPrivate = ctx.chat?.type === 'private';
    if (!isPrivate && !isAdmin(ctx)) return;
    if (!isPrivate) {
      const q = await loadGroupSettings(ctx.chat.id);
      if (q?.botQuiet && !isAdmin(ctx)) return;
    }
    const uid = String(ctx.from.id);
    if (!isAdmin(ctx)) {
      const rate = await checkRateLimit(uid);
      if (!rate.ok) {
        await ctx.reply(`Slow down. Retry in ~${rate.waitSec}s.`);
        return;
      }
    }
    await ctx.sendChatAction('typing');
    const file = await ctx.telegram.getFile(fileId);
    const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`;
    const res = await fetch(fileUrl);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 8_000_000) {
      await ctx.reply('Video too large for free-tier analysis. Send a shorter clip.');
      return;
    }
    const b64 = buf.toString('base64');
    const path = file.file_path || '';
    const mime = path.endsWith('.mp4')
      ? 'video/mp4'
      : path.endsWith('.webm')
        ? 'video/webm'
        : 'video/mp4';
    const caption = ctx.message.caption || ctx.message.text || '';
    const out = await generateReply(
      `This is a short ${kind}. Describe what you see/hear that is useful. If running-related, give practical coaching tips. ` +
        `User caption/context: ${caption || '(none)'}. Max 12 lines.`,
      ctx,
      b64,
      mime
    );
    await ctx.reply(out.slice(0, 3500));
  }

  bot.on('video_note', async (ctx) => {
    try {
      const vn = ctx.message.video_note;
      if (!vn?.file_id) return;
      await handleVideoLike(ctx, vn.file_id, 'video note (round)');
    } catch (err) {
      console.error('video_note', err);
      try {
        await ctx.reply('Video note AI failed. Try a photo or text.');
      } catch (_) {}
    }
  });

  bot.on('video', async (ctx) => {
    try {
      const v = ctx.message.video;
      if (!v?.file_id) return;
      // only if private or admin, and prefer short videos
      if (v.duration && v.duration > 45) {
        const isPrivate = ctx.chat?.type === 'private';
        if (isPrivate || isAdmin(ctx)) {
          await ctx.reply('Video longer than 45s — analysis skipped (free tier). Send a shorter clip.');
        }
        return;
      }
      await handleVideoLike(ctx, v.file_id, 'video');
    } catch (err) {
      console.error('video', err);
      try {
        await ctx.reply('Video AI failed. Try a photo or shorter clip.');
      } catch (_) {}
    }
  });



  bot.on('location', async (ctx) => {
    try {
      const loc = ctx.message.location;
      if (!loc) return;
      const isPrivate = ctx.chat?.type === 'private';
      if (!isPrivate && !isAdmin(ctx)) {
        // groups: only if not quiet
        const q = await loadGroupSettings(ctx.chat.id);
        if (q?.botQuiet && !isAdmin(ctx)) return;
      }
      const uid = String(ctx.from.id);
      if (!isAdmin(ctx)) {
        const rate = await checkRateLimit(uid);
        if (!rate.ok) {
          await ctx.reply(`Slow down. Retry in ~${rate.waitSec}s.`);
          return;
        }
      }
      await ctx.sendChatAction('typing');
      let weatherLine = 'Weather: (unavailable)';
      try {
        const w = await fetchWeather(loc.latitude, loc.longitude);
        if (w.ok) {
          weatherLine =
            `Weather now: ${w.temp}°C feels ${w.feels}°C · ${weatherCodeText(w.code)} · ` +
            `Humidity ${w.humidity}% · Wind ${w.wind} km/h · Precip ${w.precip} mm`;
        }
      } catch (_) {}
      const out = await generateReply(
        `User shared GPS for outdoor activity.\n` +
          `Lat: ${loc.latitude} Lon: ${loc.longitude}\n` +
          `${weatherLine}\n` +
          `Give practical outdoor guidance using the REAL weather numbers above. ` +
          `Hydration, visibility, pacing, safety. Max 10 lines. Match user language.`,
        ctx
      );
      await ctx.reply(
        `LOCATION COACH\n${loc.latitude.toFixed(5)}, ${loc.longitude.toFixed(5)}\n${weatherLine}\n\n${out}`.slice(0, 3500)
      );
      
    } catch (err) {
      console.error('location', err);
      try {
        await ctx.reply('Location coach failed. Try /dailytip');
      } catch (_) {}
    }
  });


  
  bot.on('voice', async (ctx) => {
    try {
      const payV = await spendGold(ctx, 'voice');
      if (!payV.ok) {
        await ctx.reply(payV.message || 'Not enough gold. /balance');
        return;
      }

      const isPrivate = ctx.chat?.type === 'private';
      if (!isPrivate && !isAdmin(ctx)) {
        return;
      }
      if (!isPrivate) {
        const q = await loadGroupSettings(ctx.chat.id);
        if (q?.botQuiet && !isAdmin(ctx)) return;
      }

      const uid = String(ctx.from.id);
      if (!isAdmin(ctx)) {
        const rate = await checkRateLimit(uid);
        if (!rate.ok) {
          await ctx.reply('Slow down. Retry in ~' + rate.waitSec + 's.');
          return;
        }
      }

      const voice = ctx.message.voice;
      if (!voice) return;
      if (voice.file_size && voice.file_size > 4_000_000) {
        await ctx.reply('Voice note too long/large. Send a shorter one.');
        return;
      }

      await ctx.sendChatAction('typing');
      const file = await ctx.telegram.getFile(voice.file_id);
      const fileUrl = 'https://api.telegram.org/file/bot' + BOT_TOKEN + '/' + file.file_path;
      const res = await fetch(fileUrl);
      const buf = Buffer.from(await res.arrayBuffer());

      const { transcribeVoiceGroq } = await import('../lib/stt.js');
      const stt = await transcribeVoiceGroq(buf, 'voice.ogg');
      if (!stt.ok) {
        await ctx.reply(
          'Voice STT failed: ' +
            String(stt.error || '').slice(0, 140) +
            '. Send as text, or check GROQ_API_KEY.'
        );
        return;
      }
      const transcript = stt.text.slice(0, 2000);
      const out = await generateReply(
        'User spoke (voice transcript):\n' +
          transcript +
          '\n\nReply helpfully in the same language (Sinhala or English). Keep under 12 lines.',
        ctx
      );
      await ctx.reply('🎙 ' + transcript.slice(0, 500) + '\n\n' + String(out || '').slice(0, 3000));
    } catch (err) {
      console.error('voice', err);
      try {
        await ctx.reply('Voice AI failed. Try text /ask.');
      } catch (_) {}
    }
  });

  bot.on('photo', async (ctx) => {
    try {
      const payP = await spendGold(ctx, 'vision');
      if (!payP.ok) {
        await ctx.reply(payP.message || 'Not enough gold. /balance');
        return;
      }

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
    if (!text) return;

    // Non-AI slash commands (guard: never send these to Gemini)
    try {
      if (/^\/currency(@\w+)?(\s|$)/i.test(text)) {
        await handleCurrencyCommand(ctx);
        return;
      }
      if (/^\/moon(@\w+)?(\s|$)/i.test(text)) {
        await handleMoonCommand(ctx);
        return;
      }
      if (/^\/sun(@\w+)?(\s|$)/i.test(text)) {
        await handleSunCommand(ctx);
        return;
      }
      if (/^\/aqi(@\w+)?(\s|$)/i.test(text)) {
        await handleAqiCommand(ctx);
        return;
      }
      if (/^\/weather(@\w+)?(\s|$)/i.test(text)) {
        // let bot.command('weather') handle if present; fallback message
        // fall through only if not matched — still never Gemini:
        return;
      }
      if (/^\/forecast(@\w+)?(\s|$)/i.test(text)) {
        return;
      }
    } catch (err) {
      console.error('non-ai cmd', err);
      await ctx.reply('Command failed. Try again.');
      return;
    }

    if (text.startsWith('/')) return;

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

      // Bot-enforced slow mode (Telegram API setChatSlowModeDelay returns 404 on some hosts)
      const slowSec = Number(settings?.slowSeconds) || 0;
      if (slowSec > 0) {
        try {
          const member = await ctx.telegram.getChatMember(ctx.chat.id, ctx.from.id);
          const isAdm = member.status === 'administrator' || member.status === 'creator';
          if (!isAdm && !isAdmin(ctx)) {
            const sk = `${ctx.chat.id}:${ctx.from.id}`;
            const now = Date.now();
            const last = slowLastMsg.get(sk) || 0;
            const waitMs = slowSec * 1000 - (now - last);
            if (waitMs > 0) {
              try {
                await ctx.deleteMessage(ctx.message.message_id);
              } catch (_) {}
              await ctx.reply(
                `Slow mode ${slowSec}s. Wait ~${Math.ceil(waitMs / 1000)}s.`,
                { reply_parameters: undefined }
              );
              return;
            }
            slowLastMsg.set(sk, now);
          }
        } catch (err) {
          console.error('slow-mode', err);
        }
      }
    }

    // Groups: only when @mentioned or reply-to-bot (saves quota)
    if (ctx.chat?.type === 'group' || ctx.chat?.type === 'supergroup') {
      const qset = await loadGroupSettings(ctx.chat.id);
      if (qset?.botQuiet && !isAdmin(ctx)) {
        return; // quiet mode: no AI chat replies
      }
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
    if (/^(10|[1-9])$/.test(text) && !mode) {
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
        await uiReply(ctx, LINKS, mainMenuKeyboard(ctx));
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
        await uiReply(ctx, 'TOOLS MENU', toolsKeyboard());
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
        await uiReply(ctx, LINKS, mainMenuKeyboard(ctx));
        return;
      }
      if (text === '8') {
        pendingTool.set(uid, 'platforms_lab');
        await ctx.reply(platformsPanelText(), platformsKeyboard());
        return;
      }
      if (text === '9') {
        await uiReply(ctx, statusText(ctx), mainMenuKeyboard(ctx));
        return;
      }
      if (text === '10') {
        await uiReply(ctx, siGuideIntroText(), siGuideHomeKeyboard());
        return;
      }
    }

    // Handle submenu navigation back / 0
    if (text === '0' || text.toLowerCase() === 'back') {
      pendingTool.delete(uid);
      await uiReply(ctx, numberedMainMenuText(), mainMenuKeyboard(ctx));
      return;
    }

    if (mode === 'platforms_lab') {
      if (text === '0') {
        pendingTool.delete(uid);
        await uiReply(ctx, numberedMainMenuText(), mainMenuKeyboard(ctx));
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
        await uiReply(ctx, numberedMainMenuText(), mainMenuKeyboard(ctx));
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
        await uiReply(ctx, out, mainMenuKeyboard(ctx));
      } catch (err) {
        console.error('edu_lab', err);
        await ctx.reply('Education Lab failed. Try again in a moment.');
      }
      return;
    }

    if (mode === 'group_lab') {
      if (text === '0') {
        pendingTool.delete(uid);
        await uiReply(ctx, numberedMainMenuText(), mainMenuKeyboard(ctx));
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

    {
      const pay = await spendGold(ctx, 'ask');
      if (!pay.ok) {
        await ctx.reply(pay.message || 'Not enough Radiant Gold. /balance /daily');
        return;
      }
      const out = await generateReply(text, ctx);
      const suffix =
        pay.free || pay.gold == null
          ? ''
          : `\n\n— ${pay.spent || GOLD_COST.ask} gold · bal ${pay.gold}`;
      await ctx.reply((out + suffix).slice(0, 4000), afterReplyKeyboard(ctx));
    }
  });


  // P5 Inline mode — tools + ask (AI) + rich help
  bot.on('inline_query', async (ctx) => {
    try {
      const q = String(ctx.inlineQuery?.query || '').trim();
      const ql = q.toLowerCase();
      const results = [];
      const botU = ctx.botInfo?.username || 'PasiyaMaxQueen_bot';
      const mk = (id, title, description, message) => ({
        type: 'article',
        id: String(id).slice(0, 64),
        title: String(title).slice(0, 64),
        description: String(description || '').slice(0, 120),
        input_message_content: {
          message_text: String(message).slice(0, 4000),
        },
      });

      // --- empty: help hub ---
      if (!q) {
        results.push(
          mk(
            'help',
            '📖 Help · Commands',
            'Menu, tools, gold, weather…',
            'RADIANT QUEEN · PASIYA MAX\n\n' +
              'Main: /menu /tools /balance /daily /ref\n' +
              'Weather: /weather Colombo\n' +
              'Remind: /remind 10m message\n' +
              'AI: send text in bot (5 gold) · /imagine\n' +
              'Inline: weather · calc · ask · gold · help\n\n' +
              'Web: https://radiant-queen-pasiya-max-v2.vercel.app\n' +
              'Bot: @' +
              botU
          )
        );
        results.push(
          mk(
            'askhow',
            '🤖 Ask AI (inline)',
            'Type: ask your question',
            'Inline AI:\n@' +
              botU +
              ' ask How do I start a 5K plan?\n\nUses Radiant Gold (same as chat). Founder unlimited.'
          )
        );
        results.push(
          mk(
            'wxhow',
            '🌦️ Weather',
            'weather Colombo',
            'Type: @' + botU + ' weather Colombo'
          )
        );
        results.push(
          mk(
            'calchow',
            '🧮 Calculator',
            'calc 10*5',
            'Type: @' + botU + ' calc (10+2)*3'
          )
        );
        results.push(
          mk(
            'goldhow',
            '💰 Gold wallet',
            '/balance in bot',
            'Open @' + botU + ' and type /balance\n/daily → +50 gold'
          )
        );
        await ctx.answerInlineQuery(results.slice(0, 20), {
          cache_time: 15,
          is_personal: true,
        });
        return;
      }

      // --- ask / ai / q  → AI (rate limit + gold) ---
      const askM = /^(ask|ai|q)\s+(.{3,})$/i.exec(q);
      if (askM) {
        const question = askM[2].trim();
        const uid = ctx.from?.id;
        if (!isAdmin(ctx)) {
          const rate = await checkRateLimit(uid);
          if (!rate.ok) {
            results.push(
              mk(
                'rate',
                'Slow down',
                'Retry in ~' + (rate.waitSec || 60) + 's',
                'Rate limit. Wait ~' + (rate.waitSec || 60) + 's then try again.'
              )
            );
            await ctx.answerInlineQuery(results, { cache_time: 1, is_personal: true });
            return;
          }
        }
        const pay = await spendGold(ctx, 'ask');
        if (!pay.ok) {
          results.push(
            mk(
              'nogold',
              'Not enough gold',
              pay.message || 'Need gold',
              (pay.message || 'Not enough Radiant Gold.') + '\nOpen @' + botU + ' → /daily /balance'
            )
          );
          await ctx.answerInlineQuery(results, { cache_time: 1, is_personal: true });
          return;
        }
        try {
          const aiPromise = generateReply(question, ctx);
          const out = await Promise.race([
            aiPromise,
            new Promise((_, rej) =>
              setTimeout(() => rej(new Error('AI timeout')), 12000)
            ),
          ]);
          const suffix =
            pay.free || pay.gold == null
              ? ''
              : '\n\n— ' + (pay.spent || 5) + ' gold · bal ' + pay.gold;
          const text = (String(out || '').trim() + suffix).slice(0, 4000);
          results.push(
            mk(
              'ai1',
              'AI: ' + question.slice(0, 40),
              'Tap to send answer',
              text || 'No answer. Try in bot chat.'
            )
          );
        } catch (e) {
          results.push(
            mk(
              'aifail',
              'AI busy / slow',
              'Open bot instead',
              'Inline AI timed out or failed.\nOpen @' +
                botU +
                ' and send:\n' +
                question +
                '\n\n(' +
                String(e.message || e).slice(0, 80) +
                ')'
            )
          );
        }
        await ctx.answerInlineQuery(results.slice(0, 5), {
          cache_time: 5,
          is_personal: true,
        });
        return;
      }

      // --- weather ---
      if (ql.startsWith('weather') || ql.startsWith('wx ')) {
        const place = q.replace(/^(weather|wx)\s*/i, '').trim() || 'Colombo';
        try {
          const geo = await geocodePlace(place);
          if (geo) {
            const w = await fetchWeather(geo.lat, geo.lon);
            const label = [geo.name, geo.admin1, geo.country].filter(Boolean).join(', ');
            const body =
              w && w.ok
                ? 'Weather · ' +
                  label +
                  '\n' +
                  weatherCodeText(w.code) +
                  '\nTemp: ' +
                  w.temp +
                  '°C (feels ' +
                  w.feels +
                  ')\nHumidity: ' +
                  w.humidity +
                  '% · Wind: ' +
                  w.wind +
                  '\nHigh/Low: ' +
                  w.tmax +
                  ' / ' +
                  w.tmin
                : 'Weather lookup: ' + label + '\nOpen bot: /weather ' + place;
            results.push(mk('wx1', 'Weather: ' + place, label, body));
          } else {
            results.push(
              mk('wx0', 'Place not found', place, 'Try /weather ' + place + ' in the bot chat.')
            );
          }
        } catch (e) {
          results.push(
            mk('wxe', 'Weather error', String(e.message || e), 'Try /weather ' + place + ' in bot.')
          );
        }
      } else if (ql.startsWith('calc') || ql.startsWith('=')) {
        let expr = q.replace(/^(calc|=)\s*/i, '').trim();
        try {
          const safe = expr.replace(/[^0-9+\-*/().%\s]/g, '');
          if (!safe) throw new Error('bad expr');
          const val = Function('"use strict"; return (' + safe + ')')();
          results.push(mk('c1', expr + ' = ' + val, 'Calculator', '🧮 ' + expr + ' = ' + val));
        } catch (_) {
          results.push(mk('c0', 'Calc help', 'calc 10*5', 'Example: calc (10+2)*3'));
        }
      } else if (ql.startsWith('gold') || ql === 'balance') {
        results.push(
          mk(
            'g1',
            'Radiant Gold',
            'Open wallet in bot',
            'Open @' + botU + ' and type /balance\n/daily for +50 gold'
          )
        );
      } else if (ql.startsWith('time') || ql === 'now') {
        const now = new Date().toISOString();
        results.push(mk('t1', 'UTC time', now, '🕒 UTC: ' + now));
      } else if (ql.startsWith('help') || ql.startsWith('menu')) {
        results.push(
          mk(
            'h1',
            'Help · Radiant Queen',
            'Full command map',
            'RADIANT QUEEN · PASIYA MAX\n\n' +
              '/menu /tools /balance /daily /ref /refstats\n' +
              '/weather /forecast /remind /imagine\n' +
              '/persona /memory /forget\n' +
              'Inline: weather X · calc X · ask X · gold · help\n\n' +
              'Web: https://radiant-queen-pasiya-max-v2.vercel.app'
          )
        );
      } else {
        results.push(
          mk(
            'q1',
            'Ask AI: ' + q.slice(0, 36),
            'Prefix with ask ',
            'For inline AI type:\n@' +
              botU +
              ' ask ' +
              q +
              '\n\nOr open the bot and send your message (uses gold).'
          )
        );
        results.push(
          mk(
            'q2',
            'Help',
            'Inline tips',
            'Try: ask … · weather Colombo · calc 10*5 · gold · help'
          )
        );
      }

      await ctx.answerInlineQuery(results.slice(0, 20), {
        cache_time: 8,
        is_personal: true,
      });
    } catch (err) {
      console.error('inline_query', err);
      try {
        await ctx.answerInlineQuery([], { cache_time: 1 });
      } catch (_) {}
    }
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
            allowed_updates: ['message', 'callback_query', 'inline_query', 'chosen_inline_result', 'chat_member', 'my_chat_member', 'chat_join_request'],
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
 
