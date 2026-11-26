import * as eng from './webLeadEngine.js';

function shortId(id) {
  return String(id || '').slice(0, 8);
}

export async function tryHandle(text, ctx) {
  const raw = String(text || '').trim().replace(/^\//, '');
  if (!/^(funnel|weblead|botbuilder)\b/i.test(raw)) return null;

  const rest = raw.replace(/^(funnel|weblead|botbuilder)\s*/i, '').trim();
  const parts = rest.split('|').map((s) => s.trim());
  const head = (parts[0] || '').toLowerCase();
  const cmd = (head.split(/\s+/)[0] || '').toLowerCase();

  if (!rest || cmd === 'help' || cmd === '?') return eng.helpText();

  if (cmd === 'seed') {
    const r = await eng.seedFunnelSections();
    return (
      '🌱 Funnel sections seeded\n' +
      (r.results || []).join('\n') +
      '\nHard-refresh site. Form posts to /api/site?action=lead'
    );
  }

  if (cmd === 'status' || cmd === 'list') {
    try {
      const leads = await import('./leadsManager.js');
      const list = await leads.leadList(10);
      if (!list.ok) return '❌ ' + (list.error || 'list fail');
      const rows = list.rows || [];
      if (!rows.length) return 'No leads yet. Submit the website form once.';
      const lines = rows.map((r, i) => {
        const src = r.source || (String(r.note || '').includes('website') ? 'web' : 'tg');
        return (
          i +
          1 +
          '. ' +
          shortId(r.id) +
          ' · ' +
          (r.name || '?') +
          ' · ' +
          (r.status || 'new') +
          ' · ' +
          src
        );
      });
      return '🧲 *Web/CRM leads*\n' + lines.join('\n');
    } catch (e) {
      return '❌ ' + (e.message || e);
    }
  }

  if (cmd === 'follow' || cmd === 'followups') {
    const idPart = head.split(/\s+/)[1] || parts[1] || '';
    if (idPart && idPart.length >= 6) {
      try {
        const leads = await import('./leadsManager.js');
        // resolve by prefix
        const list = await leads.leadList(30);
        const row = (list.rows || []).find((r) => String(r.id).startsWith(idPart));
        if (!row) return 'Lead not found: ' + idPart;
        const d = await eng.draftFollowUp(row);
        return (
          '📝 *Follow-up draft* · ' +
          shortId(row.id) +
          '\n' +
          (row.name || '') +
          '\n\n' +
          d.text +
          '\n\n_Draft only — send manually._'
        );
      } catch (e) {
        return '❌ ' + (e.message || e);
      }
    }
    const stale = await eng.listStaleLeads(24);
    if (!stale.ok) return '❌ ' + (stale.error || 'stale fail');
    if (!stale.rows.length) return '✅ No stale leads (>24h new/warm).';
    const blocks = [];
    for (const row of stale.rows.slice(0, 5)) {
      const d = await eng.draftFollowUp(row);
      blocks.push(
        '· ' + shortId(row.id) + ' ' + (row.name || '?') + '\n' + String(d.text).slice(0, 280)
      );
    }
    return (
      '⏰ *Stale leads · drafts only*\n\n' +
      blocks.join('\n\n---\n\n') +
      '\n\n_Not sent. Founder sends if wanted._'
    );
  }

  return eng.helpText();
}

export default { tryHandle };
