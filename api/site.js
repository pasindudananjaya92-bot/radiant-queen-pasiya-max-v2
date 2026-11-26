/**
 * Wave 38A — Public site JSON + Web lead form intake
 * GET  /api/site
 * GET  /api/site?section=home
 * POST /api/site?action=lead  { name, business, contact, need }
 * No new serverless function — same site.js slot.
 */
export const config = { runtime: 'nodejs', maxDuration: 15 };

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'public, s-maxage=15, stale-while-revalidate=60');
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch (_) {
      return Object.fromEntries(new URLSearchParams(req.body));
    }
  }
  // raw stream fallback
  try {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const raw = Buffer.concat(chunks).toString('utf8');
    if (!raw) return {};
    try {
      return JSON.parse(raw);
    } catch (_) {
      return Object.fromEntries(new URLSearchParams(raw));
    }
  } catch (_) {
    return {};
  }
}

function ipHash(req) {
  const ip =
    req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() ||
    req.headers['x-real-ip'] ||
    req.socket?.remoteAddress ||
    '';
  let h = 0;
  const s = String(ip);
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return 'ip_' + h.toString(16);
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const action = String(req.query?.action || '').toLowerCase();

  // POST lead form
  if (req.method === 'POST' && (action === 'lead' || action === 'weblead' || action === 'funnel')) {
    try {
      const body = await readBody(req);
      const eng = await import('../lib/webLeadEngine.js');
      const result = await eng.intakeWebLead(body, {
        ipHash: ipHash(req),
        ua: req.headers['user-agent'] || '',
        utm: {
          utm_source: body.utm_source || '',
          utm_campaign: body.utm_campaign || '',
        },
      });
      if (result.ignored) return res.status(200).json({ ok: true, ignored: true });
      if (!result.ok) return res.status(400).json({ ok: false, error: result.error });
      // Public response — never expose internal ids if you prefer; we return short id + blueprint
      return res.status(200).json({
        ok: true,
        message: result.publicMessage,
        priority: result.priority,
        score: result.score,
        blueprint: result.blueprint,
        lead_id: result.lead?.id ? String(result.lead.id).slice(0, 8) : null,
      });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message || String(e) });
    }
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'GET or POST action=lead' });
  }

  try {
    const wm = await import('../lib/webMaster.js');
    const section = String(req.query?.section || '').trim();
    if (section) {
      const one = await wm.getSection(section);
      if (!one.ok) return res.status(404).json(one);
      if (one.row.published === false) return res.status(404).json({ ok: false, error: 'unpublished' });
      return res.status(200).json({
        ok: true,
        version: wm.VERSION || '38A',
        section: one.row.section,
        title: one.row.title,
        content: one.row.content,
        content_type: one.row.content_type,
        updated_at: one.row.updated_at,
      });
    }
    const payload = await wm.publicSitePayload();
    return res.status(payload.ok ? 200 : 500).json(payload);
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message || String(e) });
  }
}
