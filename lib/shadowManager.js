import { createClient } from '@supabase/supabase-js';

function sb() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

function founderId() {
  return String(process.env.ADMIN_ID || process.env.FOUNDER_ID || 'founder')
    .split(/[\s,]+/)
    .filter(Boolean)[0] || 'founder';
}

function tagTask(text) {
  const t = String(text || '').toLowerCase();
  const tags = [];
  if (/remind|call|amma|mother|meeting|pay|buy/.test(t)) tags.push('remind');
  if (/gold|xau|bullion/.test(t)) tags.push('gold');
  if (/weather|rain|temp|forecast|colombo|climate/.test(t)) tags.push('weather');
  if (/news|headline/.test(t)) tags.push('news');
  if (!tags.length) tags.push('general');
  return tags;
}

function parseDue(text) {
  const t = String(text || '').toLowerCase();
  const now = new Date();
  // default: next 7:00 Asia/Colombo-ish = store as tomorrow 01:30 UTC rough; client displays local
  const due = new Date(now);
  if (/tomorrow|හෙට/.test(t)) due.setDate(due.getDate() + 1);
  due.setUTCHours(1, 30, 0, 0); // ~7:00 IST/Colombo-ish window
  if (/today|අද/.test(t) && !/tomorrow/.test(t)) {
    const d2 = new Date(now);
    d2.setUTCHours(1, 30, 0, 0);
    if (d2 < now) d2.setDate(d2.getDate() + 1);
    return d2.toISOString();
  }
  return due.toISOString();
}

export async function addTask(rawText, userId = founderId()) {
  const client = sb();
  if (!client) throw new Error('Supabase not configured');
  const text = String(rawText || '').trim();
  if (!text) throw new Error('empty task');
  const row = {
    user_id: String(userId),
    raw_text: text.slice(0, 2000),
    status: 'pending',
    due_at: parseDue(text),
    tags: tagTask(text),
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await client.from('shadow_tasks').insert(row).select('id, raw_text, due_at, tags, status').single();
  if (error) throw new Error(error.message);
  return data;
}

export async function listTasks({ status = 'pending', limit = 30 } = {}) {
  const client = sb();
  if (!client) throw new Error('Supabase not configured');
  let q = client.from('shadow_tasks').select('id, raw_text, status, due_at, tags, created_at, done_at').order('created_at', { ascending: false }).limit(limit);
  if (status && status !== 'all') q = q.eq('status', status);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data || [];
}

export async function setTaskStatus(id, status) {
  const client = sb();
  if (!client) throw new Error('Supabase not configured');
  const patch = { status, updated_at: new Date().toISOString() };
  if (status === 'done' || status === 'cancelled') patch.done_at = new Date().toISOString();
  const { error } = await client.from('shadow_tasks').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
  return true;
}

async function webSearch(query) {
  try {
    const ws = await import('./webSearch.js');
    const fn = ws.search || ws.webSearch || ws.tavilySearch;
    if (typeof fn === 'function') {
      const r = await fn(query);
      if (typeof r === 'string') return r.slice(0, 500);
      if (r?.answer) return String(r.answer).slice(0, 500);
      if (r?.results?.[0]) {
        const x = r.results[0];
        return String(x.snippet || x.content || x.title || '').slice(0, 500);
      }
      return JSON.stringify(r).slice(0, 400);
    }
  } catch (e) {
    return '(search unavailable: ' + (e.message || 'error') + ')';
  }
  return '(no web_search module)';
}

export async function runMorningReport({ sendTelegram = true } = {}) {
  const client = sb();
  if (!client) throw new Error('Supabase not configured');
  const { data: tasks, error } = await client
    .from('shadow_tasks')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(15);
  if (error) throw new Error(error.message);
  const list = tasks || [];
  if (!list.length) {
    return { ok: true, empty: true, body: '👑 Queen Shadow\nNo pending tasks for this morning.' };
  }

  // mark processing
  const ids = list.map((t) => t.id);
  await client.from('shadow_tasks').update({ status: 'processing', updated_at: new Date().toISOString() }).in('id', ids);

  const needGold = list.some((t) => (t.tags || []).includes('gold') || /gold/i.test(t.raw_text));
  const needWeather = list.some((t) => (t.tags || []).includes('weather') || /weather|rain/i.test(t.raw_text));
  const needNews = list.some((t) => (t.tags || []).includes('news'));

  const shared = {};
  if (needGold) shared.gold = await webSearch('current gold price USD and LKR today');
  if (needWeather) shared.weather = await webSearch('Colombo Sri Lanka weather today forecast');
  if (needNews) shared.news = await webSearch('top world news headlines today');

  const lines = ['👑 Queen Shadow · Morning Report', '────────────────────'];
  for (const t of list) {
    lines.push('• ' + t.raw_text);
    const tags = t.tags || [];
    if (tags.includes('gold') && shared.gold) lines.push('  🏷 Gold: ' + shared.gold);
    if (tags.includes('weather') && shared.weather) lines.push('  🌤 Weather: ' + shared.weather);
    if (tags.includes('news') && shared.news) lines.push('  📰 ' + shared.news);
  }
  if (shared.gold && !list.some((t) => (t.tags || []).includes('gold'))) {
    /* only attach when tagged */
  }
  lines.push('────────────────────');
  lines.push('Tasks processed: ' + list.length);
  const body = lines.join('\n');

  const { data: rep, error: rErr } = await client
    .from('shadow_reports')
    .insert({ user_id: founderId(), body, task_ids: ids })
    .select('id')
    .single();
  if (rErr) throw new Error(rErr.message);

  await client
    .from('shadow_tasks')
    .update({
      status: 'done',
      done_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      report_id: rep.id,
      result: { shared },
    })
    .in('id', ids);

  if (sendTelegram) {
    const chatId = process.env.ADMIN_ID || process.env.FOUNDER_ID || process.env.TELEGRAM_FOUNDER_ID;
    const token = process.env.BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
    if (chatId && token) {
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: String(chatId).split(/[\s,]+/)[0], text: body.slice(0, 4000) }),
      });
    }
  }

  return { ok: true, empty: false, body, task_count: list.length, report_id: rep.id };
}

export function helpText() {
  return (
    '👑 QUEEN SHADOW\n\n' +
    '• shadow: <task> — save night task\n' +
    '• shadow list — pending tasks\n' +
    '• shadow done <id> / shadow delete <id>\n' +
    '• shadow morning — ONE morning report now\n\n' +
    'Example:\nshadow: Tomorrow 7am remind me to call Amma, gold price + weather'
  );
}
