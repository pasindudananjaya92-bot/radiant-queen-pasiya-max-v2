/**
 * Wave 25A — Empire Engine
 * Spend cap meters + pretty bank. Invoices stay drafts.
 */
import { createClient } from '@supabase/supabase-js';

function sb() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

function budgetCap() {
  const n = Number(process.env.EMPIRE_BUDGET_CAP || 100);
  return Number.isFinite(n) && n > 0 ? n : 100;
}

export function empireHelp() {
  return [
    '*Empire · 25A*',
    '• `empire status` — budget + web guidance flag',
    '• `empire bank` — pretty totals',
    '• `empire invoice <client> | <amount> | <desc>` — draft only',
    '• `empire invoices`',
    '',
    `Budget cap env: EMPIRE_BUDGET_CAP (default ${budgetCap()})`,
    '_Stripe send = later + Founder approve_',
  ].join('\n');
}

export async function estimateSpendUsd() {
  // Prefer bank summary base USD if available; else count invoice drafts
  try {
    const b = await bankSummary();
    if (b && typeof b.total_usd === 'number') return b.total_usd;
    if (b && typeof b.totalUsd === 'number') return b.totalUsd;
    if (b && b.formatted && typeof b.total === 'number') return b.total;
  } catch (_) {}
  try {
    const inv = await listInvoices(50);
    let cents = 0;
    for (const i of inv || []) cents += Number(i.amount_cents || 0);
    return cents / 100;
  } catch (_) {}
  return 0;
}

export async function empireStatus() {
  const cap = budgetCap();
  const spend = await estimateSpendUsd();
  const usage = cap > 0 ? Math.min(999, (spend / cap) * 100) : 0;
  return {
    cap,
    spend,
    usage,
    warn80: usage >= 80,
    web_guidance: 'ON',
    baseline: 'Baseline 2024',
    guides: 12,
    godmode_auto: process.env.GODMODE_AUTO === '1' ? 'ON' : 'OFF',
  };
}

export function formatEmpireStatus(st) {
  const s = st || {};
  const lines = [
    '👑 *Empire status · 25A*',
    `Budget Cap: *$${Number(s.cap).toFixed(0)}* · Current Spend: *$${Number(s.spend).toFixed(2)}* · Usage: *${Number(s.usage).toFixed(0)}%*`,
    `Web Guidance: *${s.web_guidance}* · ${s.baseline} · Guides: ${s.guides}`,
    `GODMODE_AUTO: *${s.godmode_auto}* (drafts only when OFF)`,
  ];
  if (s.warn80) lines.push('⚠️ Founder, Budget is 80% used!');
  else if (Number(s.usage) >= 50) lines.push('🟡 Budget over half — watch API spend.');
  return lines.join('\n');
}

export async function createInvoiceDraft({ client_name, amount, description } = {}) {
  const client = sb();
  const amt = Number(String(amount || '0').replace(/[^0-9.]/g, '')) || 0;
  const row = {
    client_name: String(client_name || 'Client').slice(0, 120),
    amount_cents: Math.round(amt * 100),
    currency: 'USD',
    description: String(description || '').slice(0, 500),
    status: 'draft',
    created_at: new Date().toISOString(),
  };
  // deal preset currency
  try {
    const pm = await import('./presetManager.js');
    const p = await pm.getPreset('queen-deal');
    if (p.settings?.currency) row.currency = String(p.settings.currency).slice(0, 8);
  } catch (_) {}
  if (!client) return { ok: true, offline: true, invoice: row };
  const { data, error } = await client.from('rq_empire_invoices').insert(row).select('*').single();
  if (error) return { ok: false, error: error.message, invoice: row };
  return { ok: true, invoice: data };
}

export async function listInvoices(limit = 20) {
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
    if (typeof b.getSummary === 'function') return await b.getSummary(30);
    if (typeof b.listTransactions === 'function') {
      const txs = await b.listTransactions(5);
      return { txs };
    }
  } catch (e) {
    return { error: e.message || String(e) };
  }
  return { error: 'bank module unavailable' };
}

/** Pretty bank — NEVER dump raw JSON to Telegram */
export function formatBankPretty(summary) {
  if (!summary || summary.error) {
    return '🏦 Bank: _unavailable_ ' + (summary?.error || '');
  }
  // Common shapes from bankManager
  if (typeof summary === 'string' && !summary.trim().startsWith('{')) {
    return summary.startsWith('🏦') ? summary : '🏦 ' + summary;
  }
  const formatted = summary.formatted || summary.total_formatted || null;
  const base = summary.total_base_formatted || summary.totalbaseformatted || null;
  const fx = summary.fxlive || summary.fx_live;
  if (formatted && base) {
    return `🏦 Bank: ${formatted}${base ? ` (${base}${fx ? ' · live FX' : ''})` : ''}`;
  }
  if (formatted) return `🏦 Bank: ${formatted}`;
  if (typeof summary.total === 'number') {
    const cur = summary.currency || summary.basecurrency || 'USD';
    const sym = cur === 'LKR' ? 'Rs.' : cur === 'USD' ? '$' : cur + ' ';
    return `🏦 Bank: ${sym}${Number(summary.total).toFixed(2)}`;
  }
  // last resort — NEVER dump raw JSON to Telegram
  try {
    const total = summary.total ?? summary.total_usd ?? summary.totalUsd;
    const baseFmt = summary.total_base_formatted || summary.totalbaseformatted;
    if (typeof total === 'number' && baseFmt) {
      return `🏦 Bank: $${Number(total).toFixed(2)} (${baseFmt})`;
    }
    if (typeof total === 'number') {
      return `🏦 Bank: $${Number(total).toFixed(2)}`;
    }
  } catch (_) {}
  return '🏦 Bank: _summary available (open Dashboard Bank tab)_';
}

export async function spawnUnit(role, title = '') {
  const client = sb();
  const r = String(role || 'support').toLowerCase().slice(0, 32);
  const row = {
    role: r,
    title: title || r + ' unit',
    status: 'idle',
    notes: 'Wave 25A metadata unit — no separate bot token',
  };
  if (!client) return { ok: true, offline: true, unit: { ...row, id: 'offline' } };
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
  formatBankPretty,
  spawnUnit,
  listUnits,
  formatUnits,
  budgetCap,
};
