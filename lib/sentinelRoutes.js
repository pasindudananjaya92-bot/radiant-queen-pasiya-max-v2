// Wave 11D — Sentinel + Auditor Telegram commands

function isFounder(ctx) {
  const admin = String(process.env.ADMIN_ID || process.env.FOUNDER_ID || '')
    .split(/[\s,]+/)
    .filter(Boolean);
  const uid = String(ctx?.from?.id || ctx?.message?.from?.id || '');
  if (!admin.length) return true;
  return admin.includes(uid);
}

export function isSentinelText(text = '') {
  const t = String(text || '')
    .trim()
    .replace(/^\//, '');
  return /^(sentinel|audit|auditor|cyber)\b/i.test(t);
}

export async function tryHandle(text = '', ctx = null) {
  const raw = String(text || '')
    .trim()
    .replace(/^\//, '');
  if (!raw || !isSentinelText(raw)) return null;
  if (ctx && !isFounder(ctx)) return '🔒 Founder only.';

  const lower = raw.toLowerCase();

  try {
    if (
      /^(sentinel|audit|cyber)\s+help$/i.test(lower) ||
      /^(sentinel|audit|cyber)$/i.test(lower)
    ) {
      return (
        '*Sentinel + Auditors · Wave 11D*\n' +
        '• `sentinel scan` — env + leak patterns + auth posture\n' +
        '• `sentinel status` — recent scan log\n' +
        '• `audit commands` — command/route surface\n' +
        '• `audit risk` — architecture risk checklist\n' +
        '• `audit full` — commands + risk together\n\n' +
        '_Never prints secret values — only redacted findings._'
      );
    }

    if (/^sentinel\s+scan$/i.test(lower) || /^cyber\s+scan$/i.test(lower)) {
      const se = await import('./sentinelEngine.js');
      const r = await se.runSentinelScan();
      return r.report;
    }

    if (/^sentinel\s+(status|log)$/i.test(lower)) {
      const se = await import('./sentinelEngine.js');
      const logs = await se.recentSentinelLog(8);
      if (!logs.length) {
        return '🛰️ No sentinel log yet. Run `sentinel scan` (optional SQL: 001_sentinel_log.sql).';
      }
      return (
        '🛰️ *Recent scans*\n\n' +
        logs
          .map(
            (l, i) =>
              `${i + 1}. *${l.scan_type}* · ${l.severity}\n${l.title || ''}\n${String(l.detail || '').slice(0, 100)}`
          )
          .join('\n\n')
      );
    }

    if (/^audit\s+commands?$/i.test(lower)) {
      const au = await import('./auditorEngine.js');
      const r = await au.auditCommands();
      return r.report;
    }

    if (/^audit\s+risk$/i.test(lower)) {
      const au = await import('./auditorEngine.js');
      const r = au.auditRiskChecklist();
      return r.report;
    }

    if (/^audit\s+full$/i.test(lower)) {
      const au = await import('./auditorEngine.js');
      const r = await au.runFullAudit();
      return r.report.slice(0, 3900);
    }

    return '❓ Unknown sentinel/audit command. Try `sentinel help`';
  } catch (e) {
    return `❌ Sentinel/Audit error: ${e.message || e}`;
  }
}

export default { tryHandle, isSentinelText };
