/**
 * Wave 25A — Founder Digital Twin (SAFE)
 * Drafts only. Reads queen-twin preset when present.
 */
import { createClient } from '@supabase/supabase-js';

function sb() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

const DEFAULT_STYLE = {
  language: 'Sinhala + English mix, Founder tone',
  tone: 'direct, mobile-first, no fluff, high agency',
  money_rule: 'Never move money or send invoice without Founder approve',
  code_rule: 'Never git push without Founder/Grok ZIP path',
  business: 'Queen OS / automation / bot systems for mobile founders',
};

export function twinHelp() {
  return [
    '*GOD-MODE Twin · 26B*',
    'Digital Twin = *drafts only* (no auto-TG to friends)',
    '',
    '• god help — menu',
    '• twin style · twin teach <key> | <value>',
    '• twin draft <message> · twin drafts',
    '• twin approve <id> / twin reject <id>',
    '',
    '*Web Guidance*',
    '• web guide list · web guide <topic> · web check · web baseline',
    '',
    '*Presets*',
    '• preset list · preset show <name> · preset set <name> <key> <value>',
    '',
    '*Empire*',
    '• empire status · empire bank · empire invoice · empire invoices',
    '',
    '*Swarm / Deal*',
    '• swarm spawn <role> · gswarm spawn · swarm units',
    '• deal create Client | amount | desc | message · deal list',
    '',
    '*Queen Pulse*',
    '• queen pulse · queen status · queen help',
    '• site sync pricing — Deal to Site bridge (publish separate)',
    '',
    '_Deploy budget: batch uploads · Hobby ~100/day_',
    '_GODMODE_AUTO=OFF · Social + live customer TG = later_',
  ].join('\n');
}

export async function listStyle() {
  const map = { ...DEFAULT_STYLE };
  try {
    const pm = await import('./presetManager.js');
    const p = await pm.getPreset('queen-twin');
    Object.assign(map, p.settings || {});
  } catch (_) {}
  const client = sb();
  if (!client) return map;
  const { data } = await client.from('rq_twin_style').select('key,value').limit(50);
  for (const row of data || []) map[row.key] = row.value;
  return map;
}

export async function teachStyle(key, value) {
  const client = sb();
  const k = String(key || '').trim().slice(0, 64);
  const v = String(value || '').trim().slice(0, 2000);
  if (!k || !v) return { ok: false, error: 'key|value required' };
  if (!client) return { ok: false, error: 'no supabase' };
  const { error } = await client.from('rq_twin_style').upsert(
    { key: k, value: v, source: 'founder', created_at: new Date().toISOString() },
    { onConflict: 'key' }
  );
  if (error) return { ok: false, error: error.message };
  // mirror into preset for ZIP-less tone changes
  try {
    const pm = await import('./presetManager.js');
    await pm.setPresetValue('queen-twin', k, v);
  } catch (_) {}
  return { ok: true, key: k };
}

export function formatStyle(map) {
  const lines = ['🧬 *Twin Style*', ''];
  for (const [k, v] of Object.entries(map || {})) {
    lines.push(`· *${k}:* ${v}`);
  }
  return lines.join('\n');
}

function buildDraftText(inbound, style, webTip) {
  const tone = style.tone || DEFAULT_STYLE.tone;
  const lang = style.language || DEFAULT_STYLE.language;
  let body =
    `Founder mode (${tone}).\n` +
    `Re: ${String(inbound || '').slice(0, 500)}\n\n` +
    `Reply suggestion:\n` +
    `බලමු — scope + timeline fixed. Money/code only after I approve. ` +
    `Queen OS mobile-first (${lang}). Next step එක කියන්න.`;
  if (webTip) body += '\n\n' + webTip;
  body += '\n\n_Draft only — not sent._';
  return body;
}

export async function createDraft({ inbound, channel = 'telegram', from_label = '' } = {}) {
  const style = await listStyle();
  let webTip = '';
  try {
    const wg = await import('./webGuidance.js');
    const g = wg.tipForText(inbound);
    if (g) webTip = wg.formatTipLine(g);
  } catch (_) {}
  const draft = buildDraftText(inbound, style, webTip);
  const client = sb();
  const row = {
    inbound: String(inbound || '').slice(0, 4000),
    draft,
    channel,
    from_label: from_label || null,
    status: 'pending',
    created_at: new Date().toISOString(),
  };
  if (!client) return { ok: true, offline: true, draft, id: null };
  const { data, error } = await client.from('rq_twin_drafts').insert(row).select('*').single();
  if (error) return { ok: true, draft, id: null, warn: error.message };
  return { ok: true, draft: data.draft || draft, id: data.id };
}

export async function listDrafts({ status = 'pending', limit = 10 } = {}) {
  const client = sb();
  if (!client) return [];
  let q = client.from('rq_twin_drafts').select('*').order('created_at', { ascending: false }).limit(limit);
  if (status && status !== 'all') q = q.eq('status', status);
  const { data } = await q;
  return data || [];
}

export function formatDrafts(rows) {
  if (!rows?.length) return 'No pending twin drafts.';
  const lines = ['📝 *Twin drafts*', ''];
  for (const d of rows) {
    lines.push(
      '`' +
        String(d.id).slice(0, 8) +
        '` ' +
        (d.status || '') +
        ' · ' +
        String(d.inbound || '').slice(0, 60)
    );
  }
  return lines.join('\n');
}

export async function setDraftStatus(idPrefix, status) {
  const client = sb();
  if (!client) return { ok: false, error: 'no supabase' };
  const rows = await listDrafts({ status: 'all', limit: 40 });
  const row = rows.find((d) => String(d.id).startsWith(idPrefix));
  if (!row) return { ok: false, error: 'draft not found' };
  const { error } = await client
    .from('rq_twin_drafts')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', row.id);
  if (error) return { ok: false, error: error.message };
  return { ok: true, id: row.id, status };
}

export default {
  twinHelp,
  listStyle,
  teachStyle,
  formatStyle,
  createDraft,
  listDrafts,
  formatDrafts,
  setDraftStatus,
};
