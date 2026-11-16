
/**
 * Wave 21A — Empire Engine (SAFE skeleton)
 * Invoice drafts + bank hooks prepared. NO Stripe live until FOUNDER keys + approve.
 * Social posting deferred. Money send NEVER automatic.
 */

import { createClient } from '@supabase/supabase-js';

function sb() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export function empireHelp() {
  return (
    '*Empire Engine · 21A*\n' +
    'Business skeleton — *no live payments yet*\n\n' +
    '• `empire status`\n' +
    '• `empire invoice <client> | <amount> | <description>`\n' +
    '• `empire invoices`\n' +
    '• `empire bank` — Private Bank summary\n\n' +
    'Stripe: set STRIPE_SECRET_KEY later → still requires Founder approve to send.\n' +
    'Social posts: deferred (mobile Make limits).'
  );
}

export async function empireStatus() {
  const stripe = !!process.env.STRIPE_SECRET_KEY;
  const auto = String(process.env.GODMODE_AUTO || '0') === '1';
  let invoices = 0;
  let units = 0;
  const client = sb();
  if (client) {
    const a = await client.from('rq_empire_invoices').select('id', { count: 'exact', head: true });
    invoices = a.count || 0;
    const b = await client.from('rq_swarm_units').select('id', { count: 'exact', head: true });
    units = b.count || 0;
  }
  return {
    stripe_ready: stripe,
    godmode_auto: auto,
    invoices,
    swarm_units: units,
    money_guard: 'Founder approve required',
  };
}

export function formatEmpireStatus(s) {
  return [
    '💰 *Empire Status · 21A*',
    'Stripe key: ' + (s.stripe_ready ? 'present (send still manual)' : 'not set'),
    'GODMODE_AUTO: ' + (s.godmode_auto ? 'ON ⚠️' : 'OFF (safe)'),
    'Invoice drafts: ' + s.invoices,
    'Swarm units: ' + s.swarm_units,
    'Guard: ' + s.money_guard,
  ].join('\n');
}

export async function createInvoiceDraft({ client_name, amount, description, currency = 'USD' }) {
  const client = sb();
  const cents = Math.round(Number(String(amount).replace(/[^0-9.]/g, '')) * (String(amount).includes('.') || Number(amount) < 1000 ? 100 : 1));
  // If user typed 500 meaning dollars → 50000 cents; if 10.00 → 1000. Heuristic:
  let amount_cents = Math.round(Number(String(amount).replace(/[^0-9.]/g, '')) * 100);
  if (!Number.isFinite(amount_cents) || amount_cents <= 0) amount_cents = 0;
  const row = {
    client_name: String(client_name || 'Client').slice(0, 120),
    amount_cents,
    currency: String(currency || 'USD').slice(0, 8),
    description: String(description || '').slice(0, 500),
    status: 'draft',
    stripe_ready: !!process.env.STRIPE_SECRET_KEY,
  };
  if (!client) return { ok: true, offline: true, invoice: row };
  const { data, error } = await client.from('rq_empire_invoices').insert(row).select('*').single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, invoice: data };
}

export async function listInvoices(limit = 10) {
  const client = sb();
  if (!client) return [];
  const { data } = await client
    .from('rq_empire_invoices')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  return data || [];
}

export function formatInvoices(rows) {
  if (!rows?.length) return 'No invoice drafts.';
  const lines = ['📄 *Invoice drafts*', ''];
  for (const i of rows) {
    const amt = ((i.amount_cents || 0) / 100).toFixed(2);
    lines.push(
      '`' +
        String(i.id).slice(0, 8) +
        '` ' +
        i.status +
        ' · ' +
        (i.currency || 'USD') +
        ' ' +
        amt +
        ' · ' +
        (i.client_name || '')
    );
  }
  lines.push('', '_Stripe send = later + Founder approve_');
  return lines.join('\n');
}

export async function bankSummary() {
  try {
    const b = await import('./bankManager.js');
    if (typeof b.summary === 'function') return await b.summary(30);
    if (typeof b.listTransactions === 'function') {
      const txs = await b.listTransactions(5);
      return { txs };
    }
  } catch (e) {
    return { error: e.message || String(e) };
  }
  return { error: 'bank module unavailable' };
}

/** Swarm units — metadata workers, not new Telegram bots */
export async function spawnUnit(role, title = '') {
  const client = sb();
  const r = String(role || 'support').toLowerCase().slice(0, 32);
  const row = {
    role: r,
    title: title || r + ' unit',
    status: 'idle',
    notes: 'Wave 21A metadata unit — no separate bot token',
  };
  if (!client) return { ok: true, offline: true, unit: row };
  const { data, error } = await client.from('rq_swarm_units').insert(row).select('*').single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, unit: data };
}

export async function listUnits(limit = 20) {
  const client = sb();
  if (!client) return [];
  const { data } = await client
    .from('rq_swarm_units')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  return data || [];
}

export function formatUnits(rows) {
  if (!rows?.length) return 'No swarm units. Try `swarm spawn support`';
  const lines = ['🐝 *Swarm units*', ''];
  for (const u of rows) {
    lines.push('· `' + String(u.id).slice(0, 8) + '` ' + u.role + ' · ' + (u.status || 'idle'));
  }
  return lines.join('\n');
}

export default {
  empireHelp,
  empireStatus,
  formatEmpireStatus,
  createInvoiceDraft,
  listInvoices,
  formatInvoices,
  bankSummary,
  spawnUnit,
  listUnits,
  formatUnits,
};
