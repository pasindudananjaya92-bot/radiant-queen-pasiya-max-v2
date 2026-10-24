/**
 * /expect — live contract trainer
 *
 * Correct usage:
 *   /expect /echo :: must include twin
 *   /expect /echo :: must not match /how can i help/i
 *   /expect list
 *   /expect clear /echo
 */
async function loadJSON(supabase, path, fb) {
  if (!supabase) return fb;
  try {
    const { data } = await supabase.from('pasiya_fs').select('content').eq('path', path).maybeSingle();
    if (data?.content) return JSON.parse(data.content);
  } catch (_) {}
  return fb;
}
async function saveJSON(supabase, path, obj) {
  if (!supabase) return;
  const content = JSON.stringify(obj, null, 2);
  const { data: ex } = await supabase.from('pasiya_fs').select('id').eq('path', path).maybeSingle();
  if (ex?.id) await supabase.from('pasiya_fs').update({ content }).eq('path', path);
  else await supabase.from('pasiya_fs').insert({ path, type: 'file', content, size: content.length });
}

const ADMIN = () => String(process.env.ADMIN_ID || process.env.FOUNDER_ID || '').trim();

export async function handleExpect({ text, ctx, supabase }) {
  if (String(ctx?.from?.id || '') !== ADMIN()) return '👑 Founder-only.';
  const raw = String(text || '').replace(/^\/expect(@\w+)?\s*/i, '').trim();

  if (!raw || raw === 'help') {
    return (
      '📐 EXPECT — live contracts for Architect retest\n\n' +
      'Add rule:\n' +
      '/expect /echo :: must include twin\n' +
      '/expect /echo :: must not match /how can i help/i\n\n' +
      'List: /expect list\n' +
      'Clear one: /expect clear /echo\n' +
      'Clear all: /expect clear all\n\n' +
      'Then: /architect retest /echo'
    );
  }

  if (raw === 'list') {
    const db = await loadJSON(supabase, '/Documents/architect-expect.json', { rules: [] });
    const rules = db.rules || [];
    if (!rules.length) return '📐 No custom expect rules yet.';
    return (
      '📐 EXPECT RULES\n' +
      rules
        .slice(-20)
        .map((r, i) => i + 1 + '. ' + r.cmd + ' · ' + r.kind + ' · ' + r.value)
        .join('\n')
    );
  }

  if (raw.startsWith('clear ')) {
    const target = raw.slice(6).trim();
    const db = await loadJSON(supabase, '/Documents/architect-expect.json', { rules: [] });
    if (target === 'all') {
      db.rules = [];
      await saveJSON(supabase, '/Documents/architect-expect.json', db);
      return '🗑 All expect rules cleared.';
    }
    const cmd = target.startsWith('/') ? target : '/' + target;
    db.rules = (db.rules || []).filter((r) => r.cmd !== cmd);
    await saveJSON(supabase, '/Documents/architect-expect.json', db);
    return '🗑 Cleared rules for ' + cmd;
  }

  // /expect /cmd :: must include X | must not match /re/
  const m = raw.match(/^(\/\S+)\s*::\s*(must\s+include|must\s+not\s+match)\s+(.+)$/i);
  if (!m) {
    return (
      '❌ Format:\n/expect /echo :: must include twin\n' +
      '/expect /echo :: must not match /how can i help/i\n\n' +
      'Got: ' +
      raw.slice(0, 120)
    );
  }
  const cmd = m[1];
  const kind = /not/i.test(m[2]) ? 'mustNotMatch' : 'mustInclude';
  const value = m[3].trim();
  const db = await loadJSON(supabase, '/Documents/architect-expect.json', { rules: [] });
  db.rules = db.rules || [];
  db.rules.push({ cmd, kind, value, ts: Date.now() });
  if (db.rules.length > 60) db.rules = db.rules.slice(-60);
  await saveJSON(supabase, '/Documents/architect-expect.json', db);
  return (
    '✅ Expect saved\n' +
    cmd +
    ' · ' +
    kind +
    ' · ' +
    value +
    '\n\nTest: /architect retest ' +
    cmd
  );
}

export default { handleExpect };
