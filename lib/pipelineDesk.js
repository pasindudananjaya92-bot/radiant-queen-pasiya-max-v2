/**
 * Setup-2 · Inbox → Lead → Twin one-shot (draft-safe)
 */
export const VERSION = '37A-S2';

function short(id) {
  return String(id || '').slice(0, 8);
}

/**
 * @param {string} inboxId
 * @param {object} ctx
 */
export async function deskReply(inboxId, ctx = {}) {
  const rec = await import('./receptionistEngine.js');
  const leads = await import('./leadsManager.js');
  let twin = null;
  try {
    twin = await import('./twinEngine.js');
  } catch {
    twin = null;
  }

  const got = await rec.inboxGet(inboxId);
  if (!got.ok) return { ok: false, error: got.error || 'inbox not found' };
  const item = got.item;
  const msg = String(item.message || '').trim();
  const name = item.visitor_name || item.visitor_id || 'Visitor';
  const contact = item.contact || String(item.visitor_id || '');

  // 1) Lead upsert-ish: add lead with note
  let leadId = null;
  let leadLine = '—';
  try {
    const add = await leads.leadAdd({
      name: String(name).slice(0, 120),
      contact: String(contact).slice(0, 120),
      note: 'From inbox ' + short(item.id) + ': ' + msg.slice(0, 200),
    });
    if (add.ok && add.id) {
      leadId = add.id;
      await leads.leadSetStatus(leadId, 'warm').catch(() => {});
      leadLine = 'Lead `' + short(leadId) + '` · warm';
    } else {
      leadLine = 'Lead: ' + (add.error || 'skip');
    }
  } catch (e) {
    leadLine = 'Lead: ' + (e.message || 'skip');
  }

  // 2) Twin draft (never auto-send)
  let twinLine = 'Twin: module missing';
  let draftText = '';
  let twinId = null;
  if (twin && typeof twin.createDraft === 'function') {
    try {
      const d = await twin.createDraft({
        inbound: msg || ('Reply to ' + name),
        channel: 'telegram',
        from_label: name,
      });
      draftText = d.draft || d.text || '';
      twinId = d.id;
      if (draftText && typeof rec.inboxSaveDraft === 'function') {
        await rec.inboxSaveDraft(item.id, draftText).catch(() => {});
      }
      twinLine = twinId
        ? 'Twin draft `' + short(twinId) + '` (not sent)'
        : 'Twin draft offline/local (not sent)';
    } catch (e) {
      twinLine = 'Twin: ' + (e.message || 'fail');
    }
  }

  // 3) Mark inbox read (not replied until Founder sends)
  try {
    await rec.inboxSetStatus(item.id, 'read');
  } catch (_) {}

  // Optional Decisions gate (soft)
  let decideLine = '';
  try {
    const dec = await import('./decisionsManager.js');
    if (dec && typeof dec.decideCheck === 'function') {
      const c = await dec.decideCheck(msg);
      if (c && c.ok !== false) {
        decideLine =
          'Decide: money=' +
          (c.money_risk || c.moneyrisk || '?') +
          ' · founder=' +
          (c.needs_founder || c.needsfounder || '?');
      }
    }
  } catch (_) {}

  const lines = [
    '🛎️ *Desk Reply · ' + VERSION + '*',
    'Inbox `' + short(item.id) + '` · ' + name,
    leadLine,
    twinLine,
    decideLine,
    '',
    '*Visitor message:*',
    msg.slice(0, 800) || '—',
    '',
    draftText ? '*Suggested reply (DRAFT only):*\n' + String(draftText).slice(0, 1200) : '_No twin draft text_',
    '',
    '_Not sent to visitor. Approve / edit then reply manually._',
  ].filter(Boolean);

  return { ok: true, text: lines.join('\n'), leadId, twinId, inboxId: item.id };
}

export function deskHelp() {
  return [
    '🛎️ *Pipeline Desk · ' + VERSION + '*',
    'Inbox → Lead → Twin (draft-safe)',
    '',
    '• `desk help`',
    '• `desk reply <inboxId>` — one-shot pipeline',
    '• `inbox reply <inboxId>` — same',
    '',
    'Also: `inbox list` · `lead list` · `twin drafts`',
    'Never auto-sends to visitors. Founder approve only.',
  ].join('\n');
}
