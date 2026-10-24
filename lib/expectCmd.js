/**
 * /expect — live contract trainer (stable, no external AI)
 *
 * /expect /echo :: must include twin
 * /expect /echo :: must not match /how can i help/i
 * /expect list
 * /expect clear /echo
 * /expect clear all
 */
async function loadJSON(supabase, path, fb) {
  if (!supabase) return fb;
  try {
    const { data } = await supabase
      .from('pasiya_fs')
      .select('content')
      .eq('path', path)
      .maybeSingle();
    if (data?.content) return JSON.parse(data.content);
  } catch (_) {}
  return fb;
}

async function saveJSON(supabase, path, obj) {
  if (!supabase) return false;
  const content = JSON.stringify(obj, null, 2);
  try {
    const { data: ex } = await supabase
      .from('pasiya_fs')
      .select('id')
      .eq('path', path)
      .maybeSingle();
    if (ex?.id) {
      await supabase.from('pasiya_fs').update({ content }).eq('path', path);
    } else {
      await supabase.from('pasiya_fs').insert({
        path,
        type: 'file',
        content,
        size: content.length,
      });
    }
    return true;
  } catch (e) {
    return false;
  }
}

const ADMIN = () =>
  String(process.env.ADMIN_ID || process.env.FOUNDER_ID || '').trim();

export async function handleExpect({ text, ctx, supabase }) {
  if (String(ctx?.from?.id || '') !== ADMIN()) {
    return '👑 Founder-only.';
  }

  const raw = String(text || '')
    .replace(/^\/expect(@\w+)?\s*/i, '')
    .trim();

  if (!raw || raw === 'help') {
    return (
      '📐 EXPECT — live contracts\n\n' +
      'Add:\n' +
      '/expect /echo :: must include twin\n' +
      '/expect /echo :: must not match /how can i help/i\n\n' +
      'List: /expect list\n' +
      'Clear: /expect clear /echo\n' +
      'Clear all: /expect clear all\n\n' +
      'Then: /architect retest /echo'
    );
  }

  if (raw === 'list') {
    const db = await loadJSON(supabase, '/Documents/architect-expect.json', {
      rules: [],
    });
    const rules = Array.isArray(db.rules) ? db.rules : [];
    if (!rules.length) {
      return '📐 No custom expect rules yet.\nAdd one:\n/expect /echo :: must include twin';
    }
    return (
      '📐 EXPECT RULES (' +
      rules.length +
      ')\n' +
      rules
        .slice(-25)
        .map(function (r, i) {
          return i + 1 + '. ' + r.cmd + ' · ' + r.kind + ' · ' + r.value;
        })
        .join('\n')
    );
  }

  if (raw.startsWith('clear ')) {
    const target = raw.slice(6).trim();
    const db = await loadJSON(supabase, '/Documents/architect-expect.json', {
      rules: [],
    });
    if (target === 'all') {
      db.rules = [];
      await saveJSON(supabase, '/Documents/architect-expect.json', db);
      return '🗑 All expect rules cleared.';
    }
    var cmd = target.startsWith('/') ? target : '/' + target;
    db.rules = (db.rules || []).filter(function (r) {
      return r.cmd !== cmd;
    });
    await saveJSON(supabase, '/Documents/architect-expect.json', db);
    return '🗑 Cleared rules for ' + cmd;
  }

  var m = raw.match(
    /^(\/\S+)\s*::\s*(must\s+include|must\s+not\s+match)\s+(.+)$/i
  );
  if (!m) {
    return (
      '❌ Format:\n/expect /echo :: must include twin\n' +
      '/expect /echo :: must not match /how can i help/i'
    );
  }

  var c = m[1];
  var kind = /not/i.test(m[2]) ? 'mustNotMatch' : 'mustInclude';
  var value = m[3].trim();
  var db2 = await loadJSON(supabase, '/Documents/architect-expect.json', {
    rules: [],
  });
  db2.rules = db2.rules || [];
  db2.rules.push({ cmd: c, kind: kind, value: value, ts: Date.now() });
  if (db2.rules.length > 60) db2.rules = db2.rules.slice(-60);
  var saved = await saveJSON(
    supabase,
    '/Documents/architect-expect.json',
    db2
  );
  if (!saved) {
    return '❌ Failed to save rule (pasiya_fs / Supabase). Check DB.';
  }
  return (
    '✅ Expect saved\n' +
    c +
    ' · ' +
    kind +
    ' · ' +
    value +
    '\n\n/expect list\n/architect retest ' +
    c
  );
}

export default { handleExpect };
