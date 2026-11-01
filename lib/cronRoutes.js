/**
 * Agent-18 command router for cron-job.org management.
 * Returns a reply string, or null if not a cron command.
 */

import * as cm from './cronManager.js';

const pendingDelete = new Map();
const PENDING_MS = 5 * 60 * 1000;

function isFounder(ctx) {
  const admin = String(process.env.ADMIN_ID || process.env.FOUNDER_ID || '').trim();
  const uid = String(ctx?.from?.id || ctx?.message?.from?.id || '');
  return !!(admin && uid && admin === uid);
}

function clean(text) {
  return String(text || '')
    .replace(/^[\/]/, '')
    .trim();
}

/**
 * @returns {Promise<string|null>}
 */
async function tryHandle(ctx, rawText) {
  const text = clean(rawText);
  if (!text) return null;

  const isCron =
    /^(cron|cronjobs?|cron[-_ ]?manager)\b/i.test(text) ||
    /^confirm\s+cron\s+delete\b/i.test(text);

  if (!isCron) return null;

  if (!isFounder(ctx)) {
    return '👑 Founder-only · Cron Manager (Agent-18)';
  }

  try {
    if (/^(cron|cronjobs?)\s*(help|\?|$)/i.test(text) || text === 'cron') {
      return cm.helpText();
    }

    const conf = text.match(/^confirm\s+cron\s+delete\s+(\d+)\s*$/i);
    if (conf) {
      const id = conf[1];
      const key = String(ctx?.from?.id || '');
      const pend = pendingDelete.get(key);
      if (!pend || String(pend.id) !== String(id) || Date.now() > pend.exp) {
        return 'No pending delete (or expired). Use: cron delete <id>';
      }
      await cm.deleteJob(id);
      pendingDelete.delete(key);
      return 'Deleted cron job #' + id;
    }

    if (
      /^cron\s+list\b/i.test(text) ||
      /^cronjobs?\s*$/i.test(text) ||
      /^cronjobs?\s+list\b/i.test(text)
    ) {
      const jobs = await cm.listJobs();
      if (!jobs.length) return 'No cron-job.org jobs.';
      const lines = jobs.slice(0, 30).map((j) => cm.formatJob(j));
      let msg = '⏱ cron-job.org · ' + jobs.length + ' job(s)\n\n' + lines.join('\n\n');
      if (jobs.length > 30) msg += '\n\n…+' + (jobs.length - 30) + ' more';
      return msg;
    }

    const st = text.match(/^cron\s+status\s+(\d+)\s*$/i);
    if (st) {
      const j = await cm.getJob(st[1]);
      return (
        '⏱ Job #' +
        st[1] +
        '\n' +
        cm.formatJob(j) +
        '\nenabled=' +
        j.enabled +
        '\nschedule=' +
        cm.describeSchedule(j.schedule)
      );
    }

    const en = text.match(/^cron\s+(enable|disable)\s+(\d+)\s*$/i);
    if (en) {
      if (en[1].toLowerCase() === 'enable') await cm.enableJob(en[2]);
      else await cm.disableJob(en[2]);
      return '✅ Job #' + en[2] + ' → ' + en[1].toLowerCase() + 'd';
    }

    const del = text.match(/^cron\s+delete\s+(\d+)\s*$/i);
    if (del) {
      pendingDelete.set(String(ctx?.from?.id || ''), {
        id: del[1],
        exp: Date.now() + PENDING_MS,
      });
      return (
        '⏸ CONFIRM GATE · delete cron #' +
        del[1] +
        '\nReply within 5m:\nconfirm cron delete ' + del[1]
      );
    }

    if (/^cron\s+heal\b/i.test(text) || /^cron\s+healcheck\b/i.test(text)) {
      const r = await cm.healJobs();
      let msg =
        '🩺 CRON HEAL\n' +
        'Account jobs: ' +
        r.total +
        '\nOurs (bot URLs): ' +
        r.ours +
        '\nRe-enabled: ' +
        (r.reEnabled.length ? r.reEnabled.join(', ') : 'none') +
        '\n';
      if (r.failed.length) {
        msg += '\n⚠️ Last-fail (manual check):\n';
        for (const f of r.failed.slice(0, 10)) {
          msg += '• #' + f.id + ' ' + (f.title || '') + ' status=' + f.lastStatus + '\n';
        }
      } else {
        msg += '\n✅ No failed lastStatus among our jobs';
      }
      return msg;
    }

    if (/^cron\s+keepalive\b/i.test(text)) {
      const url = cm.defaultKeepAliveUrl();
      const jobs = await cm.listJobs();
      const existing = jobs.find(
        (j) =>
          String(j.url || '').includes('job=keepalive') ||
          /keep\s*alive/i.test(j.title || '')
      );
      if (existing && existing.enabled !== false) {
        return (
          '✅ Keep-alive already exists\n#' +
          existing.jobId +
          ' · ' +
          (existing.title || '') +
          '\n' +
          existing.url
        );
      }
      if (existing && existing.enabled === false) {
        await cm.enableJob(existing.jobId);
        return '✅ Re-enabled keep-alive #' + existing.jobId;
      }
      const id = await cm.createJob({
        title: 'Keep Alive StrideClub',
        url,
        schedule: cm.scheduleEveryMinutes(5),
        enabled: true,
      });
      return '✅ Created keep-alive job #' + id + '\nEvery 5m → keepalive\n' + url;
    }

    const cr = text.match(/^cron\s+create\s+(.+)$/i);
    if (cr) {
      const body = cr[1].trim();
      const parts = body.split('|').map((s) => s.trim());
      let title;
      let url;
      let schedRaw;
      if (parts.length >= 2) {
        title = parts[0];
        url = parts[1];
        schedRaw = parts[2] || '5m';
      } else {
        const m = body.match(/^(https?:\/\/\S+)\s+(.+)$/i);
        if (m) {
          url = m[1];
          title = 'PasiyaOS job';
          schedRaw = m[2];
        } else {
          return 'Usage: cron create Title | https://url | 5m';
        }
      }
      if (!/^https?:\/\//i.test(url)) {
        return 'URL must start with http(s)://';
      }
      const schedule = cm.parseSchedule(schedRaw);
      const id = await cm.createJob({ title, url, schedule, enabled: true });
      return '✅ Created #' + id + '\n' + title + '\n' + url + '\nschedule: ' + schedRaw;
    }

    return cm.helpText();
  } catch (e) {
    return '❌ Cron Manager: ' + (e.message || e);
  }
}

export { tryHandle, isFounder };