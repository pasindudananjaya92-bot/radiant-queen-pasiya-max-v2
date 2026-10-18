/**
 * lib/fortress.js — PasiyaOS Fortress Phase 2
 * Defense only: ban list, flood gate, settings flags, founder alerts.
 */
import { createClient } from '@supabase/supabase-js';

const ADMIN_ID = String(process.env.ADMIN_ID || '').trim();
const BOT_TOKEN = process.env.BOT_TOKEN || '';
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const RATE_WINDOW_MS = Number(process.env.FORTRESS_RATE_WINDOW_MS || 60_000);
const RATE_MAX_HITS = Number(process.env.FORTRESS_RATE_MAX || 45);
const FLOOD_AUTO_BAN_HITS = Number(process.env.FORTRESS_AUTO_BAN_HITS || 120);

let supabase = null;
if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
  supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

const memBan = new Map(); // userId -> { reason, banned_at }
const memRate = new Map();
let settingsCache = { at: 0, data: null };

export function getSupabase() {
  return supabase;
}

export async function loadOsSecurityFlags() {
  const now = Date.now();
  if (settingsCache.data && now - settingsCache.at < 30_000) return settingsCache.data;
  const defaults = {
    radar: true,
    autoBan: true,
    founderOnlyHeavy: true,
    requireInitData: true,
  };
  if (!supabase) {
    settingsCache = { at: now, data: defaults };
    return defaults;
  }
  try {
    // Prefer bot_settings key; Mini App also writes pasiya_fs path — bot may not read FS here
    const { data } = await supabase
      .from('rq_bot_settings')
      .select('value')
      .eq('key', 'os_security_flags')
      .maybeSingle();
    let flags = { ...defaults };
    if (data?.value) {
      try {
        flags = { ...flags, ...JSON.parse(data.value) };
      } catch (_) {}
    }
    settingsCache = { at: now, data: flags };
    return flags;
  } catch (_) {
    settingsCache = { at: now, data: defaults };
    return defaults;
  }
}

export async function saveOsSecurityFlags(flags) {
  if (!supabase) return { ok: false, error: 'no supabase' };
  await supabase.from('rq_bot_settings').upsert({
    key: 'os_security_flags',
    value: JSON.stringify(flags || {}),
    updated_at: new Date().toISOString(),
  });
  settingsCache = { at: 0, data: null };
  return { ok: true };
}

export async function isBanned(userId) {
  const id = String(userId || '');
  if (!id || id === ADMIN_ID) return false;
  if (memBan.has(id)) return true;
  if (!supabase) return false;
  try {
    const { data } = await supabase.from('rq_bans').select('user_id').eq('user_id', id).maybeSingle();
    if (data?.user_id) {
      memBan.set(id, true);
      return true;
    }
  } catch (_) {}
  return false;
}

export async function banUser(userId, reason = 'policy', bannedBy = 'system', meta = {}) {
  const id = String(userId || '');
  if (!id || id === ADMIN_ID) return { ok: false, error: 'cannot ban founder' };
  memBan.set(id, true);
  if (supabase) {
    try {
      await supabase.from('rq_bans').upsert({
        user_id: id,
        reason: String(reason).slice(0, 500),
        banned_by: String(bannedBy).slice(0, 64),
        banned_at: new Date().toISOString(),
        meta,
        hits: meta.hits || 1,
      });
    } catch (e) {
      return { ok: false, error: String(e.message || e) };
    }
  }
  return { ok: true };
}

export async function unbanUser(userId) {
  const id = String(userId || '');
  memBan.delete(id);
  if (supabase) {
    try {
      await supabase.from('rq_bans').delete().eq('user_id', id);
    } catch (e) {
      return { ok: false, error: String(e.message || e) };
    }
  }
  return { ok: true };
}

