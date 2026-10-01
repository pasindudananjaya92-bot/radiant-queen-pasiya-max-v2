/**
 * lib/memory.js — short per-user chat memory in Supabase
 * Table: rq_ai_memory (user_id, role, content, created_at)
 */
const MAX_TURNS = 8; // pairs roughly

export async function loadMemoryBlock(supabase, userId, limit = MAX_TURNS) {
  if (!supabase || !userId) return '';
  const { data, error } = await supabase
    .from('rq_ai_memory')
    .select('role, content, created_at')
    .eq('user_id', Number(userId))
    .order('created_at', { ascending: false })
    .limit(Math.max(2, Math.min(20, limit * 2)));
  if (error || !data || !data.length) return '';
  // chronological
  const rows = data.slice().reverse();
  return rows
    .map((r) => {
      const role = r.role === 'assistant' ? 'Assistant' : 'User';
      return role + ': ' + String(r.content || '').slice(0, 400);
    })
    .join('\n')
    .slice(0, 2500);
}

export async function saveMemoryTurn(supabase, userId, userText, assistantText) {
  if (!supabase || !userId) return { ok: false, error: 'no db' };
  const uid = Number(userId);
  const rows = [];
  if (userText) rows.push({ user_id: uid, role: 'user', content: String(userText).slice(0, 1500) });
  if (assistantText)
    rows.push({ user_id: uid, role: 'assistant', content: String(assistantText).slice(0, 1500) });
  if (!rows.length) return { ok: false, error: 'empty' };
  const { error } = await supabase.from('rq_ai_memory').insert(rows);
  if (error) return { ok: false, error: error.message };
  // trim old rows (keep last 40 messages)
  try {
    const { data } = await supabase
      .from('rq_ai_memory')
      .select('id')
      .eq('user_id', uid)
      .order('created_at', { ascending: false })
      .range(40, 200);
    if (data && data.length) {
      const ids = data.map((r) => r.id);
      await supabase.from('rq_ai_memory').delete().in('id', ids);
    }
  } catch (_) {}
  return { ok: true };
}

export async function clearMemory(supabase, userId) {
  if (!supabase || !userId) return { ok: false, error: 'no db' };
  const { error } = await supabase.from('rq_ai_memory').delete().eq('user_id', Number(userId));
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export default { loadMemoryBlock, saveMemoryTurn, clearMemory };
