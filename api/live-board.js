/**
 * api/live-board.js — Pack D
 * GET public snapshot for web live.html (poll every few seconds)
 * Optional: ?refresh=1&secret=CRON_SECRET to force refresh
 */
import { createClient } from '@supabase/supabase-js';

const CRON_SECRET = process.env.CRON_SECRET || '';
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';

function sb() {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  return createClient(SUPABASE_URL, SUPABASE_KEY);
}

export default async function handler(req, res) {
  try {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'no-store');
    if (req.method === 'OPTIONS') return res.status(200).end();

    const client = sb();
    if (!client) return res.status(500).json({ ok: false, error: 'supabase missing' });

    const { getLiveBoard, refreshLiveBoard } = await import('../lib/liveBoard.js');
    const q = req.query || {};
    const wantRefresh = String(q.refresh || '') === '1';
    const secret = String(q.secret || '').trim();
    const authOk = !CRON_SECRET || secret === CRON_SECRET;

    let out;
    if (wantRefresh && authOk) {
      out = await refreshLiveBoard(client);
    } else {
      out = await getLiveBoard(client);
      // auto-refresh if older than 60s
      const updated = out.board?.updated_at ? new Date(out.board.updated_at).getTime() : 0;
      if (!updated || Date.now() - updated > 60000) {
        out = await refreshLiveBoard(client);
      }
    }

    if (!out.ok) return res.status(500).json(out);
    return res.status(200).json({
      ok: true,
      updated_at: out.board?.updated_at || null,
      stats: out.stats || out.board?.payload || {},
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err.message || err) });
  }
}
