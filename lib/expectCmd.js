/**
 * /expect — live contract trainer for Omniscient Architect
 * /expect /echo :: must not match /how can i help/i
 * /expect /echo :: must include twin
 * Saves to /Documents/architect-expect.json
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

const ADMIN = () => String(process.env.ADMIN_ID || '').trim();

export async function handleExpect({ text, ctx, supabase }) {
  if (String(ctx?.from?.id || '') !== ADMIN()) return '👑 Founder-only.';
  const raw = String(text || '').replace(/^\/expect(@\w+)?\s*/i, '').trim();
  if (!raw || raw === 'help' || raw === 'list') {
    const db = await loadJSON(supabase, '/Documents/architect-expect.json', { rules: [] });
    const lines = (db.rules || []).slice(-15).map((r, i) => i + 1 + '. ' + r.cmd + ' · ' + r.kind + ' · ' + r.value);
    return (
      '📐 EXPECT (live contracts)\n' +
      '/expect /echo :: must include twin\n' +
      '/expect /echo :: must not match /how can i help/i\n' +
      '/expect list\n\n' +
      (lines.length ? lines.join('\n') : 'No custom rules yet.')
    );
  }
  // /expect /cmd :: must include X  OR  must not match /regex/
  const m = raw.match(/^(\/\S+)\s*::\s*(must\s+include|must\s+not\s+match)\s+(.+)$/i);
  if (!m) return 'Format: /expect /echo :: must include twin';
  const cmd = m[1];
  const kind = /not/i.test(m[2]) ? 'mustNotMatch' : 'mustInclude';
  const value = m[3].trim();
  const db = await loadJSON(supabase, '/Documents/architect-expect.json', { rules: [] });
  db.rules = db.rules || [];
  db.rules.push({ cmd, kind, value, ts: Date.now() });
  if (db.rules.length > 50) db.rules = db.rules.slice(-50);
  await saveJSON(supabase, '/Documents/architect-expect.json', db);
  return '✅ Expect saved: ' + cmd + ' · ' + kind + ' · ' + value + '\nUsed on next /architect retest ' + cmd;
}

export default { handleExpect };
