/**
 * lib/liveBoard.js — Pack D
 * Snapshot table rq_live_board (id=1) + optional Telegram watchers
 */
export async function refreshLiveBoard(supabase) {
  if (!supabase) return { ok: false, error: 'No Supabase' };

  const stats = {
    wallets: 0,
    premium: 0,
    gold_sum: 0,
    active_reminders: 0,
    referrals: 0,
    memory_rows: 0,
    events_24h: 0,
    vault_files: 0,
    email_subs: 0,
  };

  try {
    const { data } = await supabase.from('rq_gold').select('gold, premium');
    if (data) {
      stats.wallets = data.length;
      stats.premium = data.filter((r) => r.premium).length;
      stats.gold_sum = data.reduce((s, r) => s + (Number(r.gold) || 0), 0);
    }
  } catch (_) {}

  try {
    const since24 = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const a = await supabase
      .from('rq_reminders')
      .select('*', { count: 'exact', head: true })
      .eq('active', true);
    stats.active_reminders = a.count ?? 0;
    const b = await supabase.from('rq_referrals').select('*', { count: 'exact', head: true });
    stats.referrals = b.count ?? 0;
    const c = await supabase.from('rq_ai_memory').select('*', { count: 'exact', head: true });
    stats.memory_rows = c.count ?? 0;
    const d = await supabase
      .from('rq_events')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', since24);
    stats.events_24h = d.count ?? 0;
  } catch (_) {}

  try {
    const v = await supabase.from('rq_vault_files').select('*', { count: 'exact', head: true });
    stats.vault_files = v.count ?? 0;
  } catch (_) {}
  try {
    const e = await supabase
      .from('rq_email_prefs')
      .select('*', { count: 'exact', head: true })
      .eq('digest_enabled', true);
    stats.email_subs = e.count ?? 0;
  } catch (_) {}

  const row = {
    id: 1,
    payload: stats,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('rq_live_board')
    .upsert(row, { onConflict: 'id' })
    .select('*')
    .single();

  if (error) return { ok: false, error: error.message, stats };
  return { ok: true, board: data, stats };
}

export async function getLiveBoard(supabase) {
  if (!supabase) return { ok: false, error: 'No Supabase' };
  const { data, error } = await supabase
    .from('rq_live_board')
    .select('*')
    .eq('id', 1)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) {
    return refreshLiveBoard(supabase);
  }
  return { ok: true, board: data, stats: data.payload || {} };
}

export function formatLiveBoardText(stats, updatedAt) {
  const s = stats || {};
  return (
    '📡 LIVE BOARD · Radiant Queen\n' +
    'Updated: ' +
    (updatedAt || new Date().toISOString()) +
    '\n\n' +
    '👥 Wallets: ' +
    (s.wallets ?? '—') +
    ' · 👑 Premium: ' +
    (s.premium ?? '—') +
    '\n' +
    '🥇 Gold total: ' +
    (s.gold_sum ?? '—') +
    '\n' +
    '⏰ Reminders: ' +
    (s.active_reminders ?? '—') +
    ' · 🎁 Refs: ' +
    (s.referrals ?? '—') +
    '\n' +
    '🧠 Memory: ' +
    (s.memory_rows ?? '—') +
    ' · 📊 Events 24h: ' +
    (s.events_24h ?? '—') +
    '\n' +
    '📁 Vault files: ' +
    (s.vault_files ?? '—') +
    ' · ✉️ Email subs: ' +
    (s.email_subs ?? '—') +
    '\n\n' +
    'Web (auto-refresh): https://radiant-queen-pasiya-max-v2.vercel.app/bot/live.html\n' +
    '/livewatch · /liveoff · /liverefresh'
  );
}

export async function setLiveWatch(supabase, userId, on) {
  if (!supabase) return { ok: false, error: 'No Supabase' };
  const { data, error } = await supabase
    .from('rq_live_watchers')
    .upsert(
      {
        user_id: Number(userId),
        active: !!on,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    )
    .select('*')
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, watcher: data };
}

export async function listLiveWatchers(supabase) {
  if (!supabase) return [];
  const { data } = await supabase
    .from('rq_live_watchers')
    .select('user_id')
    .eq('active', true)
    .limit(50);
  return data || [];
}

export default {
  refreshLiveBoard,
  getLiveBoard,
  formatLiveBoardText,
  setLiveWatch,
  listLiveWatchers,
};
