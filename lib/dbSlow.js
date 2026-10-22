/**
 * /dbslow — Supabase query advisor (founder)
 * Uses rq_exec_sql when available; otherwise heuristics on known tables
 */
const ADVICE = {
  rq_audit_log: 'Index (created_at DESC), (user_id, created_at DESC) if filtering by user.',
  rq_neural_memory: 'Keep vector index (ivfflat/hnsw if scale grows); btree on created_at.',
  pasiya_fs: 'Unique (user_id, path); index (user_id, updated_at).',
  rq_bans: 'Primary key user_id; index banned_at.',
  rq_cron_jobs: 'Index (enabled, next_run).',
  rq_memories: 'Index (user_id); consider tsvector for keyword search.',
};

export async function analyzeDb(supabase) {
  if (!supabase) return { ok: false, error: 'Supabase not configured' };

  const tips = [];
  const tables = [];

  // Try information_schema via RPC
  try {
    const { data, error } = await supabase.rpc('rq_exec_sql', {
      query_text:
        "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name LIMIT 40",
    });
    if (!error && data) {
      const rows = data.rows || data || [];
      for (const row of rows) {
        const name = row.table_name || row.table_name;
        if (name) tables.push(String(name));
      }
    }
  } catch (_) {}

  // Fallback known set
  if (!tables.length) {
    tables.push(
      'rq_audit_log',
      'rq_neural_memory',
      'pasiya_fs',
      'rq_bans',
      'rq_bot_settings',
      'rq_cron_jobs'
    );
  }

  for (const t of tables) {
    if (ADVICE[t]) tips.push({ table: t, tip: ADVICE[t] });
  }

  // Sample counts (safe)
  const counts = [];
  for (const t of ['rq_audit_log', 'rq_neural_memory', 'pasiya_fs'].filter((x) =>
    tables.includes(x) || true
  )) {
    try {
      const { count, error } = await supabase.from(t).select('*', { count: 'exact', head: true });
      if (!error && count != null) counts.push({ table: t, count });
    } catch (_) {}
  }

  // pg_stat if available
  let slowHint = 'Enable pg_stat_statements on paid plans for true slow-query lists.';
  try {
    const { data } = await supabase.rpc('rq_exec_sql', {
      query_text:
        "SELECT query, calls, mean_exec_time FROM pg_stat_statements ORDER BY mean_exec_time DESC LIMIT 5",
    });
    if (data?.rows?.length) {
      slowHint = data.rows
        .map(
          (r) =>
            `• ${String(r.query || '').slice(0, 60)}… calls=${r.calls} mean=${Number(r.mean_exec_time || 0).toFixed(1)}ms`
        )
        .join('\n');
    }
  } catch (_) {}

  return { ok: true, tables, tips, counts, slowHint };
}

export function formatDbSlow(r) {
  if (!r.ok) return '❌ DB: ' + (r.error || 'fail');
  let out = '🗄 DB ADVISOR\n';
  if (r.counts?.length) {
    out +=
      'Counts:\n' + r.counts.map((c) => `• ${c.table}: ${c.count}`).join('\n') + '\n\n';
  }
  if (r.tips?.length) {
    out +=
      'Index tips:\n' + r.tips.map((t) => `• ${t.table}: ${t.tip}`).join('\n') + '\n\n';
  }
  out += 'Slow path:\n' + r.slowHint;
  return out.slice(0, 3900);
}

export default { analyzeDb, formatDbSlow };
