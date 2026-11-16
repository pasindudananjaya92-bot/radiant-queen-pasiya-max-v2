
function isFounder(ctx) {
  const admin = String(process.env.ADMIN_ID || process.env.FOUNDER_ID || '')
    .split(/[\s,]+/)
    .filter(Boolean);
  const uid = String(ctx?.from?.id || ctx?.message?.from?.id || '');
  if (!admin.length) return true;
  return admin.includes(uid);
}

export function isCoverageText(text = '') {
  const t = String(text || '')
    .trim()
    .replace(/^\//, '');
  return /^(coverage|stations)\b/i.test(t);
}

export async function tryHandle(text = '', ctx = null) {
  const raw = String(text || '')
    .trim()
    .replace(/^\//, '');
  if (!raw || !isCoverageText(raw)) return null;
  if (ctx && !isFounder(ctx)) return '🔒 Founder only.';

  const eng = await import('./coverageEngine.js');
  const lower = raw.toLowerCase();

  if (/^(coverage|stations)\s+help$/i.test(lower) || /^(coverage|stations)$/i.test(lower)) {
    return eng.coverageHelp();
  }
  if (/^(coverage|stations)\s+map$/i.test(lower)) {
    return eng.formatCoverageMap();
  }
  if (/^(coverage|stations)\s+corps$/i.test(lower)) {
    return eng.formatCoverageCorps();
  }
  if (/^(coverage|stations)\s+gaps$/i.test(lower)) {
    const r = await eng.runCoverageScan({ openTickets: true });
    return eng.formatCoverageScan(r, { gapsOnly: true });
  }
  if (/^(coverage|stations)\s+scan$/i.test(lower)) {
    const r = await eng.runCoverageScan({ openTickets: true });
    return eng.formatCoverageScan(r, { gapsOnly: false });
  }
  return '❓ Try `coverage help`';
}

export default { tryHandle, isCoverageText };
