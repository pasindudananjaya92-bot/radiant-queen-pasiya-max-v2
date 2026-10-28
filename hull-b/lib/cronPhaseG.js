/**
 * Phase G scheduled jobs — imported by api/cron.js only.
 * No new serverless functions.
 */

const ADMIN = () =>
  String(process.env.ADMIN_ID || process.env.FOUNDER_ID || '').trim();

async function tgSend(chatId, text) {
  const token = process.env.BOT_TOKEN;
  if (!token || !chatId) return { ok: false };
  try {
    const r = await fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: String(text).slice(0, 3500) }),
    });
    const j = await r.json().catch(() => ({}));
    return { ok: !!j.ok };
  } catch (_) {
    return { ok: false };
  }
}

/** Deliver due Shadow Twin drafts to founder */
export async function jobShadowDue() {
  try {
    const mod = await import('./shadowTwin.js');
    const fn = mod.deliverDue || (mod.default && mod.default.deliverDue);
    if (typeof fn !== 'function') {
      return { job: 'shadow', ok: false, error: 'deliverDue missing — upload lib/shadowTwin.js' };
    }
    const r = await fn(8);
    return { job: 'shadow', ok: true, delivered: r.delivered || 0 };
  } catch (e) {
    return { job: 'shadow', ok: false, error: String(e.message || e).slice(0, 200) };
  }
}

/** Ping Hull B worker to claim+process one queued job */
export async function jobHullPoll() {
  const base = String(process.env.HULL_B_URL || '').replace(/\/$/, '');
  const secret = process.env.HULL_SHARED_SECRET || process.env.CRON_SECRET || '';
  if (!base) {
    // Local fallback: try claim on this hull
    try {
      const w = await import('./hullWorker.js');
      const claim = w.claimNextJob || (w.default && w.default.claimNextJob);
      const run = w.processJob || (w.default && w.default.processJob);
      if (typeof claim !== 'function') {
        return { job: 'hullpoll', ok: false, error: 'HULL_B_URL unset and no local claimNextJob' };
      }
      const job = await claim();
      if (!job) return { job: 'hullpoll', ok: true, processed: 0, note: 'queue empty' };
      if (typeof run === 'function') {
        await run(job);
        return { job: 'hullpoll', ok: true, processed: 1, id: job.id, mode: 'local' };
      }
      return { job: 'hullpoll', ok: true, processed: 0, claimed: job.id, note: 'no processJob' };
    } catch (e) {
      return { job: 'hullpoll', ok: false, error: String(e.message || e).slice(0, 200) };
    }
  }

  try {
    const url = base + '/api/worker';
    const r = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-hull-secret': secret,
        Authorization: 'Bearer ' + secret,
      },
      body: JSON.stringify({ action: 'poll', limit: 1 }),
      signal: AbortSignal.timeout(25000),
    });
    const j = await r.json().catch(() => ({}));
    return {
      job: 'hullpoll',
      ok: r.ok,
      status: r.status,
      result: j,
      mode: 'hull-b',
    };
  } catch (e) {
    return { job: 'hullpoll', ok: false, error: String(e.message || e).slice(0, 200) };
  }
}

/** DM founder top Error DNA patterns (quiet if empty) */
export async function jobDnaDigest() {
  try {
    const mod = await import('./errorDna.js');
    // Prefer listing via rest pattern in errorDna — use handle style
    const sbUrl = process.env.SUPABASE_URL;
    const key =
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
    if (!sbUrl || !key) return { job: 'dna', ok: false, error: 'no supabase' };
    const r = await fetch(
      sbUrl.replace(/\/$/, '') +
        '/rest/v1/rq_error_dna?order=count.desc,last_seen.desc&limit=5&select=fingerprint,count,command,message,last_seen',
      {
        headers: {
          apikey: key,
          Authorization: 'Bearer ' + key,
        },
        signal: AbortSignal.timeout(12000),
      }
    );
    const rows = await r.json().catch(() => []);
    if (!Array.isArray(rows) || !rows.length) {
      return { job: 'dna', ok: true, patterns: 0, quiet: true };
    }
    const lines = ['🧬 ERROR DNA DIGEST', ''];
    rows.forEach((row, i) => {
      lines.push(
        i +
          1 +
          '. ×' +
          (row.count || 1) +
          ' · ' +
          String(row.command || '-') +
          '\n   ' +
          String(row.message || row.fingerprint || '').slice(0, 120)
      );
    });
    await tgSend(ADMIN(), lines.join('\n'));
    return { job: 'dna', ok: true, patterns: rows.length };
  } catch (e) {
    return { job: 'dna', ok: false, error: String(e.message || e).slice(0, 200) };
  }
}

export default { jobShadowDue, jobHullPoll, jobDnaDigest };
