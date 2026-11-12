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

/**
 * Free FX rates — no API key (open.er-api.com).
 * Base: BANK_BASE_CURRENCY or LKR.
 * Fallback: static approx rates if network fails.
 */
export async function fetchFxRates(base = 'LKR') {
  const baseCur = String(base || 'LKR').toUpperCase();
  const fallback = {
    LKR: 1,
    USD: 300,
    EUR: 325,
    GBP: 380,
    INR: 3.6,
    AUD: 195,
    CAD: 220,
  };
  try {
    // Get all rates vs USD then rebase
    const res = await fetch('https://open.er-api.com/v6/latest/USD', {
      signal: AbortSignal.timeout(5000),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || j.result !== 'success' || !j.rates) {
      throw new Error(j['error-type'] || 'fx fetch failed');
    }
    const usdRates = j.rates; // currency -> per 1 USD
    // Convert: amount_in_CUR -> amount_in_BASE
    // amount_base = amount_cur / rate(cur_per_usd) * rate(base_per_usd)
    // value in USD = amount / usdRates[CUR] for non-USD... actually usdRates[CUR] = how many CUR per 1 USD
    // So 1 CUR = 1/usdRates[CUR] USD
    // 1 BASE = 1/usdRates[BASE] USD
    // amount in BASE = amount_cur * (usdRates[BASE] / usdRates[CUR]) when both quoted per USD
    const ratesToBase = { [baseCur]: 1 };
    const basePerUsd = baseCur === 'USD' ? 1 : usdRates[baseCur];
    if (!basePerUsd && baseCur !== 'USD') throw new Error('base currency unsupported');
    for (const [cur, perUsd] of Object.entries(usdRates)) {
      if (!perUsd) continue;
      if (baseCur === 'USD') ratesToBase[cur] = 1 / perUsd;
      else ratesToBase[cur] = basePerUsd / perUsd; // multiply amount_cur * this = amount_base
    }
    ratesToBase.USD = baseCur === 'USD' ? 1 : basePerUsd;
    ratesToBase[baseCur] = 1;
    return { ok: true, base: baseCur, rates: ratesToBase, provider: 'open.er-api.com', live: true };
  } catch (e) {
    // fallback: treat fallback table as "units of LKR per 1 unit currency"
    const lkrTable = fallback;
    const ratesToBase = { [baseCur]: 1 };
    if (baseCur === 'LKR') {
      for (const [c, v] of Object.entries(lkrTable)) ratesToBase[c] = v;
    } else {
      const baseInLkr = lkrTable[baseCur] || 1;
      for (const [c, v] of Object.entries(lkrTable)) {
        ratesToBase[c] = v / baseInLkr;
      }
    }
    return {
      ok: true,
      base: baseCur,
      rates: ratesToBase,
      provider: 'fallback-static',
      live: false,
      error: e.message || String(e),
    };
  }
}

export async function addTransaction(input = {}) {
  const client = sb();
  if (!client) throw new Error('Supabase not configured');
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount === 0) throw new Error('amount required');
  const merchant = String(input.merchant || '').trim().slice(0, 120);
  const note = String(input.note || '').trim().slice(0, 500);
  const category = String(input.category || catGuess(merchant, note) || 'other').slice(0, 40);
  const currency = String(input.currency || 'LKR').trim().toUpperCase().slice(0, 8) || 'LKR';
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

  const base = String(process.env.BANK_BASE_CURRENCY || 'LKR').toUpperCase();
  let fx = null;
  let totalBase = 0;
  try {
    fx = await fetchFxRates(base);
    for (const [cur, amt] of Object.entries(byCurrency)) {
      const rate = fx.rates[cur];
      if (rate != null) totalBase += amt * rate;
      else totalBase += cur === base ? amt : 0;
    }
  } catch (_) {
    totalBase = byCurrency[primary] || 0;
  }

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
    // Phase 10 FX
    base_currency: base,
    total_base: Math.round(totalBase * 100) / 100,
    total_base_formatted: formatMoney(totalBase, base),
    fx_live: !!(fx && fx.live),
    fx_provider: fx?.provider || null,
  };
}

export function parseBillText(text) {
  const t = String(text || '').replace(/^(bill|bank)\s+/i, '').trim();
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