export async function listBans(limit = 20) {
  if (!supabase) return [];
  const { data } = await supabase
    .from('rq_bans')
    .select('user_id, reason, banned_at, banned_by, hits')
    .order('banned_at', { ascending: false })
    .limit(limit);
  return data || [];
}

/** Sliding window rate; returns { ok, waitSec, hits } */
export async function checkRate(userId) {
  const id = String(userId || '');
  if (!id || id === ADMIN_ID) return { ok: true, hits: 0 };
  const now = Date.now();
  let row = memRate.get(id) || { windowStart: now, hits: 0 };
  if (now - row.windowStart > RATE_WINDOW_MS) {
    row = { windowStart: now, hits: 0 };
  }
  row.hits += 1;
  memRate.set(id, row);

  if (supabase) {
    try {
      await supabase.from('rq_rate_limits').upsert({
        user_id: id,
        window_start: new Date(row.windowStart).toISOString(),
        hit_count: row.hits,
      });
    } catch (_) {}
  }

  if (row.hits > RATE_MAX_HITS) {
    return {
      ok: false,
      waitSec: Math.ceil((RATE_WINDOW_MS - (now - row.windowStart)) / 1000),
      hits: row.hits,
    };
  }
  return { ok: true, hits: row.hits };
}

export async function maybeAutoBanFlood(userId, hits) {
  const flags = await loadOsSecurityFlags();
  if (!flags.autoBan || !flags.radar) return { banned: false };
  if (hits >= FLOOD_AUTO_BAN_HITS) {
    await banUser(userId, 'auto-flood', 'fortress', { hits });
    await alertFounder(`🛡 Auto-ban flood user ${userId} hits=${hits}`);
    return { banned: true };
  }
  return { banned: false };
}

export async function alertFounder(text) {
  if (!BOT_TOKEN || !ADMIN_ID) return;
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: ADMIN_ID,
        text: String(text).slice(0, 3500),
      }),
    });
  } catch (_) {}
}

export async function logTriadEvent(userId, eventType, payload = {}) {
  if (!supabase) return;
  try {
    await supabase.from('rq_triad_events').insert({
      user_id: String(userId || ''),
      event_type: String(eventType || 'event').slice(0, 64),
      payload,
    });
  } catch (_) {}
}

/**
 * Telegraf middleware factory
 */
export function fortressMiddleware() {
  return async (ctx, next) => {
    try {
      const uid = ctx.from?.id != null ? String(ctx.from.id) : '';
      if (!uid) return next();
      if (ADMIN_ID && uid === ADMIN_ID) return next();

      if (await isBanned(uid)) {
        if (ctx.chat?.type === 'private') {
          try {
            await ctx.reply('🚫 Access denied (Fortress ban).');
          } catch (_) {}
        }
        return;
      }

      const rate = await checkRate(uid);
      if (!rate.ok) {
        const ab = await maybeAutoBanFlood(uid, rate.hits || 0);
        if (ab.banned) return;
        try {
          await ctx.reply(`⏳ Slow down. Retry in ~${rate.waitSec}s.`);
        } catch (_) {}
        return;
      }
    } catch (e) {
      console.error('fortress middleware', e?.message || e);
    }
    return next();
  };
}

/** Optional Firebase RTDB write (if FIREBASE_RTDB_URL + FIREBASE_RTDB_SECRET set) */
export async function firebaseTriadPing(userId, payload) {
  const base = String(process.env.FIREBASE_RTDB_URL || '').replace(/\/$/, '');
  const secret = String(process.env.FIREBASE_RTDB_SECRET || '').trim();
  if (!base) return { ok: false, error: 'FIREBASE_RTDB_URL not set' };
  const path = `/triad/${encodeURIComponent(String(userId || 'anon'))}/heartbeat.json`;
  const url = secret ? `${base}${path}?auth=${encodeURIComponent(secret)}` : `${base}${path}`;
  try {
    const r = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, ts: Date.now() }),
    });
    if (!r.ok) return { ok: false, error: 'firebase HTTP ' + r.status };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
}
