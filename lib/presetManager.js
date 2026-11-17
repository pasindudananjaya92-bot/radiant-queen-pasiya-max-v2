/**
 * Wave 22A — Preset Brain (OpenRouter-style settings in DB)
 */
import { createClient } from '@supabase/supabase-js';

function sb() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

const DEFAULTS = {
  'queen-twin': {
    language: 'Sinhala + English mix, Founder tone',
    tone: 'direct, mobile-first, no fluff, high agency',
    money_rule: 'Never move money or send invoice without Founder approve',
    code_rule: 'Never git push without Founder/Grok ZIP path',
  },
  'queen-deal': {
    currency: 'USD',
    default_terms: 'Draft only — Stripe send later after Founder approve',
    web_checklist: '1',
  },
};

export function presetHelp() {
  return [
    '*Preset Brain · 22A*',
    'Change Bot behavior without a new ZIP',
    '',
    '• `preset help`',
    '• `preset list`',
    '• `preset show <name>` — e.g. queen-twin, queen-deal',
    '• `preset set <name> <key> <value>`',
    '',
    '_Examples:_ `preset set queen-twin tone "Sinhala only"`',
  ].join('\n');
}

export async function listPresets() {
  const client = sb();
  const names = new Set(Object.keys(DEFAULTS));
  if (client) {
    const { data } = await client.from('rq_presets').select('name,updated_at').order('name');
    for (const r of data || []) names.add(r.name);
  }
  return [...names].sort();
}

export async function getPreset(name) {
  const n = String(name || '').trim().toLowerCase();
  const base = { ...(DEFAULTS[n] || {}) };
  const client = sb();
  if (!client) return { name: n, settings: base, source: 'default' };
  const { data } = await client.from('rq_presets').select('*').eq('name', n).maybeSingle();
  if (!data) return { name: n, settings: base, source: 'default' };
  const settings = { ...base, ...(data.settings || {}) };
  return { name: n, settings, source: 'db', updated_at: data.updated_at };
}

export async function setPresetValue(name, key, value) {
  const n = String(name || '').trim().toLowerCase();
  const k = String(key || '').trim().slice(0, 64);
  const v = String(value || '').trim().slice(0, 2000);
  if (!n || !k) return { ok: false, error: 'name + key required' };
  const client = sb();
  if (!client) return { ok: false, error: 'no supabase' };
  const cur = await getPreset(n);
  const settings = { ...(cur.settings || {}), [k]: v };
  const row = { name: n, settings, updated_at: new Date().toISOString() };
  const { error } = await client.from('rq_presets').upsert(row, { onConflict: 'name' });
  if (error) return { ok: false, error: error.message };
  return { ok: true, name: n, key: k, settings };
}

export function formatPresetList(names) {
  const lines = ['⚙️ *Presets*', ''];
  for (const n of names || []) lines.push('· `' + n + '`');
  if (!names?.length) lines.push('_none_');
  lines.push('', 'Try: `preset show queen-twin`');
  return lines.join('\n');
}

export function formatPresetShow(p) {
  const lines = [
    `⚙️ *Preset \`${p.name}\`*`,
    `Source: ${p.source}${p.updated_at ? ' · ' + p.updated_at : ''}`,
    '',
  ];
  const s = p.settings || {};
  for (const k of Object.keys(s)) {
    lines.push(`· *${k}:* ${s[k]}`);
  }
  if (!Object.keys(s).length) lines.push('_empty_');
  return lines.join('\n');
}

export default {
  presetHelp,
  listPresets,
  getPreset,
  setPresetValue,
  formatPresetList,
  formatPresetShow,
  DEFAULTS,
};
