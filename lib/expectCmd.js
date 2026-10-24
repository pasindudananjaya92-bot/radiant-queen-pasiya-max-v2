/**
 * /expect — PERSISTENT rules (Supabase table first, pasiya_fs backup)
 *
 * Fix: never trust in-memory; every list hits DB.
 * /expect /echo :: must include twin
 * /expect list
 * /expect doctor  — shows where data lives + last error
 */

const ADMIN = () =>
  String(process.env.ADMIN_ID || process.env.FOUNDER_ID || '').trim();

const FS_PATH = '/Documents/architect-expect.json';

async function fsLoad(supabase) {
  if (!supabase) return { rules: [], err: 'no-supabase' };
  try {
    const { data, error } = await supabase
      .from('pasiya_fs')
      .select('content')
      .eq('path', FS_PATH)
      .maybeSingle();
    if (error) return { rules: [], err: 'fs-select: ' + error.message };
    if (!data?.content) return { rules: [], err: null };
    const j = JSON.parse(data.content);
    return { rules: Array.isArray(j.rules) ? j.rules : [], err: null };
  } catch (e) {
    return { rules: [], err: 'fs-load: ' + (e.message || e) };
  }
}

async function fsSave(supabase, rules) {
  if (!supabase) return { ok: false, err: 'no-supabase' };
  const content = JSON.stringify({ rules, updated: Date.now() }, null, 2);
  try {
    const { data: ex, error: selErr } = await supabase
      .from('pasiya_fs')
      .select('id')
      .eq('path', FS_PATH)
      .maybeSingle();
    if (selErr) return { ok: false, err: 'fs-sel: ' + selErr.message };

    if (ex?.id) {
      const { error } = await supabase
        .from('pasiya_fs')
        .update({ content, size: content.length })
        .eq('path', FS_PATH);
      if (error) return { ok: false, err: 'fs-update: ' + error.message };
    } else {
      const { error } = await supabase.from('pasiya_fs').insert({
        path: FS_PATH,
        type: 'file',
        content,
        size: content.length,
      });
      if (error) return { ok: false, err: 'fs-insert: ' + error.message };
    }
    return { ok: true, err: null };
  } catch (e) {
    return { ok: false, err: 'fs-save: ' + (e.message || e) };
  }
}

async function tableAvailable(supabase) {
  if (!supabase) return false;
  try {
    const { error } = await supabase
      .from('rq_expect_rules')
      .select('id')
      .limit(1);
    return !error;
  } catch (_) {
    return false;
  }
}

async function tableList(supabase) {
  const { data, error } = await supabase
    .from('rq_expect_rules')
    .select('id, cmd, kind, value, created_at')
    .order('id', { ascending: true })
    .limit(60);
  if (error) return { rules: [], err: error.message };
  return {
    rules: (data || []).map((r) => ({
      cmd: r.cmd,
      kind: r.kind,
      value: r.value,
      ts: r.created_at,
      id: r.id,
    })),
    err: null,
  };
}

async function tableAdd(supabase, cmd, kind, value) {
  const { data, error } = await supabase
    .from('rq_expect_rules')
    .insert({ cmd, kind, value })
    .select('id')
    .maybeSingle();
  if (error) return { ok: false, err: error.message };
  return { ok: true, id: data?.id };
}

async function tableClear(supabase, cmdOrAll) {
  if (cmdOrAll === 'all') {
    const { error } = await supabase
      .from('rq_expect_rules')
      .delete()
      .neq('id', 0);
    return { ok: !error, err: error?.message };
  }
  const { error } = await supabase
    .from('rq_expect_rules')
    .delete()
    .eq('cmd', cmdOrAll);
  return { ok: !error, err: error?.message };
}

/** Unified load: table preferred, else fs */
async function loadRules(supabase) {
  if (await tableAvailable(supabase)) {
    const t = await tableList(supabase);
    if (!t.err) return { rules: t.rules, source: 'rq_expect_rules', err: null };
    // fall through to fs if table error
    const f = await fsLoad(supabase);
    return { rules: f.rules, source: 'pasiya_fs', err: t.err + (f.err ? ' | ' + f.err : '') };
  }
  const f = await fsLoad(supabase);
  return { rules: f.rules, source: 'pasiya_fs', err: f.err };
}

async function addRule(supabase, cmd, kind, value) {
  if (await tableAvailable(supabase)) {
    const r = await tableAdd(supabase, cmd, kind, value);
    if (r.ok) return { ok: true, source: 'rq_expect_rules', err: null };
    // fallback fs
    const cur = await fsLoad(supabase);
    const rules = cur.rules || [];
    rules.push({ cmd, kind, value, ts: Date.now() });
    const s = await fsSave(supabase, rules.slice(-60));
    return {
      ok: s.ok,
      source: 'pasiya_fs-fallback',
      err: (r.err || '') + (s.err ? ' | ' + s.err : ''),
    };
  }
  const cur = await fsLoad(supabase);
  const rules = cur.rules || [];
  rules.push({ cmd, kind, value, ts: Date.now() });
  const s = await fsSave(supabase, rules.slice(-60));
  return { ok: s.ok, source: 'pasiya_fs', err: s.err };
}

