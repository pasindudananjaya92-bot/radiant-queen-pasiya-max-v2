import * as bm from './brainManager.js';

function clean(text) {
  return String(text || '').replace(/^\//, '').trim();
}

export async function tryHandle(raw) {
  const t = clean(raw);
  if (!t) return null;
  const low = t.toLowerCase();

  if (/^brain\s+help$/i.test(t) || low === 'brain') return bm.helpText();

  if (/^remember\b/i.test(t)) {
    const parsed = bm.parseRemember(t);
    if (!parsed) return 'Usage: remember My Wifi Password is Queen123';
    const row = await bm.remember(parsed);
    return '✅ Saved to Second Brain: ' + row.key_display + ' = ' + row.value;
  }

  if (/^(what\s+is\s+my|what\s+is|what's\s+my|whats\s+my)\b/i.test(t)) {
    const row = await bm.recall(t);
    if (!row) return "I don't have that in Second Brain yet. Say: remember ...";
    const when = String(row.updated_at || row.created_at || '').slice(0, 10);
    return row.key_display + ': ' + row.value + (when ? '\n(You told me on ' + when + ')' : '');
  }

  if (/^forget\b/i.test(t)) {
    const q = t.replace(/^forget\s+/i, '').trim();
    const row = await bm.forget(q);
    if (!row) return 'Nothing to forget for: ' + q;
    return '🗑 Forgot: ' + row.key_display;
  }

  if (/^brain\s+list\b/i.test(t)) {
    const list = await bm.listBrain(20);
    if (!list.length) return 'Second Brain is empty.';
    return (
      '👑 Second Brain (' + list.length + ')\n\n' +
      list
        .map((x) => {
          const val = x.sensitivity === 'secret' ? '***' : String(x.value).slice(0, 60);
          return '• ' + x.key_display + ' = ' + val;
        })
        .join('\n')
    );
  }

  return null;
}

export { tryHandle as tryBrainHandle };
