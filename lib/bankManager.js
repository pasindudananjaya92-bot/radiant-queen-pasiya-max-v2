import { createClient } from '@supabase/supabase-js';

const SYMBOLS = {
  LKR: 'Rs.',
  USD: '$',
  EUR: '€',
  GBP: '£',
  INR: '₹',
  AUD: 'A$',
  CAD: 'C$',
};

export function currencySymbol(code) {
  const c = String(code || 'LKR').toUpperCase();
  return SYMBOLS[c] || c + ' ';
}

export function formatMoney(amount, currency = 'LKR') {
  const n = Number(amount) || 0;
  const c = String(currency || 'LKR').toUpperCase();
  const sym = currencySymbol(c);
  try {
    return (
      sym +
      n.toLocaleString('en', {
        minimumFractionDigits: c === 'LKR' || c === 'INR' ? 0 : 2,
        maximumFractionDigits: 2,
      })
    );
  } catch (_) {
    return sym + n;
  }
}

function sb() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

function uid() {
  return (
    String(process.env.ADMIN_ID || process.env.FOUNDER_ID || 'founder')
      .split(/[\s,]+/)
      .filter(Boolean)[0] || 'founder'
  );
}

function catGuess(merchant = '', note = '') {
  const t = `${merchant} ${note}`.toLowerCase();
  if (/keells|cargills|food|grocery|supermarket/.test(t)) return 'groceries';
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
  const currency = String(input.currency || 'LKR')
    .trim()
    .toUpperCase()
    .slice(0, 8) || 'LKR';
  const tx_date = input.tx_date || new Date().toISOString().slice(0, 10);
  const row = {
    user_id: uid(),
    amount: Math.abs(amount),
    currency,
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
    const value = `${formatMoney(row.amount, currency)} on ${tx_date}` + (note ? ` — ${note}` : '');
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
  const { data, error } = await client.from('bank_transactions').delete().eq('id', tid).select('id');
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

  // Totals per currency (no FX conversion — honest multi-currency)
  const byCurrency = {};
  const byCategory = {};
  const byDay = {};
  for (const t of recent) {
    const amt = Number(t.amount) || 0;
    const cur = String(t.currency || 'LKR').toUpperCase();
    byCurrency[cur] = (byCurrency[cur] || 0) + amt;
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

  const primary =
    Object.keys(byCurrency).sort((a, b) => byCurrency[b] - byCurrency[a])[0] || 'LKR';

  return {
    ok: true,
    days,
    total: byCurrency[primary] || 0,
    currency: primary,
    byCurrency,
    byCategory,
    series,
    count: recent.length,
    formatted: Object.entries(byCurrency)
      .map(([c, v]) => formatMoney(v, c))
      .join(' · '),
  };
}

export function parseBillText(text) {
  const t = String(text || '').replace(/^(bill|bank)\s+/i, '').trim();
  // optional currency prefix: USD 12.5 coffee
  const m2 = t.match(/^(LKR|USD|EUR|GBP|INR|AUD|CAD)\s+(\d+(?:\.\d+)?)\s+(.+)$/i);
  if (m2) {
    return {
      currency: m2[1].toUpperCase(),
      amount: Number(m2[2]),
      merchant: m2[3].trim(),
      note: m2[3].trim(),
    };
  }
  const m = t.match(/^(\d+(?:\.\d+)?)\s+(.+)$/);
  if (!m) return null;
  return { amount: Number(m[1]), merchant: m[2].trim(), note: m[2].trim(), currency: 'LKR' };
}
