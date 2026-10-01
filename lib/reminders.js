/**
 * lib/reminders.js — schedule reminders in Supabase + due scanner
 * Table: rq_reminders
 */
function pad(n) {
  return String(n).padStart(2, '0');
}

/** Parse: 10m, 1h, 5pm, 7:30am, daily 7am */
export function parseReminder(raw) {
  const text = String(raw || '').trim();
  if (!text) return { ok: false, error: 'Empty' };

  let recurring = null;
  let rest = text;
  const daily = rest.match(/^daily\s+/i);
  if (daily) {
    recurring = 'daily';
    rest = rest.slice(daily[0].length).trim();
  }

  // relative: 10m / 1h / 2d
  const rel = rest.match(/^(\d+)\s*(m|min|mins|minute|minutes|h|hr|hour|hours|d|day|days)\s+(.+)$/i);
  if (rel) {
    const n = parseInt(rel[1], 10);
    const unit = rel[2].toLowerCase();
    const message = rel[3].trim();
    if (!message) return { ok: false, error: 'Missing message after time' };
    let ms = n * 60 * 1000;
    if (unit.startsWith('h')) ms = n * 60 * 60 * 1000;
    if (unit.startsWith('d')) ms = n * 24 * 60 * 60 * 1000;
    return { ok: true, dueAt: new Date(Date.now() + ms), message, recurring };
  }

  // clock: 5pm / 5:30pm / 17:00
  const clk = rest.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s+(.+)$/i);
  if (clk) {
    let h = parseInt(clk[1], 10);
    const m = clk[2] ? parseInt(clk[2], 10) : 0;
    const ap = (clk[3] || '').toLowerCase();
    const message = clk[4].trim();
    if (!message) return { ok: false, error: 'Missing message after time' };
    if (ap === 'pm' && h < 12) h += 12;
    if (ap === 'am' && h === 12) h = 0;
    if (!ap && h > 23) return { ok: false, error: 'Bad hour' };
    const due = new Date();
    due.setSeconds(0, 0);
    due.setHours(h, m, 0, 0);
    if (due.getTime() <= Date.now() + 30 * 1000) {
      // if time already passed today, schedule tomorrow
      due.setDate(due.getDate() + 1);
    }
    return { ok: true, dueAt: due, message, recurring };
  }

  return {
    ok: false,
    error: 'Try: /remind 10m message  OR  /remind 5pm message  OR  /remind daily 7am message',
  };
}

export async function addReminder(supabase, { userId, chatId, message, dueAt, recurring }) {
  if (!supabase) return { ok: false, error: 'Supabase not configured' };
  const row = {
    user_id: Number(userId),
    chat_id: Number(chatId),
    message: String(message).slice(0, 500),
    due_at: dueAt.toISOString(),
    recurring: recurring || null,
    active: true,
  };
  const { data, error } = await supabase.from('rq_reminders').insert(row).select('id').single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, id: data.id };
}

export async function listReminders(supabase, userId) {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('rq_reminders')
    .select('id, message, due_at, recurring, active')
    .eq('user_id', Number(userId))
    .eq('active', true)
    .order('due_at', { ascending: true })
    .limit(20);
  if (error || !data) return [];
  return data;
}

export async function cancelReminder(supabase, userId, id) {
  if (!supabase) return { ok: false, error: 'no db' };
  const { error } = await supabase
    .from('rq_reminders')
    .update({ active: false })
    .eq('user_id', Number(userId))
    .eq('id', Number(id));
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Due reminders (for cron) */
export async function fetchDueReminders(supabase, nowIso) {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('rq_reminders')
    .select('*')
    .eq('active', true)
    .lte('due_at', nowIso)
    .order('due_at', { ascending: true })
    .limit(25);
  if (error || !data) return [];
  return data;
}

export async function markReminderDone(supabase, row) {
  if (!supabase || !row) return;
  if (row.recurring === 'daily') {
    const next = new Date(row.due_at);
    next.setDate(next.getDate() + 1);
    await supabase
      .from('rq_reminders')
      .update({ due_at: next.toISOString() })
      .eq('id', row.id);
  } else {
    await supabase.from('rq_reminders').update({ active: false }).eq('id', row.id);
  }
}

export default {
  parseReminder,
  addReminder,
  listReminders,
  cancelReminder,
  fetchDueReminders,
  markReminderDone,
};
