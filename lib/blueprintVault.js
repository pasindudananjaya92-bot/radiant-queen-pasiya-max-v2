/**
 * Wave 41B — Blueprint Vault
 * Draft-only storage. GODMODEAUTO OFF. Never auto-publishes.
 */
export const VERSION = '41B';

async function sb() {
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
    if (!url || !key) return null;
    return createClient(url, key);
  } catch (_) {
    return null;
  }
}

export async function saveBlueprint({ title, goal, notes, userId }) {
  const id = 'bp_' + Date.now().toString(36);
  const row = {
    id,
    title: String(title || 'Untitled').trim().slice(0, 120),
    goal: String(goal || '').trim().slice(0, 2000),
    notes: String(notes || '').trim().slice(0, 1000) || null,
    status: 'draft',
    user_id: userId ? String(userId) : null,
    created_at: new Date().toISOString(),
  };

  const client = await sb();
  if (client) {
    try {
      const { error } = await client.from('queen_blueprints').insert({
        id: row.id,
        title: row.title,
        goal: row.goal,
        notes: row.notes,
        status: row.status,
        user_id: row.user_id,
        created_at: row.created_at,
      });
      if (!error) {
        return { ok: true, persisted: true, ...row };
      }
      row._db = String(error.message || error).slice(0, 120);
    } catch (e) {
      row._db = String(e.message || e).slice(0, 120);
    }
  }

  return { ok: true, persisted: false, ...row };
}

export async function listBlueprints({ limit = 8 } = {}) {
  const client = await sb();
  if (!client) {
    return { ok: true, items: [], note: 'Supabase not configured' };
  }
  try {
    const { data, error } = await client
      .from('queen_blueprints')
      .select('id,title,goal,status,created_at')
      .order('created_at', { ascending: false })
      .limit(Math.min(Math.max(limit, 1), 20));
    if (error) {
      return {
        ok: true,
        items: [],
        note:
          'Table queen_blueprints missing — run sql/001_queen_blueprints.sql once. Drafts still work.',
        error: String(error.message || error).slice(0, 150),
      };
    }
    return { ok: true, items: data || [] };
  } catch (e) {
    return { ok: false, items: [], error: String(e.message || e).slice(0, 150) };
  }
}

export async function getBlueprint(id) {
  const client = await sb();
  if (!client || !id) return null;
  try {
    const { data, error } = await client
      .from('queen_blueprints')
      .select('*')
      .eq('id', String(id).trim())
      .maybeSingle();
    if (error || !data) return null;
    return data;
  } catch (_) {
    return null;
  }
}

export function formatList(items, note) {
  const lines = ['Blueprint Vault · ' + VERSION, ''];
  if (!items || !items.length) {
    lines.push('No saved blueprints yet.');
    if (note) lines.push(note);
    lines.push('', 'Create: create blueprint <title>');
    return lines.join('\n');
  }
  for (const r of items) {
    const t = String(r.title || 'Untitled').slice(0, 40);
    const id = r.id || '?';
    const st = r.status || 'draft';
    lines.push('- ' + id + ' | ' + t + ' | ' + st);
  }
  lines.push('', 'Show: show blueprint bp_xxx', 'Draft only · GODMODEAUTO OFF');
  if (note) lines.push(note);
  return lines.join('\n');
}

export function formatOne(row) {
  if (!row) return 'Blueprint not found. Create one or run SQL so list/show can persist.';
  return [
    'Blueprint · ' + (row.id || ''),
    'Title: ' + (row.title || 'Untitled'),
    'Goal: ' + String(row.goal || '-').slice(0, 800),
    row.notes ? 'Notes: ' + String(row.notes).slice(0, 400) : null,
    'Status: ' + (row.status || 'draft'),
    row.created_at ? 'Created: ' + row.created_at : null,
    '',
    'Draft only · not published · GODMODEAUTO OFF',
  ]
    .filter(Boolean)
    .join('\n');
}
