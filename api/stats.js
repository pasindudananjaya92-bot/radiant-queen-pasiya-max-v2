/**
 * api/stats.js — mini analytics JSON for web dashboard
 * GET /api/stats?secret=CRON_SECRET  (or STATS_SECRET)
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';
const SECRET =
  process.env.STATS_SECRET || process.env.CRON_SECRET || '';

function sb() {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  return createClient(SUPABASE_URL, SUPABASE_KEY);
}

function authorized(req) {
  if (!SECRET) return true;
  const q = String(req.query?.secret || '').trim();
  if (q && q === SECRET) return true;
  const auth = String(req.headers.authorization || '');
  if (auth === 'Bearer ' + SECRET) return true;
  return false;
}

async function countExact(client, table, filterFn) {
  try {
    let q = client.from(table).select('*', { count: 'exact', head: true });
    if (filterFn) q = filterFn(q);
    const { count, error } = await q;
    if (error) return null;
    return count ?? 0;
  } catch (_) {
    return null;
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'GET only' });
  }
  if (!authorized(req)) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }
  const client = sb();
  if (!client) {
    return res.status(500).json({ ok: false, error: 'supabase missing' });
  }

  try {
    const since24 = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const since7 = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const wallets = await countExact(client, 'rq_gold');
    const premiumUsers = await countExact(client, 'rq_gold', (q) =>
      q.eq('premium', true)
    );
    const activeReminders = await countExact(client, 'rq_reminders', (q) =>
      q.eq('active', true)
    );
    const referrals = await countExact(client, 'rq_referrals');
    const memoryRows = await countExact(client, 'rq_ai_memory');
    const events24 = await countExact(client, 'rq_events', (q) =>
      q.gte('created_at', since24)
    );
    const events7 = await countExact(client, 'rq_events', (q) =>
      q.gte('created_at', since7)
    );
    const memory24 = await countExact(client, 'rq_ai_memory', (q) =>
      q.gte('created_at', since24)
    );

    let goldSum = 0;
    try {
      const { data } = await client.from('rq_gold').select('gold');
      if (data) goldSum = data.reduce((s, r) => s + (Number(r.gold) || 0), 0);
    } catch (_) {}

    // Top events last 7d
    let topEvents = [];
    try {
      const { data } = await client
        .from('rq_events')
        .select('event')
        .gte('created_at', since7)
        .limit(500);
      if (data && data.length) {
        const map = {};
        for (const row of data) {
          const k = row.event || 'unknown';
          map[k] = (map[k] || 0) + 1;
        }
        topEvents = Object.entries(map)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 12)
          .map(([event, count]) => ({ event, count }));
      }
    } catch (_) {}

    return res.status(200).json({
      ok: true,
      time: new Date().toISOString(),
      economy: {
        wallets,
        premiumUsers,
        goldInCirculation: goldSum,
      },
      activity: {
        memoryRows,
        memoryLast24h: memory24,
        activeReminders,
        referrals,
        eventsLast24h: events24,
        eventsLast7d: events7,
      },
      topEvents,
      notes: [
        'DAU approximated via rq_ai_memory + rq_events last 24h when logging is on',
        'Premium = rq_gold.premium (unlimited AI spend in bot)',
      ],
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err.message || err) });
  }
}
