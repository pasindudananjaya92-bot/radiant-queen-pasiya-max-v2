/**
 * Wave 26B — Site ↔ Deal bridge
 * Writes pricing section as DRAFT content only (caller decides publish).
 * Free tier. No Stripe. No auto-send.
 */

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Parse "Start:Talk · Pro:$49 · Empire:Talk" or pipe/newline packs */
export function parsePackages(raw) {
  const text = String(raw || '').trim();
  if (!text) {
    return [
      { name: 'Start', price: 'Talk', bullets: ['Bot core', 'Telegram control', 'Health monitor'] },
      { name: 'Pro', price: 'Talk', bullets: ['Dashboard OS', 'Vault + Memory', 'Night Operator'], featured: true },
      { name: 'Empire', price: 'Talk', bullets: ['Full Queen OS', 'Web Master', 'Founder training'] },
    ];
  }
  const parts = text.split(/\s*[|\n·]\s*/).map((x) => x.trim()).filter(Boolean);
  const packs = [];
  for (const p of parts) {
    const m = p.match(/^([^:=]+)\s*[:=]\s*(.+)$/);
    if (m) {
      const name = m[1].trim().slice(0, 40);
      const price = m[2].trim().slice(0, 40);
      const paid = /\d/.test(price);
      let bullets = ['Mobile-first setup', 'Founder-approved money moves', 'Queen OS stack'];
      if (/start/i.test(name)) bullets = ['Bot core', 'Telegram control', 'Health monitor'];
      else if (/pro/i.test(name)) bullets = ['Dashboard OS', 'Vault + Memory', 'Night Operator'];
      else if (/empire/i.test(name)) bullets = ['Full Queen OS', 'Web Master', 'Founder training'];
      if (paid) bullets = bullets.concat(['Scoped delivery']).slice(0, 3);
      packs.push({ name, price, bullets, featured: /pro/i.test(name) });
    }
  }
  return packs.length ? packs : parsePackages('');
}

export function buildPricingHtml(packages, note) {
  const packs = packages || parsePackages('');
  const cards = packs
    .map((p) => {
      const cls = p.featured ? 'pkg featured' : 'pkg';
      const lis = (p.bullets || []).map((b) => `<li>${escapeHtml(b)}</li>`).join('');
      return `<article class="${cls}"><h3>${escapeHtml(p.name)}</h3><p class="price">${escapeHtml(p.price)}</p><ul>${lis}</ul></article>`;
    })
    .join('\n    ');
  const footer = escapeHtml(note || 'Mobile-first · money moves only after Founder approve.');
  return `<section id="pricing" class="card">
  <h2>Pricing</h2>
  <p class="lead">Queen OS packages</p>
  <div class="grid-3">
    ${cards}
  </div>
  <p class="note">${footer}</p>
</section>`;
}

export async function syncPricingToSite(customText) {
  const wm = await import('./webMaster.js');
  let packs = parsePackages(customText);
  // Prefer queen-deal preset labels if present
  try {
    const pm = await import('./presetManager.js');
    const p = await pm.getPreset('queen-deal');
    if (p?.settings?.packages) packs = parsePackages(String(p.settings.packages));
    if (customText && String(customText).trim()) packs = parsePackages(customText);
  } catch (_) {}
  const html = buildPricingHtml(packs);
  const saved = await wm.updateSection('pricing', html, 'Pricing');
  return {
    ok: true,
    section: saved.section || 'pricing',
    version: saved.version,
    packs: packs.map((x) => x.name + ':' + x.price),
    published: saved.published,
  };
}
