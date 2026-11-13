function isFounder(ctx) {
  const admin = String(process.env.ADMIN_ID || process.env.FOUNDER_ID || '')
    .split(/[\s,]+/)
    .filter(Boolean);
  const uid = String(ctx?.from?.id || ctx?.message?.from?.id || '');
  if (!admin.length) return true;
  return admin.includes(uid);
}

export function isScoutText(text = '') {
  const t = String(text || '')
    .trim()
    .replace(/^\//, '');
  return /^(scout|intel)\b/i.test(t);
}

export async function tryHandle(text = '', ctx = null) {
  const raw = String(text || '')
    .trim()
    .replace(/^\//, '');
  if (!raw || !isScoutText(raw)) return null;
  if (ctx && !isFounder(ctx)) return '🔒 Founder only.';
  const lower = raw.toLowerCase();
  const eng = await import('./scoutEngine.js');

  if (/^(scout|intel)\s+help$/i.test(lower) || /^(scout|intel)$/i.test(lower)) {
    return (
      '*Scout · Wave 11F*\n' +
      '• `scout os` — internal nation + health intel\n' +
      '• `scout intel <topic>` — internal + web (if Tavily configured)\n' +
      '• `scout <topic>` — same as intel\n'
    );
  }
  if (/^(scout|intel)\s+os$/i.test(lower)) {
    const r = await eng.runScoutIntel('os');
    return r.report;
  }
  const m = raw.match(/^(?:scout|intel)(?:\s+intel)?\s+(.+)$/i);
  if (m) {
    const r = await eng.runScoutIntel(m[1].trim());
    return r.report;
  }
  return '❓ Try `scout help`';
}

export default { tryHandle, isScoutText };
