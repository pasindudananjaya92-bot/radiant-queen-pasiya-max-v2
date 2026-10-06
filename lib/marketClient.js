/**
 * lib/marketClient.js — template marketplace (Supabase / settings JSON)
 */
import { createClient } from '@supabase/supabase-js';

function sb() {
  const url = process.env.SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function publishTemplate(userId, name, description, payload) {
  const client = sb();
  const id = Date.now().toString(36);
  const row = {
    id,
    user_id: String(userId),
    name: String(name).slice(0, 80),
    description: String(description || '').slice(0, 500),
    payload: payload || {},
    installs: 0,
    rating_sum: 0,
    rating_count: 0,
    created_at: new Date().toISOString(),
  };
  if (client) {
    try {
      await client.from('rq_templates').upsert(row);
    } catch (_) {}
    await client.from('rq_bot_settings').upsert({
      key: 'tpl_' + id,
      value: JSON.stringify(row),
      updated_at: new Date().toISOString(),
    });
  }
  return { ok: true, id, name: row.name };
}

export async function browseTemplates(limit = 10) {
  const client = sb();
  if (!client) return { ok: true, templates: [] };
  const { data } = await client
    .from('rq_bot_settings')
    .select('value')
    .like('key', 'tpl_%')
    .limit(40);
  const list = [];
  for (const r of data || []) {
    try {
      list.push(JSON.parse(r.value));
    } catch (_) {}
  }
  list.sort((a, b) => (b.installs || 0) - (a.installs || 0));
  return { ok: true, templates: list.slice(0, limit) };
}

export async function installTemplate(userId, id) {
  const client = sb();
  if (!client) return { ok: false, error: 'no db' };
  const { data } = await client
    .from('rq_bot_settings')
    .select('value')
    .eq('key', 'tpl_' + id)
    .maybeSingle();
  if (!data?.value) return { ok: false, error: 'template not found' };
  const tpl = JSON.parse(data.value);
  tpl.installs = (tpl.installs || 0) + 1;
  await client.from('rq_bot_settings').upsert({
    key: 'tpl_' + id,
    value: JSON.stringify(tpl),
    updated_at: new Date().toISOString(),
  });
  await client.from('rq_bot_settings').upsert({
    key: 'install_' + userId + '_' + id,
    value: JSON.stringify({ id, at: new Date().toISOString(), user_id: userId }),
    updated_at: new Date().toISOString(),
  });
  return { ok: true, template: tpl };
}

export default { publishTemplate, browseTemplates, installTemplate };
