
/**
 * Wave 21A — Founder Digital Twin (SAFE)
 * Learns style notes + drafts replies. NEVER auto-sends to Telegram contacts.
 * Web/dashboard channel only until Founder enables later phases.
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
  return (
    '*GOD-MODE Twin · 21A*\n' +
    'Digital Twin = *drafts only* (no auto-TG to friends)\n\n' +
    '• `god help` — menu\n' +
    '• `twin help` — twin commands\n' +
    '• `twin style` — show style brain\n' +
    '• `twin teach <key> | <value>` — teach style\n' +
    '• `twin draft <message>` — draft Founder-style reply\n' +
    '• `twin drafts` — pending drafts\n' +
    '• `twin approve <id>` / `twin reject <id>`\n\n' +
    '*Empire*\n' +
    '• `empire status` · `empire invoice <client> | <amount> | <desc>`\n' +
    '• `empire invoices` — list drafts (Stripe later)\n\n' +
    '*Swarm*\n' +
    '• `swarm spawn <role>` · `swarm units` (or `gswarm spawn`)\n• `deal create Client | amount | desc | message` — Deal Desk\n• `deal list`\n\n' +
    '_Social posts + live TG customer auto-reply = later. Web twin first._'
  );
}

export async function listStyle() {
  const client = sb();
  const map = { ...DEFAULT_STYLE };
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
  return { ok: true, key: k, value: v };
}

function buildDraftLocal(inbound, style) {
  const s = style || DEFAULT_STYLE;
  return (
    '(Draft — not sent)\n' +
    'Tone: ' + (s.tone || DEFAULT_STYLE.tone) + '\n\n' +
    'Reply suggestion:\n' +
    'Founder mode: ' +
    String(inbound).slice(0, 200) +
    ' — බලමු. Timeline + scope fixed. Money/code changes only after I approve. ' +
    'Queen OS mobile-first. Next step එක කියන්න.'
  );
}

export async function createDraft({ inbound, from_label = 'web', channel = 'web' }) {
  const style = await listStyle();
  let draft = buildDraftLocal(inbound, style);
  // optional LLM polish
  try {
    const ai = await import('./aiRouter.js');
    const ask = ai.ask || ai.chat || ai.complete;
    if (typeof ask === 'function') {
      const prompt =
        'You are the Founder Digital Twin for Pasiya Max Queen OS. Write a short reply DRAFT in Founder style.\n' +
        'Style: ' + JSON.stringify(style).slice(0, 800) + '\n' +
        'Rules: no money move, no code push, no pretending payment received. Sinhala/English mix OK.\n' +
        'Inbound: ' + String(inbound).slice(0, 1500) + '\n' +
        'Reply draft only:';
      const out = await ask(prompt);
      const text = typeof out === 'string' ? out : out?.text || out?.content;
      if (text && String(text).length > 20) draft = String(text).slice(0, 2000);
    }
  } catch (_) {}

  const client = sb();
  if (!client) return { ok: true, draft, id: null, offline: true };
  const row = {
    channel,
    from_label: String(from_label).slice(0, 120),
    inbound: String(inbound).slice(0, 4000),
    draft_reply: draft,
    status: 'pending',
  };
  const { data, error } = await client.from('rq_twin_drafts').insert(row).select('*').single();
  if (error) return { ok: false, error: error.message, draft };
  return { ok: true, draft: data.draft_reply, id: data.id, status: data.status };
}

export async function listDrafts({ status = 'pending', limit = 10 } = {}) {
  const client = sb();
  if (!client) return [];
  let q = client.from('rq_twin_drafts').select('*').order('created_at', { ascending: false }).limit(limit);
  if (status && status !== 'all') q = q.eq('status', status);
  const { data } = await q;
  return data || [];
}

export async function setDraftStatus(id, status) {
  const client = sb();
  if (!client) return { ok: false, error: 'no supabase' };
  const { data, error } = await client
    .from('rq_twin_drafts')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, draft: data };
}

export function formatStyle(map) {
  const lines = ['🧬 *Twin Style*', ''];
  for (const [k, v] of Object.entries(map || {})) {
    lines.push('· *' + k + '*: ' + String(v).slice(0, 120));
  }
  return lines.join('\n');
}

export function formatDrafts(rows) {
  if (!rows?.length) return 'No pending twin drafts.';
  const lines = ['📝 *Twin drafts*', ''];
  for (const d of rows.slice(0, 8)) {
    lines.push(
      '`' +
        String(d.id).slice(0, 8) +
        '` [' +
        d.status +
        '] ' +
        String(d.inbound || '').slice(0, 40) +
        '…'
    );
  }
  return lines.join('\n');
}

export default {
  twinHelp,
  listStyle,
  teachStyle,
  createDraft,
  listDrafts,
  setDraftStatus,
  formatStyle,
  formatDrafts,
};
