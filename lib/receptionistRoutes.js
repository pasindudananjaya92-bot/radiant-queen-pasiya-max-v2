import * as rec from './receptionistEngine.js';

export async function tryHandle(text = '', ctx = null) {
  const raw = String(text || '').trim().replace(/^\//, '');
  if (!raw) return null;
  if (!/^(inbox|receptionist|channel|reception)\b/i.test(raw)) return null;
  if (ctx && !rec.isFounderCtx(ctx)) return '🔒 Founder only.';

  if (/^(inbox|receptionist|reception)(\s+help)?$/i.test(raw)) return rec.receptionistHelp();
  if (/^channel(\s+help)?$/i.test(raw)) return rec.receptionistHelp();

  if (/^inbox\s+list\b/i.test(raw) || /^inbox$/i.test(raw)) {
    const all = /all/i.test(raw);
    const r = await rec.inboxList({ status: all ? 'all' : 'new', limit: 15 });
    if (!r.ok) return '❌ Inbox: ' + r.error;
    return rec.formatInboxList(r.rows);
  }

  let m = raw.match(/^inbox\s+get\s+([a-f0-9-]{8,})/i);
  if (m) {
    const r = await rec.inboxGet(m[1]);
    if (!r.ok) return '❌ Inbox: ' + r.error;
    const it = r.item;
    return [
      '🛎️ *Inbox* `' + String(it.id).slice(0, 8) + '`',
      'From: ' + (it.visitor_name || it.visitor_id || '—'),
      it.contact ? 'Contact: ' + it.contact : '',
      'Status: ' + it.status + ' · ' + it.source,
      '',
      it.message,
      it.draft_reply ? '\n*Draft reply:*\n' + it.draft_reply : '',
    ]
      .filter(Boolean)
      .join('\n');
  }

  m = raw.match(/^inbox\s+(read|archive|replied)\s+([a-f0-9-]{8,})/i);
  if (m) {
    const map = { read: 'read', archive: 'archived', replied: 'replied' };
    const r = await rec.inboxSetStatus(m[2], map[m[1].toLowerCase()]);
    if (!r.ok) return '❌ Inbox: ' + r.error;
    return '✅ Inbox `' + String(r.item.id).slice(0, 8) + '` → ' + r.item.status;
  }

  m = raw.match(/^inbox\s+draft\s+([a-f0-9-]{8,})\s*\|\s*([\s\S]+)/i);
  if (m) {
    const r = await rec.inboxSaveDraft(m[1], m[2]);
    if (!r.ok) return '❌ Inbox: ' + r.error;
    return (
      '✅ Draft saved on `' +
      String(r.item.id).slice(0, 8) +
      '`\n_Not sent to visitor._'
    );
  }

  m = raw.match(/^channel\s+draft\s+([\s\S]+)/i);
  if (m) {
    const r = await rec.channelPost(m[1], { draftOnly: true });
    if (!r.ok) return '❌ Channel: ' + r.error;
    return '📝 *Channel draft*\n\n' + r.text + '\n\n_' + r.note + '_';
  }

  m = raw.match(/^channel\s+post\s+([\s\S]+)/i);
  if (m) {
    const r = await rec.channelPost(m[1], { draftOnly: false });
    if (!r.ok) return '❌ Channel: ' + r.error;
    if (r.draft) return '📝 Draft only\n' + r.text + '\n\n_' + r.note + '_';
    return '✅ Posted to channel · message_id ' + (r.message_id || 'ok');
  }

  return rec.receptionistHelp();
}
export default { tryHandle };
