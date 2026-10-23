/** Lockdown + lessons storage — no imports from routes */
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
  try {
    const { data: ex } = await supabase.from('pasiya_fs').select('id').eq('path', path).maybeSingle();
    if (ex?.id) await supabase.from('pasiya_fs').update({ content }).eq('path', path);
    else await supabase.from('pasiya_fs').insert({ path, type: 'file', content, size: content.length });
  } catch (_) {}
}

export async function isLocked(supabase, cmd) {
  const lock = await loadJSON(supabase, '/Documents/architect-lockdown.json', { cmds: {} });
  const row = lock.cmds?.[cmd];
  if (!row?.locked) return false;
  if (row.until && Date.now() > row.until) return false;
  return true;
}

export async function setLock(supabase, cmd, locked, reason) {
  const lock = await loadJSON(supabase, '/Documents/architect-lockdown.json', { cmds: {} });
  lock.cmds = lock.cmds || {};
  lock.cmds[cmd] = {
    locked: !!locked,
    reason: reason || '',
    until: locked ? Date.now() + 6 * 3600 * 1000 : 0,
    ts: Date.now(),
  };
  await saveJSON(supabase, '/Documents/architect-lockdown.json', lock);
}

export async function addLesson(supabase, text, meta = {}) {
  const lessons = await loadJSON(supabase, '/Documents/architect-lessons.json', { items: [] });
  lessons.items = lessons.items || [];
  lessons.items.push({ t: Date.now(), text, ...meta });
  if (lessons.items.length > 80) lessons.items = lessons.items.slice(-80);
  await saveJSON(supabase, '/Documents/architect-lessons.json', lessons);
}

export async function loadLessons(supabase) {
  return loadJSON(supabase, '/Documents/architect-lessons.json', { items: [] });
}

export { loadJSON, saveJSON };
export default { isLocked, setLock, addLesson };
