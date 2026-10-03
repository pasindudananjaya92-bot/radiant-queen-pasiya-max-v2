/**
 * api/cron-ghost.js — Pack P-FIX
 * Processes:
 *  1) ghost_queue → deleteMessage when deleteAt <= now
 *  2) due timecapsules → DM founder/user unlocked text
 *
 * Auth: CRON_SECRET (Bearer / ?secret= / x-cron-secret)
 * Schedule: cron-job.org every 30–60 seconds
 * Manual: GET/POST /api/cron-ghost?secret=YOUR_CRON_SECRET
 */
import { createClient } from '@supabase/supabase-js';

const BOT_TOKEN = process.env.BOT_TOKEN || '';
const CRON_SECRET = process.env.CRON_SECRET || '';
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';

function sb() {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  return createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function authorized(req) {
  if (!CRON_SECRET) return true;
  const q = String(req.query?.secret || '').trim();
  if (q && q === CRON_SECRET) return true;
  const h = String(req.headers['x-cron-secret'] || '').trim();
  if (h && h === CRON_SECRET) return true;
  const auth = String(req.headers['authorization'] || req.headers['Authorization'] || '');
  if (auth === 'Bearer ' + CRON_SECRET) return true;
  if (auth.startsWith('Bearer ') && auth.slice(7).trim() === CRON_SECRET) return true;
  return false;
}

async function getSetting(client, key) {
  if (!client) return null;
  const { data } = await client.from('rq_bot_settings').select('value').eq('key', key).maybeSingle();
  return data?.value ?? null;
}

async function setSetting(client, key, value) {
  if (!client) return;
  if (value == null) {
    await client.from('rq_bot_settings').delete().eq('key', key);
    return;
  }
  await client.from('rq_bot_settings').upsert({ key, value: String(value), updated_at: new Date().toISOString() });
}

async function tgDelete(chatId, messageId) {
  if (!BOT_TOKEN) return { ok: false };
  try {
    const r = await fetch('https://api.telegram.org/bot' + BOT_TOKEN + '/deleteMessage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, message_id: messageId }),
    });
    const j = await r.json().catch(() => ({}));
    return { ok: !!j.ok, description: j.description };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
}

async function tgSend(chatId, text) {
  if (!BOT_TOKEN || !chatId) return { ok: false };
  try {
    const r = await fetch('https://api.telegram.org/bot' + BOT_TOKEN + '/sendMessage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: String(text).slice(0, 3500) }),
    });
    const j = await r.json().catch(() => ({}));
    return { ok: !!j.ok };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
}

function unseal(sealed, key) {
  try {
    const raw = Buffer.from(String(sealed || ''), 'base64').toString('binary');
    const k = String(key || 'rq');
    const out = [];
    for (let i = 0; i < raw.length; i++) {
      out.push(String.fromCharCode(raw.charCodeAt(i) ^ k.charCodeAt(i % k.length)));
    }
    return out.join('');
  } catch (_) {
    return '';
  }
}

export default async function handler(req, res) {
  if (!authorized(req)) {
    res.status(401).json({ ok: false, error: 'unauthorized' });
    return;
  }
  const client = sb();
  if (!client) {
    res.status(500).json({ ok: false, error: 'no supabase' });
    return;
  }

  const now = Date.now();
  let deleted = 0;
  let capsulesOpened = 0;
  const errors = [];

  // ——— Ghost queue ———
  try {
    const raw = await getSetting(client, 'ghost_queue');
    let list = [];
    if (raw) {
      try {
        list = JSON.parse(raw);
      } catch (_) {
        list = [];
      }
    }
    const due = [];
    const keep = [];
    for (const g of Array.isArray(list) ? list : []) {
      if (!g?.deleteAt) continue;
      if (new Date(g.deleteAt).getTime() <= now) due.push(g);
      else keep.push(g);
    }
    for (const g of due) {
      const r = await tgDelete(g.chatId, g.messageId);
      if (r.ok) deleted += 1;
      else errors.push('del ' + g.messageId + ': ' + (r.description || r.error || 'fail'));
    }
    await setSetting(client, 'ghost_queue', JSON.stringify(keep.slice(-80)));
  } catch (e) {
    errors.push('ghost: ' + String(e.message || e));
  }

  // ——— Auto-deliver due capsules (scan keys capsules_*) ———
  // Lightweight: only process if capsule_index exists, else skip heavy scan
  try {
    const idxRaw = await getSetting(client, 'capsule_index');
    let index = [];
    if (idxRaw) {
      try {
        index = JSON.parse(idxRaw);
      } catch (_) {
        index = [];
      }
    }
    const still = [];
    for (const entry of Array.isArray(index) ? index : []) {
      const uid = String(entry.userId || '');
      if (!uid) continue;
      const key = 'capsules_' + uid;
      const raw = await getSetting(client, key);
      if (!raw) continue;
      let list = [];
      try {
        list = JSON.parse(raw);
      } catch (_) {
        continue;
      }
      let changed = false;
      for (const c of list) {
        if (c.opened) continue;
        if (new Date(c.unlockAt).getTime() > now) continue;
        const text = unseal(c.sealed, uid);
        await tgSend(uid, '📬 TIME CAPSULE OPENED\n\n' + (text || '(empty)'));
        c.opened = true;
        c.openedAt = new Date().toISOString();
        capsulesOpened += 1;
        changed = true;
      }
      if (changed) await setSetting(client, key, JSON.stringify(list.slice(0, 30)));
      // keep index if still has unopened
      if (list.some((c) => !c.opened)) still.push(entry);
    }
    await setSetting(client, 'capsule_index', JSON.stringify(still.slice(-100)));
  } catch (e) {
    errors.push('capsule: ' + String(e.message || e));
  }

  res.status(200).json({
    ok: true,
    deleted,
    capsulesOpened,
    errors: errors.slice(0, 5),
    at: new Date().toISOString(),
  });
}
