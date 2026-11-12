import { createClient } from '@supabase/supabase-js';

function sb() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

function uid() {
  return String(process.env.ADMIN_ID || process.env.FOUNDER_ID || 'founder')
    .split(/[\s,]+/)
    .filter(Boolean)[0] || 'founder';
}

function catGuess(merchant = '', note = '') {
  const t = `${merchant} ${note}`.toLowerCase();
  if (/keells|cargills|food|grocery|supermarket|keell/.test(t)) return 'groceries';
  if (/fuel|petrol|diesel|uber|pickme|bus|train/.test(t)) return 'transport';
  if (/ceylon|electric|water|dialog|mobitel|bill|utility/.test(t)) return 'utilities';
  if (/pharmacy|hospital|medical/.test(t)) return 'health';
  if (/amazon|daraz|store|shop/.test(t)) return 'shopping';
  return 'other';
}

export async function addTransaction(input = {}) {
  const client = sb();
  if (!client) throw new Error('Supabase not configured');
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount === 0) throw new Error('amount required');
  const merchant = String(input.merchant || '').trim().slice(0, 120);
  const note = String(input.note || '').trim().slice(0, 500);
  const category = String(input.category || catGuess(merchant, note) || 'other').slice(0, 40);
  const tx_date = input.tx_date || new Date().toISOString().slice(0, 10);
  const row = {
    user_id: uid(),
    amount: Math.abs(amount),
    currency: String(input.currency || 'LKR').slice(0, 8),
    category,
    merchant: merchant || null,
    note: note || null,
    bill_file_path: input.bill_file_path || null,
    brain_key: null,
    tx_date,
    source: input.source || 'dash',
    updated_at: new Date().toISOString(),
  };

  try {
    const bm = await import('./brainManager.js');
    const label = merchant || note || 'Bill';
    const key_display = `${label} Bill`.slice(0, 80);
    const value = `Rs.${row.amount} ${row.currency} on ${tx_date}` + (note ? ` — ${note}` : '');
    const saved = await bm.remember({ key_display, value, source: 'bank' });
    row.brain_key = saved?.key_display || key_display;
  } catch (_) {}

  const { data, error } = await client.from('bank_transactions').insert(row).select('*').single();
  if (error) throw new Error(error.message);
  return data;
}

export async function listTransactions(limit = 40) {
  const client = sb();
  if (!client) throw new Error('Supabase not configured');
  // Prefer founder rows, but also show legacy user_id='founder'
  const { data, error } = await client
    .from('bank_transactions')
    .select('*')
    .order('tx_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data || [];
}

export async function deleteTransaction(id) {
  const client = sb();
  if (!client) throw new Error('Supabase not configured');
  const tid = String(id || '').trim();
  if (!tid) throw new Error('id required');

  // Primary: delete by id only (UI always has unique uuid)
  const { data, error } = await client
    .from('bank_transactions')
    .delete()
    .eq('id', tid)
    .select('id');
  if (error) throw new Error(error.message);
  if (!data || !data.length) throw new Error('Transaction not found');
  return true;
}

export async function summary(days = 30) {
  const list = await listTransactions(200);
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceStr = since.toISOString().slice(0, 10);
  const recent = list.filter((t) => String(t.tx_date) >= sinceStr);
  const byCategory = {};
  const byDay = {};
  let total = 0;
  for (const t of recent) {
    const amt = Number(t.amount) || 0;
    total += amt;
    const c = t.category || 'other';
    byCategory[c] = (byCategory[c] || 0) + amt;
    const d = String(t.tx_date).slice(0, 10);
    byDay[d] = (byDay[d] || 0) + amt;
  }
  const series = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    series.push({ date: key, total: byDay[key] || 0 });
  }
  return { ok: true, days, total, currency: 'LKR', byCategory, series, count: recent.length };
}

export function parseBillText(text) {
  const t = String(text || '').replace(/^(bill|bank)\s+/i, '').trim();
  const m = t.match(/^(\d+(?:\.\d+)?)\s+(.+)$/);
  if (!m) return null;
  return { amount: Number(m[1]), merchant: m[2].trim(), note: m[2].trim() };
}
