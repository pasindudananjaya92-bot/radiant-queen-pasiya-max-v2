/**
 * Hull B worker core — soft-deps, never crash on missing vane
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

async function loadVane() {
  const tries = [
    './vaneAnswer.js',
    '../lib/vaneAnswer.js',
    './lib/vaneAnswer.js',
  ];
  for (const p of tries) {
    try {
      return await import(p);
    } catch (_) {}
  }
  return null;
}

async function jinaBrowse(url) {
  const u = String(url || '').trim();
  if (!u) return '';
  const target = u.startsWith('http') ? u : 'https://' + u;
  const res = await fetch('https://r.jina.ai/' + target, {
    headers: { Accept: 'text/markdown' },
  });
  return (await res.text()).slice(0, 3500);
}

export async function executeTelegramCmd(payload) {
  const text = String(payload?.text || '').trim();
  const chatId = payload?.chatId;
  if (!text) return { ok: false, error: 'empty text' };

  try {
    if (/^\/researchdeep\b/i.test(text) || /^\/askweb\b/i.test(text)) {
      const q = text.replace(/^\/\S+\s*/, '').trim() || text;
      let reply = '';
      const vane = await loadVane();
      if (vane) {
        try {
          const fn =
            vane.askWithCitations ||
            vane.answerWeb ||
            vane.default?.askWithCitations ||
            vane.default?.answerWeb ||
            vane.answer ||
            vane.default?.answer;
          if (typeof fn === 'function') {
            const r = await fn(q, { focus: 'web' });
            if (typeof r === 'string') reply = r;
            else if (r?.answer) reply = r.answer + (r.footer ? '\n\n' + r.footer : '');
            else if (r?.text) reply = r.text;
            else if (r?.ok && r?.text) reply = r.text;
            else reply = JSON.stringify(r).slice(0, 3000);
          }
        } catch (e) {
          reply = '';
          console.error('vane err', e.message);
        }
      }
      if (!reply) {
        // Fallback: Tavily if key present
        const tk = process.env.TAVILY_API_KEY;
        if (tk) {
          try {
            const tr = await fetch('https://api.tavily.com/search', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                api_key: tk,
                query: q,
                max_results: 5,
                search_depth: 'basic',
              }),
            });
            const tj = await tr.json();
            const lines = (tj.results || [])
              .slice(0, 5)
              .map(
                (r, i) =>
                  i +
                  1 +
                  '. ' +
                  (r.title || '') +
                  '\n' +
                  String(r.content || '').slice(0, 200) +
                  '\n' +
                  (r.url || '')
              );
            reply =
              '🔬 Hull B research (Tavily)\n\n' +
              lines.join('\n\n') +
              '\n\nQuery: ' +
              q;
          } catch (e) {
            reply = 'Tavily fallback failed: ' + String(e.message || e);
          }
        } else {
          reply =
            'Hull B: no vane module and no TAVILY_API_KEY.\n' +
            'Upload hull-b/lib/vaneAnswer.js + vaneSearch.js + set TAVILY_API_KEY.\n' +
            'Query was: ' +
            q;
        }
      }
      await telegramSend(chatId, '🛰 Hull B\n' + String(reply).slice(0, 3800));
      return { ok: true, result: { reply: String(reply).slice(0, 300) } };
    }

    if (/^\/browse\b/i.test(text)) {
      const url = text.replace(/^\/browse\s*/i, '').trim();
      let body = await jinaBrowse(url);
      if (!body) body = 'empty browse result';
      await telegramSend(chatId, '🛰 Hull B browse\n' + body.slice(0, 3500));
      return { ok: true, result: { len: body.length } };
    }

    await telegramSend(
      chatId,
      '🛰 Hull B received:\n' + text.slice(0, 300) + '\n\n(stub handler)'
    );
    return { ok: true, result: { stub: true } };
  } catch (e) {
    await telegramSend(
      chatId,
      '❌ Hull B: ' + String(e.message || e).slice(0, 200)
    );
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
      results.push({ id: job.id, status: out.ok ? 'done' : 'failed' });
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
  const h =
    req.headers?.['x-hull-secret'] || req.headers?.['x-cron-secret'] || '';
  return q === secret || h === secret;
}

export default {
  claimNextJob,
  finishJob,
  processQueue,
  executeTelegramCmd,
  assertHullSecret,
};
