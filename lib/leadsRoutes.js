import * as leads from './leadsManager.js';

function isFounder(ctx) {
  const admin = String(process.env.ADMIN_ID || process.env.FOUNDER_ID || '')
    .split(/[\s,]+/)
    .filter(Boolean);
  const uid = String(ctx?.from?.id || ctx?.message?.from?.id || '');
  if (!admin.length) return true;
  return admin.includes(uid);
}

export async function tryHandle(text = '', ctx = null) {
  const raw = String(text || '').trim().replace(/^\//, '');
  if (!raw || !/^(lead|leads)\b/i.test(raw)) return null;
  if (ctx && !isFounder(ctx)) return '🔒 Founder only.';

  if (/^(lead|leads)(\s+help)?$/i.test(raw)) return leads.leadsHelp();

  let m = raw.match(/^(?:lead|leads)\s+add\s+([\s\S]+)/i);
  if (m) {
    const parts = m[1].split('|').map((s) => s.trim());
    const r = await leads.leadAdd({
      name: parts[0] || '',
      contact: parts[1] || '',
      note: parts[2] || '',
    });
    if (!r.ok) return '❌ Lead: ' + r.error;
    return (
      '✅ Lead saved\n`' +
      String(r.lead.id).slice(0, 8) +
      '` · *' +
      r.lead.name +
      '* · ' +
      r.lead.status
    );
  }

  if (/^(?:lead|leads)\s+list\b/i.test(raw)) {
    const r = await leads.leadList(12);
    if (!r.ok) return '❌ Lead: ' + r.error;
    return leads.formatLeadList(r.rows);
  }

  m = raw.match(/^(?:lead|leads)\s+get\s+([a-f0-9-]{8,})/i);
  if (m) {
    const r = await leads.leadGet(m[1]);
    if (!r.ok) {
      // try prefix match via list
      const all = await leads.leadList(30);
      const hit = (all.rows || []).find((x) => String(x.id).startsWith(m[1]));
      if (!hit) return '❌ Lead: ' + (r.error || 'not found');
      const full = await leads.leadGet(hit.id);
      if (!full.ok) return '❌ Lead: ' + full.error;
      const L = full.lead;
      return [
        '🧲 *' + L.name + '*',
        'Status: ' + L.status,
        L.contact ? 'Contact: ' + L.contact : '',
        L.note ? 'Note:\n' + L.note : '',
        'id: `' + L.id + '`',
      ]
        .filter(Boolean)
        .join('\n');
    }
    const L = r.lead;
    return [
      '🧲 *' + L.name + '*',
      'Status: ' + L.status,
      L.contact ? 'Contact: ' + L.contact : '',
      L.note ? 'Note:\n' + L.note : '',
      'id: `' + L.id + '`',
    ]
      .filter(Boolean)
      .join('\n');
  }

  m = raw.match(/^(?:lead|leads)\s+status\s+([a-f0-9-]{8,})\s*\|\s*(new|warm|won|lost)/i);
  if (m) {
    let id = m[1];
    const all = await leads.leadList(40);
    const hit = (all.rows || []).find((x) => String(x.id).startsWith(id));
    if (hit) id = hit.id;
    const r = await leads.leadSetStatus(id, m[2]);
    if (!r.ok) return '❌ Lead: ' + r.error;
    return '✅ `' + String(r.lead.id).slice(0, 8) + '` → *' + r.lead.status + '*';
  }

  m = raw.match(/^(?:lead|leads)\s+note\s+([a-f0-9-]{8,})\s*\|\s*([\s\S]+)/i);
  if (m) {
    let id = m[1];
    const all = await leads.leadList(40);
    const hit = (all.rows || []).find((x) => String(x.id).startsWith(id));
    if (hit) id = hit.id;
    const r = await leads.leadAddNote(id, m[2]);
    if (!r.ok) return '❌ Lead: ' + r.error;
    return '✅ Note saved on `' + String(r.lead.id).slice(0, 8) + '`';
  }

  return leads.leadsHelp();
}

export default { tryHandle };
