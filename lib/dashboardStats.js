import { createClient } from '@supabase/supabase-js';

function sb() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function usageSummary(limit = 40) {
  const client = sb();
  if (!client) return { ok: false, error: 'supabase missing', rows: [], byTool: {} };
  const { data, error } = await client
    .from('api_usage_logs')
    .select('id, provider, tool, ok, latency_ms, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) return { ok: false, error: error.message, rows: [], byTool: {} };

  const rows = data || [];
  const byTool = {};
  for (const r of rows) {
    const k = `${r.provider || '?'}/${r.tool || '?'}`;
    if (!byTool[k]) byTool[k] = { total: 0, ok: 0, fail: 0, avg_ms: 0, _sum: 0 };
    byTool[k].total += 1;
    if (r.ok) byTool[k].ok += 1;
    else byTool[k].fail += 1;
    byTool[k]._sum += Number(r.latency_ms || 0);
  }
  for (const k of Object.keys(byTool)) {
    byTool[k].avg_ms = Math.round(byTool[k]._sum / Math.max(1, byTool[k].total));
    delete byTool[k]._sum;
  }
  return { ok: true, rows, byTool, count: rows.length };
}
