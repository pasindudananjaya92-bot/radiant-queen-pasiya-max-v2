/**
 * Wave 31A — Queen Leads CRM (draft-safe, free Supabase)
 */
import { createClient } from '@supabase/supabase-js';

export const VERSION = '31A';

function sb() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export function leadsHelp() {
  return [
    '🧲 *Queen Leads · ' + VERSION + '*',
    'Simple CRM for mobile Founder (free Supabase)',
    '',
    '• `lead add Name | contact | note`',
    '• `lead list` — recent leads',
    '• `lead get <id>`',
    '• `lead status <id> | new|warm|won|lost`',
    '• `lead note <id> | text`',
    '• `lead help`',
    '',
    '_No auto messages to clients. Founder-only._',
  ].join('\n');
}

export async function leadAdd({ name, contact, note }) {
  const client = sb();
  if (!client) return { ok: false, error: 'Supabase not configured' };
  const row = {
    name: String(name || '').trim().slice(0, 120) || 'Unknown',
    contact: String(contact || '').trim().slice(0, 200),
    note: String(note || '').trim().slice(0, 500),
    status: 'new',
  };
  const { data, error } = await client.from('rq_leads').insert(row).select('id,name,status').single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, lead: data };
}

export async function leadList(limit = 10) {
  const client = sb();
  if (!client) return { ok: false, error: 'Supabase not configured' };
  const { data, error } = await client
    .from('rq_leads')
    .select('id,name,contact,note,status,created_at')
    .order('created_at', { ascending: false })
    .limit(Math.min(30, limit));
  if (error) return { ok: false, error: error.message };
  return { ok: true, rows: data || [] };
}

export async function leadGet(id) {
  const client = sb();
  if (!client) return { ok: false, error: 'Supabase not configured' };
  const { data, error } = await client
    .from('rq_leads')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: 'not found' };
  return { ok: true, lead: data };
}

export async function leadSetStatus(id, status) {
  const client = sb();
  if (!client) return { ok: false, error: 'Supabase not configured' };
  const st = String(status || '').toLowerCase();
  if (!['new', 'warm', 'won', 'lost'].includes(st)) {
    return { ok: false, error: 'status must be new|warm|won|lost' };
  }
  const { data, error } = await client
    .from('rq_leads')
    .update({ status: st, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('id,name,status')
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, lead: data };
}

export async function leadAddNote(id, note) {
  const client = sb();
  if (!client) return { ok: false, error: 'Supabase not configured' };
  const prev = await leadGet(id);
  if (!prev.ok) return prev;
  const merged = [prev.lead.note || '', String(note || '').trim()]
    .filter(Boolean)
    .join('\n—\n')
    .slice(0, 1500);
  const { data, error } = await client
    .from('rq_leads')
    .update({ note: merged, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('id,name,note')
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, lead: data };
}

export function formatLeadList(rows) {
  if (!rows?.length) return '🧲 No leads yet. `lead add Name | TG/@handle | note`';
  const lines = ['🧲 *Leads* (' + rows.length + ')', ''];
  for (const r of rows) {
    const short = String(r.id).slice(0, 8);
    lines.push(
      '· `' +
        short +
        '` *' +
        (r.name || '') +
        '* · ' +
        (r.status || 'new') +
        (r.contact ? ' · ' + r.contact : '')
    );
  }
  lines.push('', '_`lead get <id>` · `lead status <id> | warm`_');
  return lines.join('\n');
}

export default {
  VERSION,
  leadsHelp,
  leadAdd,
  leadList,
  leadGet,
  leadSetStatus,
  leadAddNote,
  formatLeadList,
};
