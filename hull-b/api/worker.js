/**
 * Hull B worker endpoint — ONE serverless function
 * Deploy this project as Hull B (second Vercel project).
 * Auth: HULL_SHARED_SECRET or CRON_SECRET
 */
import {
  processQueue,
  executeTelegramCmd,
  assertHullSecret,
} from '../lib/hullWorker.js';

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST' && req.method !== 'GET') {
      return res.status(405).json({ error: 'POST or GET' });
    }
    // GET health
    if (req.method === 'GET') {
      return res.status(200).json({
        ok: true,
        role: process.env.HULL_ROLE || 'worker',
        ts: Date.now(),
      });
    }
    if (!assertHullSecret(req)) {
      return res.status(401).json({ error: 'unauthorized' });
    }
    const body =
      typeof req.body === 'string'
        ? JSON.parse(req.body || '{}')
        : req.body || {};
    const action = body.action || 'process';

    if (action === 'run' && body.text) {
      const out = await executeTelegramCmd({
        text: body.text,
        chatId: body.chatId,
        userId: body.userId,
      });
      return res.status(200).json(out);
    }

    const results = await processQueue(Number(body.max || 3));
    return res.status(200).json({ ok: true, processed: results.length, results });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e).slice(0, 300) });
  }
}