export async function handleExpect({ text, ctx, supabase }) {
  if (String(ctx?.from?.id || '') !== ADMIN()) return '👑 Founder-only.';

  if (!supabase) {
    return '❌ Supabase client missing in bot — cannot persist expect rules.';
  }

  const raw = String(text || '')
    .replace(/^\/expect(@\w+)?\s*/i, '')
    .trim();

  if (!raw || raw === 'help') {
    return (
      '📐 EXPECT (persistent)\n\n' +
      '/expect /echo :: must include twin\n' +
      '/expect /echo :: must not match /how can i help/i\n' +
      '/expect list\n' +
      '/expect doctor\n' +
      '/expect clear /echo\n' +
      '/expect clear all'
    );
  }

  if (raw === 'doctor') {
    const hasTable = await tableAvailable(supabase);
    const loaded = await loadRules(supabase);
    const fs = await fsLoad(supabase);
    return (
      '🩺 EXPECT DOCTOR\n' +
      'supabase: yes\n' +
      'table rq_expect_rules: ' +
      (hasTable ? 'YES' : 'NO — run sql/EXPECT_RULES.sql') +
      '\n' +
      'active source: ' +
      loaded.source +
      '\n' +
      'rules count: ' +
      (loaded.rules?.length || 0) +
      '\n' +
      'fs path: ' +
      FS_PATH +
      '\n' +
      'fs rules: ' +
      (fs.rules?.length || 0) +
      '\n' +
      'last err: ' +
      (loaded.err || fs.err || 'none')
    );
  }

  if (raw === 'list') {
    const loaded = await loadRules(supabase);
    const rules = loaded.rules || [];
    if (!rules.length) {
      return (
        '📐 No expect rules yet.\n' +
        'Source: ' +
        loaded.source +
        (loaded.err ? '\n⚠️ ' + loaded.err : '') +
        '\n\nAdd: /expect /echo :: must include twin\n' +
        'Diag: /expect doctor'
      );
    }
    return (
      '📐 EXPECT RULES (' +
      rules.length +
      ') · ' +
      loaded.source +
      '\n' +
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
    const hasTable = await tableAvailable(supabase);
    if (hasTable) {
      const cmd = target === 'all' ? 'all' : target.startsWith('/') ? target : '/' + target;
      const r = await tableClear(supabase, cmd);
      if (!r.ok) return '❌ Clear failed: ' + r.err;
    }
    // also clear fs copy
    if (target === 'all') {
      await fsSave(supabase, []);
      return '🗑 Cleared all expect rules.';
    }
    const cmd = target.startsWith('/') ? target : '/' + target;
    const cur = await fsLoad(supabase);
    const next = (cur.rules || []).filter(function (r) {
      return r.cmd !== cmd;
    });
    await fsSave(supabase, next);
    return '🗑 Cleared rules for ' + cmd;
  }

  const m = raw.match(
    /^(\/\S+)\s*::\s*(must\s+include|must\s+not\s+match)\s+(.+)$/i
  );
  if (!m) {
    return (
      '❌ Format:\n/expect /echo :: must include twin\n' +
      '/expect /echo :: must not match /how can i help/i'
    );
  }

  const c = m[1];
  const kind = /not/i.test(m[2]) ? 'mustNotMatch' : 'mustInclude';
  const value = m[3].trim();

  const saved = await addRule(supabase, c, kind, value);
  if (!saved.ok) {
    return (
      '❌ Save failed (' +
      (saved.source || '?') +
      '): ' +
      (saved.err || 'unknown') +
      '\nRun /expect doctor\n' +
      'If table missing: run sql/EXPECT_RULES.sql in Supabase'
    );
  }

  // Verify read-back immediately (same invocation proves persistence API works)
  const verify = await loadRules(supabase);
  const found = (verify.rules || []).some(function (r) {
    return r.cmd === c && r.kind === kind && r.value === value;
  });

  return (
    '✅ Expect saved → ' +
    saved.source +
    '\n' +
    c +
    ' · ' +
    kind +
    ' · ' +
    value +
    '\nRead-back: ' +
    (found ? 'OK (' + verify.rules.length + ' rules)' : '⚠️ NOT visible on read — run /expect doctor') +
    '\n\n/expect list'
  );
}

export default { handleExpect };
