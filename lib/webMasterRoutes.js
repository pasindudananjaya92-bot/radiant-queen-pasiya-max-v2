
function isFounder(ctx) {
  const admin = String(process.env.ADMIN_ID || process.env.FOUNDER_ID || '')
    .split(/[\s,]+/)
    .filter(Boolean);
  const uid = String(ctx?.from?.id || ctx?.message?.from?.id || '');
  if (!admin.length) return true;
  return admin.includes(uid);
}

export function isSiteText(text = '') {
  const t = String(text || '').trim().replace(/^\//, '');
  return /^(site|webmaster|webmaster)\b/i.test(t);
}

export async function tryHandle(text = '', ctx = null) {
  const raw = String(text || '').trim().replace(/^\//, '');
  if (!raw || !isSiteText(raw)) return null;
  if (ctx && !isFounder(ctx)) return '🔒 Founder only.';

  const wm = await import('./webMaster.js');
  const lower = raw.toLowerCase();

  if (/^(site|webmaster|webmaster)(\s+help)?$/i.test(lower)) return wm.siteHelp();

  if (/^site\s+list$/i.test(lower)) {
    const r = await wm.listSections();
    if (!r.ok) return '❌ ' + (r.error || 'list fail');
    return wm.formatList(r.rows);
  }

  const get = raw.match(/^site\s+get\s+(\w+)$/i);
  if (get) {
    const r = await wm.getSection(get[1]);
    if (!r.ok) return '❌ ' + (r.error || 'not found');
    const c = String(r.row.content || '');
    return (
      '📄 `' +
      r.row.section +
      '` v' +
      (r.row.version || 1) +
      (r.row.published === false ? ' (unpublished)' : '') +
      '\n' +
      c.slice(0, 2800) +
      (c.length > 2800 ? '\n…' : '')
    );
  }

  const upd = raw.match(/^site\s+update\s+([^|]+)\|([\s\S]+)$/i);
  if (upd) {
    const r = await wm.updateSection({ section: upd[1].trim(), content: upd[2].trim() });
    if (!r.ok) return '❌ ' + (r.error || 'update fail');
    return '✅ Updated `' + r.row.section + '` v' + r.row.version + ' (revision saved)';
  }

  const gen = raw.match(/^site\s+generate\s+([^|]+)\|([\s\S]+)$/i);
  if (gen) {
    const r = await wm.generateSection(gen[1].trim(), gen[2].trim());
    if (!r.ok) return '❌ ' + (r.error || 'generate fail');
    return '✨ Generated + saved `' + r.row.section + '` v' + r.row.version + '\nPreview:\n' + String(r.row.content).slice(0, 1200);
  }

  // site generate home  (brief optional)
  const gen2 = raw.match(/^site\s+generate\s+(\w+)(?:\s+([\s\S]+))?$/i);
  if (gen2 && !/update|get|list|audit|publish/i.test(gen2[1])) {
    const r = await wm.generateSection(gen2[1], gen2[2] || '');
    if (!r.ok) return '❌ ' + (r.error || 'generate fail');
    return '✨ Generated + saved `' + r.row.section + '` v' + r.row.version;
  }

  if (/^site\s+audit$/i.test(lower)) {
    return wm.formatAudit(await wm.auditSite());
  }

  const pub = raw.match(/^site\s+publish\s+(\w+)$/i);
  if (pub) {
    const r = await wm.setPublished(pub[1], true);
    return r.ok ? '✅ Published `' + pub[1] + '`' : '❌ ' + r.error;
  }
  const unp = raw.match(/^site\s+unpublish\s+(\w+)$/i);
  if (unp) {
    const r = await wm.setPublished(unp[1], false);
    return r.ok ? '⏸ Unpublished `' + unp[1] + '`' : '❌ ' + r.error;
  }

  return '❓ Try `site help`';
}

export default { tryHandle, isSiteText };
