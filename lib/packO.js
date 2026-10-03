/**
 * lib/packO.js — Pack O helpers
 * Barcode/product, receipt parse, species ID, knowledge base, expenses
 */

const UA = 'RadiantQueenBot/4.0 (+https://t.me/PasiyaMaxQueen_bot)';

/**
 * Decode barcode/QR from public image URL (qrserver free).
 * @param {string} imageUrl
 * @returns {Promise<{ok:boolean, data?:string, type?:string, error?:string}>}
 */
export async function decodeBarcodeFromUrl(imageUrl) {
  const u = String(imageUrl || '').trim();
  if (!u) return { ok: false, error: 'no image url' };
  try {
    const api =
      'https://api.qrserver.com/v1/read-qr-code/?fileurl=' + encodeURIComponent(u);
    const res = await fetch(api, {
      headers: { Accept: 'application/json', 'User-Agent': UA },
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return { ok: false, error: 'HTTP ' + res.status };
    const j = await res.json();
    const sym = j?.[0]?.symbol?.[0];
    const data = sym?.data;
    if (!data) return { ok: false, error: sym?.error || 'No barcode/QR found' };
    return {
      ok: true,
      data: String(data).slice(0, 2000),
      type: String(sym?.type || 'CODE').slice(0, 40),
      provider: 'qrserver',
    };
  } catch (e) {
    return { ok: false, error: String(e?.message || e).slice(0, 160) };
  }
}

/**
 * Open Food Facts product by barcode (no key).
 * @param {string} code
 */
export async function lookupOpenFoodFacts(code) {
  const c = String(code || '').replace(/\D/g, '');
  if (c.length < 8) return { ok: false, error: 'invalid barcode' };
  try {
    const url =
      'https://world.openfoodfacts.org/api/v2/product/' +
      encodeURIComponent(c) +
      '.json?fields=product_name,brands,quantity,ingredients_text,nutriscore_grade,nova_group,allergens_tags,nutriments,image_front_small_url,categories';
    const res = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': UA },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return { ok: false, error: 'HTTP ' + res.status };
    const j = await res.json();
    if (!j || j.status !== 1 || !j.product) {
      return { ok: false, error: 'Product not in Open Food Facts' };
    }
    const p = j.product;
    const n = p.nutriments || {};
    return {
      ok: true,
      source: 'openfoodfacts',
      code: c,
      name: p.product_name || 'Unknown',
      brands: p.brands || '',
      quantity: p.quantity || '',
      ingredients: (p.ingredients_text || '').slice(0, 400),
      nutriscore: p.nutriscore_grade || '',
      nova: p.nova_group != null ? String(p.nova_group) : '',
      allergens: Array.isArray(p.allergens_tags)
        ? p.allergens_tags.map((t) => String(t).replace('en:', '')).join(', ')
        : '',
      energyKcal: n['energy-kcal_100g'] ?? n.energy_kcal_100g ?? null,
      fat: n.fat_100g ?? null,
      carbs: n.carbohydrates_100g ?? null,
      proteins: n.proteins_100g ?? null,
      image: p.image_front_small_url || '',
      categories: (p.categories || '').slice(0, 120),
    };
  } catch (e) {
    return { ok: false, error: String(e?.message || e).slice(0, 160) };
  }
}

/**
 * UPCitemdb trial (non-food products, 100/day free, no key).
 * @param {string} code
 */
export async function lookupUpcItemDb(code) {
  const c = String(code || '').replace(/\D/g, '');
  if (c.length < 8) return { ok: false, error: 'invalid barcode' };
  try {
    const url =
      'https://api.upcitemdb.com/prod/trial/lookup?upc=' + encodeURIComponent(c);
    const res = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': UA },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return { ok: false, error: 'HTTP ' + res.status };
    const j = await res.json();
    const item = j?.items?.[0];
    if (!item) return { ok: false, error: 'Not found in UPCitemdb' };
    return {
      ok: true,
      source: 'upcitemdb',
      code: c,
      name: item.title || 'Unknown',
      brands: item.brand || '',
      description: String(item.description || '').slice(0, 300),
      category: item.category || '',
      lowestPrice: item.lowest_recorded_price,
      highestPrice: item.highest_recorded_price,
      image: Array.isArray(item.images) ? item.images[0] : '',
    };
  } catch (e) {
    return { ok: false, error: String(e?.message || e).slice(0, 160) };
  }
}

/**
 * Full barcode → product pipeline.
 * @param {string} imageUrl
 */
export async function barcodeProductFromImage(imageUrl) {
  const decoded = await decodeBarcodeFromUrl(imageUrl);
  if (!decoded.ok) return { ok: false, error: decoded.error || 'decode failed' };
  const raw = decoded.data;
  const digits = String(raw).replace(/\D/g, '');
  if (digits.length >= 8 && digits.length <= 14) {
    const food = await lookupOpenFoodFacts(digits);
    if (food.ok) {
      return { ok: true, barcode: digits, type: decoded.type, product: food };
    }
    const upc = await lookupUpcItemDb(digits);
    if (upc.ok) {
      return { ok: true, barcode: digits, type: decoded.type, product: upc };
    }
    return {
      ok: true,
      barcode: digits,
      type: decoded.type,
      product: null,
      note: 'Barcode decoded but product not in free databases',
    };
  }
  // Non-numeric payload (URL, text)
  return {
    ok: true,
    barcode: raw,
    type: decoded.type,
    product: null,
    note: 'Decoded non-product payload',
  };
}

/**
 * Format product card for Telegram.
 * @param {object} r result of barcodeProductFromImage
 */
export function formatProductCard(r) {
  if (!r?.ok) return '❌ ' + (r?.error || 'lookup failed');
  const lines = ['🛒 BARCODE SCAN', ''];
  lines.push('Code: `' + (r.barcode || '?') + '`');
  if (r.type) lines.push('Type: ' + r.type);
  const p = r.product;
  if (!p) {
    lines.push(r.note || 'No product data');
    return lines.join('\n');
  }
  lines.push('Source: ' + (p.source || ''));
  lines.push('Name: ' + (p.name || '?'));
  if (p.brands) lines.push('Brand: ' + p.brands);
  if (p.quantity) lines.push('Qty: ' + p.quantity);
  if (p.nutriscore) lines.push('Nutri-Score: ' + String(p.nutriscore).toUpperCase());
  if (p.nova) lines.push('NOVA: ' + p.nova);
  if (p.energyKcal != null) lines.push('Energy: ' + p.energyKcal + ' kcal/100g');
  if (p.proteins != null) lines.push('Protein: ' + p.proteins + 'g/100g');
  if (p.fat != null) lines.push('Fat: ' + p.fat + 'g/100g');
  if (p.carbs != null) lines.push('Carbs: ' + p.carbs + 'g/100g');
  if (p.allergens) lines.push('Allergens: ' + p.allergens);
  if (p.ingredients) lines.push('', 'Ingredients: ' + p.ingredients.slice(0, 280));
  if (p.description) lines.push('', p.description.slice(0, 280));
  if (p.lowestPrice != null) lines.push('Price range: ' + p.lowestPrice + ' – ' + (p.highestPrice ?? '?'));
  if (p.categories) lines.push('Cat: ' + p.categories);
  return lines.join('\n').slice(0, 3500);
}

/**
 * Parse receipt text with heuristics + optional numbers.
 * @param {string} ocrText
 * @returns {{total?:number, date?:string, merchant?:string, items:string[], currency:string}}
 */
export function parseReceiptText(ocrText) {
  const t = String(ocrText || '');
  const items = [];
  const lines = t.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  let total = null;
  let date = null;
  let merchant = lines[0] ? lines[0].slice(0, 60) : '';
  let currency = 'LKR';

  const totalRe =
    /(?:total|grand\s*total|amount\s*due|net\s*amount|එකතුව|මුළු)\s*[:\.]?\s*(?:rs\.?|lkr|usd|\$)?\s*([\d,]+\.?\d*)/i;
  const mTotal = t.match(totalRe);
  if (mTotal) {
    total = parseFloat(mTotal[1].replace(/,/g, ''));
  } else {
    // last large money-looking number
    const nums = [...t.matchAll(/(?:rs\.?|lkr|\$)?\s*([\d,]+\.\d{2})\b/gi)].map((x) =>
      parseFloat(x[1].replace(/,/g, ''))
    );
    if (nums.length) total = Math.max(...nums.filter((n) => n > 0 && n < 1e7));
  }

  const dateRe =
    /(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})|(\d{4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2})/;
  const mDate = t.match(dateRe);
  if (mDate) date = mDate[0];

  if (/\$|USD/i.test(t)) currency = 'USD';
  else if (/€|EUR/i.test(t)) currency = 'EUR';
  else if (/₹|INR/i.test(t)) currency = 'INR';

  for (const line of lines.slice(1, 25)) {
    if (/total|subtotal|tax|vat|change|cash|card/i.test(line)) continue;
    if (line.length > 3 && line.length < 80) items.push(line.slice(0, 80));
    if (items.length >= 12) break;
  }

  return { total, date, merchant, items, currency };
}

/**
 * Format receipt summary.
 */
export function formatReceiptCard(parsed, saved) {
  const lines = ['🧾 RECEIPT SCAN', ''];
  if (parsed.merchant) lines.push('Merchant: ' + parsed.merchant);
  if (parsed.date) lines.push('Date: ' + parsed.date);
  if (parsed.total != null) {
    lines.push('Total: ' + parsed.currency + ' ' + Number(parsed.total).toFixed(2));
  } else {
    lines.push('Total: (not detected — check OCR)');
  }
  if (parsed.items?.length) {
    lines.push('', 'Items (sample):');
    parsed.items.slice(0, 8).forEach((it, i) => lines.push(i + 1 + '. ' + it));
  }
  if (saved) lines.push('', '✅ Saved to expenses');
  return lines.join('\n').slice(0, 3000);
}

/**
 * Search iNaturalist taxa by name (free, no key).
 * @param {string} q
 */
export async function searchINatTaxa(q) {
  const query = String(q || '').trim().slice(0, 80);
  if (!query) return { ok: false, error: 'empty query' };
  try {
    const url =
      'https://api.inaturalist.org/v1/taxa?q=' +
      encodeURIComponent(query) +
      '&rank=species,genus,subspecies&per_page=5';
    const res = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': UA },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return { ok: false, error: 'HTTP ' + res.status };
    const j = await res.json();
    const results = (j?.results || []).map((t) => ({
      id: t.id,
      name: t.name,
      preferred: t.preferred_common_name || t.english_common_name || '',
      rank: t.rank,
      extinct: !!t.extinct,
      wikipedia: t.wikipedia_url || '',
      photo: t.default_photo?.medium_url || t.default_photo?.square_url || '',
      observations: t.observations_count,
    }));
    if (!results.length) return { ok: false, error: 'No taxa match' };
    return { ok: true, results };
  } catch (e) {
    return { ok: false, error: String(e?.message || e).slice(0, 160) };
  }
}

/**
 * Build vision prompt for species ID.
 */
export function identifyVisionPrompt() {
  return (
    'Identify the main plant, animal, bird, insect, or fungus in this photo. ' +
    'Reply in this exact format (English):\n' +
    'SPECIES: <best scientific or common name>\n' +
    'COMMON: <common English name if known>\n' +
    'TYPE: <plant|bird|insect|mammal|reptile|fungus|other>\n' +
    'CONFIDENCE: <high|medium|low>\n' +
    'NOTES: <one short sentence>\n' +
    'If unsure, still give best guess. No markdown.'
  );
}

/**
 * Parse SPECIES line from vision reply.
 * @param {string} text
 */
export function parseSpeciesGuess(text) {
  const t = String(text || '');
  const m = t.match(/SPECIES:\s*(.+)/i);
  const c = t.match(/COMMON:\s*(.+)/i);
  const ty = t.match(/TYPE:\s*(.+)/i);
  const conf = t.match(/CONFIDENCE:\s*(.+)/i);
  const notes = t.match(/NOTES:\s*(.+)/i);
  return {
    species: (m ? m[1] : t.split('\n')[0] || '').trim().slice(0, 120),
    common: (c ? c[1] : '').trim().slice(0, 80),
    type: (ty ? ty[1] : '').trim().slice(0, 40),
    confidence: (conf ? conf[1] : '').trim().slice(0, 20),
    notes: (notes ? notes[1] : '').trim().slice(0, 200),
  };
}

/**
 * Keyword search over knowledge rows.
 * @param {Array<{question:string,answer:string,tags?:string}>} rows
 * @param {string} q
 */
export function searchKnowledge(rows, q) {
  const query = String(q || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1);
  if (!query.length || !Array.isArray(rows)) return null;
  let best = null;
  let bestScore = 0;
  for (const row of rows) {
    const hay = (
      String(row.question || '') +
      ' ' +
      String(row.tags || '') +
      ' ' +
      String(row.answer || '').slice(0, 200)
    ).toLowerCase();
    let score = 0;
    for (const w of query) {
      if (hay.includes(w)) score += 1;
    }
    if (score > bestScore) {
      bestScore = score;
      best = row;
    }
  }
  if (bestScore >= Math.max(1, Math.ceil(query.length * 0.5))) return best;
  return null;
}

/**
 * Simple unit conversion (no API).
 * @param {string} body
 */
export function convertUnits(body) {
  const t = String(body || '').trim().toLowerCase();
  // 10 km to mi | 5 kg in lb | 100 c to f
  const m = t.match(/^([\d.]+)\s*([a-z°]+)\s+(?:to|in|→|->)\s*([a-z°]+)$/i);
  if (!m) return null;
  const val = parseFloat(m[1]);
  if (!Number.isFinite(val)) return null;
  let from = m[2].replace('°', '');
  let to = m[3].replace('°', '');
  const map = {
    km: { mi: (x) => x * 0.621371, m: (x) => x * 1000 },
    mi: { km: (x) => x * 1.60934, m: (x) => x * 1609.34 },
    m: { km: (x) => x / 1000, ft: (x) => x * 3.28084, cm: (x) => x * 100 },
    kg: { lb: (x) => x * 2.20462, g: (x) => x * 1000 },
    lb: { kg: (x) => x * 0.453592 },
    g: { kg: (x) => x / 1000 },
    c: { f: (x) => (x * 9) / 5 + 32, k: (x) => x + 273.15 },
    f: { c: (x) => ((x - 32) * 5) / 9 },
    l: { ml: (x) => x * 1000, gal: (x) => x * 0.264172 },
    ml: { l: (x) => x / 1000 },
  };
  const fn = map[from]?.[to];
  if (!fn) return { ok: false, error: 'Unsupported pair. Try km↔mi, kg↔lb, C↔F, m↔ft' };
  const out = fn(val);
  return {
    ok: true,
    text: val + ' ' + from + ' = ' + Number(out.toPrecision(6)) + ' ' + to,
  };
}

/**
 * Extract plain digits that look like EAN/UPC from OCR text.
 * @param {string} text
 */
export function extractBarcodeDigits(text) {
  const matches = String(text || '').match(/\b(\d{8,14})\b/g);
  if (!matches?.length) return null;
  // prefer 13 or 12 digit
  const ranked = matches.sort((a, b) => {
    const score = (s) => (s.length === 13 ? 3 : s.length === 12 ? 2 : s.length === 8 ? 1 : 0);
    return score(b) - score(a);
  });
  return ranked[0];
}

export default {
  decodeBarcodeFromUrl,
  lookupOpenFoodFacts,
  lookupUpcItemDb,
  barcodeProductFromImage,
  formatProductCard,
  parseReceiptText,
  formatReceiptCard,
  searchINatTaxa,
  identifyVisionPrompt,
  parseSpeciesGuess,
  searchKnowledge,
  convertUnits,
  extractBarcodeDigits,
};
