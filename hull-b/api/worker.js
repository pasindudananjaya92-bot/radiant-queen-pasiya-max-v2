/**
 * Hull B worker endpoint — V6000 skills
 */
import { handleWorkerRequest } from '../lib/hullWorker.js';

function auth(req) {
  const secret =
    process.env.HULL_SHARED_SECRET || process.env.CRON_SECRET || '';
  if (!secret) return true;
  const h =
    req.headers['x-hull-secret'] ||
    req.headers['authorization'] ||
    '';
  const q = req.query?.secret || '';
  if (String(q) === secret) return true;
  if (String(h) === secret) return true;
  if (String(h).replace(/^Bearer\s+/i, '') === secret) return true;
  return false;
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    return res.status(200).json({
      ok: true,
      role: process.env.HULL_ROLE || 'worker',
      skills: ['research', 'shadow_due', 'syntax_check', 'shell_py', 'dna_digest', 'browse'],
    });
  }
  if (!auth(req)) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }
  try {
    const body = typeof req.body === 'object' && req.body ? req.body : {};
    const out = await handleWorkerRequest(body);
    return res.status(200).json(out);
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e.message || e) });
  }
}
