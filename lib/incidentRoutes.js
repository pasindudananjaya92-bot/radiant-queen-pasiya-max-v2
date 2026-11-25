import * as inc from './incidentCommander.js';

export async function tryIncidentHandle(text) {
  const raw = String(text || '').trim().replace(/^\//, '');
  const lower = raw.toLowerCase();
  if (!/^(incident|inc)(\s|$)/i.test(lower)) return null;

  let rest = raw;
  if (/^incident\b/i.test(rest)) rest = rest.slice(8).trim();
  else if (/^inc\b/i.test(rest)) rest = rest.slice(3).trim();

  const parts = rest.split('|').map((s) => s.trim());
  const head = (parts[0] || '').toLowerCase();
  const cmd = (head.split(/\s+/)[0] || 'scan').toLowerCase();

  if (!rest || cmd === 'help' || cmd === '?') return inc.helpText();

  if (cmd === 'scan' || cmd === 'status' || cmd === 'check') {
    const r = await inc.scanIncidents();
    return inc.formatScan(r);
  }

  if (cmd === 'ticket' || cmd === 'issue') {
    const customTitle = parts[1] || head.replace(/^(ticket|issue)\s*/i, '').trim();
    const r = await inc.openTicket(customTitle || null, null);
    if (r && r.ok !== false && (r.url || r.html_url || r.number)) {
      return ('✅ Incident ticket opened' + (r.number ? ' #' + r.number : '') + '\n' + (r.html_url || r.url || '')).trim();
    }
    return '❌ Ticket failed: ' + (r?.error || 'unknown') + '\nTry: `gops open Title | body`';
  }

  return inc.helpText();
}

export async function tryHandle(text, ctx) {
  return tryIncidentHandle(text);
}

export default { tryIncidentHandle, tryHandle };
