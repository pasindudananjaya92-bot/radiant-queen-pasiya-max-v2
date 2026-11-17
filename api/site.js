
/**
 * GET /api/site — public JSON for InfinityFree PHP
 * Optional: ?section=home
 */
export const config = { runtime: 'nodejs', maxDuration: 15 };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'GET only' });

  try {
    const wm = await import('../lib/webMaster.js');
    const section = String(req.query?.section || '').trim();
    if (section) {
      const one = await wm.getSection(section);
      if (!one.ok) return res.status(404).json(one);
      if (one.row.published === false) return res.status(404).json({ ok: false, error: 'unpublished' });
      return res.status(200).json({
        ok: true,
        version: wm.VERSION || '23A',
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
