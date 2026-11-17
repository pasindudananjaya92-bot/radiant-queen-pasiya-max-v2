
function isFounder(ctx) {
  const admin = String(process.env.ADMIN_ID || process.env.FOUNDER_ID || '')
    .split(/[\s,]+/)
    .filter(Boolean);
  const uid = String(ctx?.from?.id || ctx?.message?.from?.id || '');
  if (!admin.length) return true;
  return admin.includes(uid);
}

export function isSiteText(text = '') {
  return /^(site|webmaster)\b/i.test(String(text || '').trim().replace(/^\//, ''));
}

export async function tryHandle(text = '', ctx = null) {
  const raw = String(text || '').trim().replace(/^\//, '');
  if (!raw || !isSiteText(raw)) return null;
  if (ctx && !isFounder(ctx)) return '🔒 Founder only.';

  const wm = await import('./webMaster.js');
  const lower = raw.toLowerCase();

  if (/^(site|webmaster)(\s+help)?$/i.test(lower)) return wm.siteHelp();
  if (/^site\s+list$/i.test(lower)) return wm.formatList(await wm.listSections());

  let m = raw.match(/^site\s+get\s+(\w+)/i);
  if (m) {
    const row = await wm.getSection(m[1]);
    if (!row) return '❌ Section not found: ' + m[1];
    const html = String(row.html || '').slice(0, 1200);
    return `*${row.section}* v${row.version}\n${html}`;
  }

  m = raw.match(/^site\s+update\s+(\w+)\s*\|\s*([\s\S]+)/i);
  if (m) {
    const saved = await wm.updateSection(m[1], m[2].trim());
    return `✅ Updated *${saved.section}* v${saved.version}`;
  }

  m = raw.match(/^site\s+generate\s+(\w+)\s*\|\s*([\s\S]+)/i);
  if (m) {
    const saved = await wm.generateSection(m[1], m[2].trim());
    return `✅ Generated *${saved.section}* v${saved.version}\n_Refresh site to see._`;
  }

  if (/^site\s+audit$/i.test(lower)) return wm.formatAudit(await wm.auditSite());
  if (/^site\s+polish$/i.test(lower)) {
    const r = await wm.polishSite();
    return `✨ Polished styles + published flags · sections ${r.sections}`;
  }

  m = raw.match(/^site\s+publish\s+(\w+)/i);
  if (m) {
    await wm.setPublished(m[1], true);
    return `✅ Published *${m[1]}*`;
  }
  m = raw.match(/^site\s+unpublish\s+(\w+)/i);
  if (m) {
    await wm.setPublished(m[1], false);
    return `⏸ Unpublished *${m[1]}*`;
  }

  return wm.siteHelp();
}

export default { tryHandle, isSiteText };
