/**
 * Hull B worker core — process rq_hull_jobs and optional direct run
 */
function sb() {
  const url = process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
  if (!url || !key) return null;
  return { url: url.replace(/\/$/, ''), key };
}

async function rest(path, opts = {}) {
  const s = sb();
  if (!s) throw new Error('Supabase not configured');
  const res = await fetch(s.url + '/rest/v1/' + path, {
    method: opts.method || 'GET',
    headers: {
      apikey: s.key,
      Authorization: 'Bearer ' + s.key,
      'Content-Type': 'application/json',
      Prefer: opts.prefer || 'return=representation',
    },
    body: opts.body,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch (_) {
    json = { raw: text.slice(0, 200) };
  }
  if (!res.ok) {
    throw new Error(
      (json && (json.message || json.error || json.raw)) ||
        'HTTP ' + res.status
    );
  }
  return json;
}

export async function claimNextJob() {
  const rows = await rest(
    'rq_hull_jobs?status=eq.queued&order=priority.desc,created_at.asc&limit=1&select=*'
  );
  if (!Array.isArray(rows) || !rows[0]) return null;
  const job = rows[0];
  await rest('rq_hull_jobs?id=eq.' + encodeURIComponent(job.id), {
    method: 'PATCH',
    prefer: 'return=minimal',
    body: JSON.stringify({
      status: 'running',
      started_at: new Date().toISOString(),
    }),
  });
  return job;
}

export async function finishJob(id, { ok, result, error }) {
  await rest('rq_hull_jobs?id=eq.' + encodeURIComponent(id), {
    method: 'PATCH',
    prefer: 'return=minimal',
    body: JSON.stringify({
      status: ok ? 'done' : 'failed',
      result: result || null,
      error: error ? String(error).slice(0, 500) : null,
      finished_at: new Date().toISOString(),
    }),
  });
}

async function telegramSend(chatId, text) {
  const token = process.env.BOT_TOKEN;
  if (!token || !chatId) return;
  await fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: String(text).slice(0, 4000),
    }),
  });
}

/**
 * Execute a queued telegram_cmd payload — best-effort handlers
 */
export async function executeTelegramCmd(payload) {
  const text = String(payload?.text || '').trim();
  const chatId = payload?.chatId;
  if (!text) return { ok: false, error: 'empty text' };

  // Lightweight built-in: researchdeep / browse style via vane if present
  try {
    if (/^\/researchdeep\b/i.test(text) || /^\/askweb\b/i.test(text)) {
      const q = text.replace(/^\/\S+\s*/, '').trim();
      let reply = 'Worker processed: ' + text.slice(0, 80);
      try {
        const vane = await import('./vaneAnswer.js');
        if (vane?.answerWeb) {
          const r = await vane.answerWeb(q || text);
          reply = typeof r === 'string' ? r : JSON.stringify(r).slice(0, 3500);
        } else if (vane?.default?.answer) {
          const r = await vane.default.answer(q);
          reply = String(r).slice(0, 3500);
        }
      } catch (e) {
        reply = 'Worker note: vane unavailable — ' + String(e.message || e).slice(0, 120);
      }
      await telegramSend(chatId, '🛰 Hull B\n' + reply);
      return { ok: true, result: { reply: reply.slice(0, 500) } };
    }

    if (/^\/browse\b/i.test(text)) {
      const url = text.replace(/^\/browse\s*/i, '').trim();
      let body = '';
      try {
        const res = await fetch('https://r.jina.ai/http://' + url.replace(/^https?:\/\//, ''), {
          headers: { Accept: 'text/markdown' },
        });
        body = (await res.text()).slice(0, 3000);
      } catch (e) {
        body = 'browse error: ' + String(e.message || e);
      }
      await telegramSend(chatId, '🛰 Hull B browse\n' + body.slice(0, 3500));
      return { ok: true, result: { len: body.length } };
    }

    // Generic ack for other heavy cmds until specialized handlers exist
    await telegramSend(
      chatId,
      '🛰 Hull B received:\n' +
        text.slice(0, 200) +
        '\n\n(Worker stub — wire specialized libs here as needed)'
    );
    return { ok: true, result: { stub: true, text: text.slice(0, 100) } };
  } catch (e) {
    await telegramSend(chatId, '❌ Hull B: ' + String(e.message || e).slice(0, 200));
    return { ok: false, error: String(e.message || e) };
  }
}

export async function processQueue(max = 3) {
  const results = [];
  for (let i = 0; i < max; i++) {
    const job = await claimNextJob();
    if (!job) break;
    try {
      let out = { ok: true, result: {} };
      if (job.kind === 'telegram_cmd') {
        out = await executeTelegramCmd(job.payload || {});
      } else {
        out = { ok: true, result: { skipped: true, kind: job.kind } };
      }
      await finishJob(job.id, out);
      results.push({ id: job.id, ...out });
    } catch (e) {
      await finishJob(job.id, { ok: false, error: e.message || String(e) });
      results.push({ id: job.id, ok: false, error: e.message });
    }
  }
  return results;
}

export function assertHullSecret(req) {
  const secret = process.env.HULL_SHARED_SECRET || process.env.CRON_SECRET || '';
  if (!secret) return false;
  const q = req.query?.secret || '';
  const h = req.headers?.['x-hull-secret'] || req.headers?.['x-cron-secret'] || '';
  return q === secret || h === secret;
}

export default {
  claimNextJob,
  finishJob,
  processQueue,
  executeTelegramCmd,
  assertHullSecret,
};
