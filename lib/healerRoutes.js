// Wave 11C — Healer / Immune Telegram commands

function isFounder(ctx) {
  const admin = String(process.env.ADMIN_ID || process.env.FOUNDER_ID || '')
    .split(/[\s,]+/)
    .filter(Boolean);
  const uid = String(ctx?.from?.id || ctx?.message?.from?.id || '');
  if (!admin.length) return true;
  return admin.includes(uid);
}

export function isHealerText(text = '') {
  const t = String(text || '')
    .trim()
    .replace(/^\//, '');
  return /^(heal|immune|playbook|playbooks)\b/i.test(t);
}

export async function tryHandle(text = '', ctx = null) {
  const raw = String(text || '')
    .trim()
    .replace(/^\//, '');
  if (!raw || !isHealerText(raw)) return null;
  if (ctx && !isFounder(ctx)) return '🔒 Founder only.';

  const lower = raw.toLowerCase();
  const eng = await import('./healerEngine.js');

  try {
    if (/^(heal|immune)\s+help$/i.test(lower) || /^(heal|immune)$/i.test(lower)) {
      return (
        '*Immune System · Wave 11C*\n' +
        '• `heal now` — detect → fix → verify\n' +
        '• `heal dry` — signals only (no changes)\n' +
        '• `heal status` — last heal log\n' +
        '• `heal playbooks` — list auto playbooks\n\n' +
        '_Auto-safe only: cron heal, stuck jobs, health recheck, ack alerts._'
      );
    }

    if (/^(heal|immune)\s+(now|run|cycle)$/i.test(lower)) {
      const r = await eng.runImmuneCycle({ dryRun: false });
      return r.report;
    }

    if (/^(heal|immune)\s+dry$/i.test(lower) || /^(heal|immune)\s+scan$/i.test(lower)) {
      const r = await eng.runImmuneCycle({ dryRun: true });
      return r.report;
    }

    if (/^(heal|immune)\s+status$/i.test(lower) || /^(heal|immune)\s+log$/i.test(lower)) {
      const logs = await eng.recentHealLog(8);
      if (!logs.length) {
        return '🛡️ No heal log yet. Run `heal now` (optional SQL: 001_healer_log.sql).';
      }
      return (
        '🛡️ *Recent heals*\n\n' +
        logs
          .map(
            (l, i) =>
              `${i + 1}. *${l.playbook}* · ${l.status}${l.verified ? ' ✓' : ''}\n${String(l.detail || '').slice(0, 120)}`
          )
          .join('\n\n')
      );
    }

    if (/^(heal|immune)\s+playbooks?$/i.test(lower) || /^playbooks?$/i.test(lower)) {
      const list = await eng.listPlaybooks();
      return (
        '🩹 *Playbooks*\n\n' +
        list
          .map(
            (p) =>
              `· *${p.id}* — ${p.name}\n  When: ${p.when}\n  Action: ${p.action}\n  Auto: ${p.auto ? 'yes' : 'no'}`
          )
          .join('\n\n')
      );
    }

    return '❓ Unknown heal command. Try `heal help`';
  } catch (e) {
    return `❌ Healer error: ${e.message || e}`;
  }
}

export default { tryHandle, isHealerText };
