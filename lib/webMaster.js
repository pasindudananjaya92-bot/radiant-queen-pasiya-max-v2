/**
 * Web Master · 23B
 * Supabase-backed site CMS for InfinityFree PHP front.
 * Safer generate templates + audit + publish flags.
 */

function sb() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL / SERVICE_ROLE_KEY missing');
  return { url: url.replace(/\/$/, ''), key };
}

async function sbFetch(path, opts = {}) {
  const { url, key } = sb();
  const r = await fetch(url + '/rest/v1/' + path, {
    ...opts,
    headers: {
      apikey: key,
      Authorization: 'Bearer ' + key,
      'Content-Type': 'application/json',
      Prefer: opts.prefer || 'return=representation',
      ...(opts.headers || {}),
    },
  });
  const text = await r.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!r.ok) throw new Error(typeof data === 'object' ? JSON.stringify(data) : String(data));
  return data;
}

const SECTIONS = ['home', 'about', 'services', 'pricing', 'contact', 'styles'];

export function siteHelp() {
  return [
    '*Web Master · 23B*',
    'InfinityFree ← `/api/site` ← Supabase ← Telegram',
    '',
    '• `site help`',
    '• `site list`',
    '• `site get <section>`',
    '• `site update <section> | <html>`',
    '• `site generate <section> | <brief>` — richer HTML templates',
    '• `site audit`',
    '• `site polish` — refresh styles + ensure all sections published',
    '• `site publish <section>` / `site unpublish <section>`',
    '',
    'Public: `/api/site` · Never full wipe · Section-only',
  ].join('\n');
}

export async function listSections() {
  const rows = await sbFetch('rq_site_content?select=section,title,version,published,updated_at&order=section.asc');
  return rows || [];
}

export async function getSection(section) {
  const s = String(section || '').toLowerCase().trim();
  const rows = await sbFetch(
    `rq_site_content?section=eq.${encodeURIComponent(s)}&select=*&limit=1`
  );
  return (rows && rows[0]) || null;
}

async function saveRevision(section, oldRow) {
  if (!oldRow) return;
  try {
    await sbFetch('rq_site_revisions', {
      method: 'POST',
      prefer: 'return=minimal',
      body: JSON.stringify({
        section,
        version: oldRow.version || 1,
        html: oldRow.html || '',
        title: oldRow.title || section,
      }),
    });
  } catch (_) {}
}

export async function updateSection(section, html, title) {
  const s = String(section || '').toLowerCase().trim();
  if (!s) throw new Error('section required');
  const existing = await getSection(s);
  if (existing) await saveRevision(s, existing);
  const version = (existing?.version || 0) + 1;
  const payload = {
    section: s,
    title: title || existing?.title || s,
    html: String(html || ''),
    version,
    published: existing?.published !== false,
    updated_at: new Date().toISOString(),
  };
  if (existing) {
    await sbFetch(`rq_site_content?section=eq.${encodeURIComponent(s)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  } else {
    await sbFetch('rq_site_content', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }
  return payload;
}

function templateFor(section, brief) {
  const b = String(brief || '').trim() || 'Queen OS mobile-first automation';
  const safe = b.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  if (section === 'pricing') {
    return `<section id="pricing" class="card">
  <h2>Pricing</h2>
  <p class="lead">${safe}</p>
  <div class="grid-3">
    <article class="pkg"><h3>Start</h3><p class="price">Talk</p><ul><li>Bot core</li><li>Telegram control</li><li>Health monitor</li></ul></article>
    <article class="pkg featured"><h3>Pro</h3><p class="price">Talk</p><ul><li>Dashboard OS</li><li>Vault + Memory</li><li>Night Operator</li></ul></article>
    <article class="pkg"><h3>Empire</h3><p class="price">Talk</p><ul><li>Full Queen OS</li><li>Web Master</li><li>Founder training</li></ul></article>
  </div>
  <p class="note">All packages: mobile-first · Founder approve for money moves.</p>
</section>`;
  }
  if (section === 'home') {
    return `<section class="hero" id="home">
  <h1>Pasiya Max</h1>
  <p class="tag">Mobile-first automation · Queen OS</p>
  <p>${safe}</p>
  <p class="actions"><a class="btn" href="#pricing">Packages</a> <a class="btn btn-ghost" href="#contact">Contact</a></p>
</section>`;
  }
  if (section === 'about') {
    return `<section id="about" class="card"><h2>About</h2><p>${safe}</p><p>Built by a mobile founder on Telegram · Vercel · Supabase — no laptop required to operate.</p></section>`;
  }
  if (section === 'services') {
    return `<section id="services" class="card"><h2>Services</h2><p>${safe}</p>
<ul class="features"><li>Bot automation & heal systems</li><li>Dashboard OS (PWA)</li><li>Deploy Guardian & Night Operator</li><li>Web Master for your site</li></ul></section>`;
  }
  if (section === 'contact') {
    return `<section id="contact" class="card"><h2>Contact</h2><p>${safe}</p><p>Telegram: <strong>@PasiyaMaxQueen_bot</strong></p></section>`;
  }
  if (section === 'styles') {
    return `/* Queen OS site 23B */
:root{--bg:#0b1020;--card:#141b2d;--text:#e8eefc;--muted:#9db0d0;--accent:#6ea8ff;--ok:#3dd68c}
*{box-sizing:border-box}body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:var(--bg);color:var(--text);line-height:1.5}
a{color:var(--accent)}main{max-width:920px;margin:0 auto;padding:24px 16px 64px}
.hero{padding:48px 0 24px}.hero h1{font-size:clamp(1.8rem,5vw,2.6rem);margin:0 0 8px}
.tag,.lead,.note{color:var(--muted)}.card{background:var(--card);border-radius:16px;padding:20px;margin:16px 0}
.btn{display:inline-block;background:var(--accent);color:#061018;text-decoration:none;padding:10px 16px;border-radius:999px;font-weight:600;margin-right:8px}
.btn-ghost{background:transparent;color:var(--text);border:1px solid #2a3550}
.grid-3{display:grid;gap:12px;grid-template-columns:1fr}@media(min-width:720px){.grid-3{grid-template-columns:repeat(3,1fr)}}
.pkg{background:#0e1526;border:1px solid #243049;border-radius:12px;padding:16px}.pkg.featured{border-color:var(--accent)}
.price{font-size:1.25rem;font-weight:700}.features{padding-left:1.2rem}
@media(prefers-reduced-motion:reduce)*{animation:none!important;transition:none!important}`;
  }
  return `<section id="${section}" class="card"><h2>${section}</h2><p>${safe}</p></section>`;
}

export async function generateSection(section, brief) {
  const s = String(section || '').toLowerCase().trim();
  let html = templateFor(s, brief);
  // Optional LLM polish — never fail if AI down
  try {
    const ai = await import('./aiRouter.js');
    const fn = ai.complete || ai.chat || ai.generate || ai.default;
    if (typeof fn === 'function' && brief && s !== 'styles') {
      const prompt =
        `Write clean semantic HTML ONLY for website section "${s}". Mobile-first, accessible, no scripts. Brief: ${brief}. Return HTML fragment only.`;
      const out = await fn(prompt);
      const text = String(out?.text || out?.content || out || '').trim();
      if (text.includes('<') && text.length > 40) html = text.slice(0, 12000);
    }
  } catch (_) {}
  return updateSection(s, html, s);
}

export async function auditSite() {
  const rows = await listSections();
  const have = new Set((rows || []).map((r) => r.section));
  const missing = SECTIONS.filter((s) => !have.has(s));
  const unpublished = (rows || []).filter((r) => r.published === false).map((r) => r.section);
  const tips = [];
  if (missing.length) tips.push('Missing sections: ' + missing.join(', '));
  if (unpublished.length) tips.push('Unpublished: ' + unpublished.join(', '));
  const pricing = rows.find((r) => r.section === 'pricing');
  if (pricing && (pricing.html || '').length < 80) tips.push('Pricing looks thin — run: site generate pricing | 3 packages');
  if (!tips.length) tips.push('All core sections present. Run site polish for CSS refresh.');
  return { missing, unpublished, tips, count: rows.length };
}

export async function polishSite() {
  // ensure styles + publish all existing
  await generateSection('styles', 'modern dark mobile');
  const rows = await listSections();
  for (const r of rows || []) {
    if (r.published === false) {
      await sbFetch(`rq_site_content?section=eq.${encodeURIComponent(r.section)}`, {
        method: 'PATCH',
        body: JSON.stringify({ published: true, updated_at: new Date().toISOString() }),
      });
    }
  }
  return { ok: true, sections: (rows || []).length };
}

export async function setPublished(section, published) {
  const s = String(section || '').toLowerCase().trim();
  await sbFetch(`rq_site_content?section=eq.${encodeURIComponent(s)}`, {
    method: 'PATCH',
    body: JSON.stringify({ published: !!published, updated_at: new Date().toISOString() }),
  });
  return { section: s, published: !!published };
}

export async function publicPayload() {
  const rows = await sbFetch(
    'rq_site_content?published=eq.true&select=section,title,html,version,updated_at&order=section.asc'
  );
  const map = {};
  for (const r of rows || []) map[r.section] = r;
  return {
    ok: true,
    version: '23B',
    sections: map,
    order: ['home', 'about', 'services', 'pricing', 'contact'],
  };
}

export function formatList(rows) {
  const lines = ['📁 *Site sections*', ''];
  for (const r of rows || []) {
    const flag = r.published === false ? '⏸' : '✅';
    lines.push(`${flag} *${r.section}* v${r.version || 1} — ${r.title || r.section}`);
  }
  if (!rows?.length) lines.push('_empty — run site generate home | hero_');
  return lines.join('\n');
}

export function formatAudit(a) {
  return [
    '🔎 *Site audit · 23B*',
    `Sections: ${a.count}`,
    a.missing?.length ? 'Missing: ' + a.missing.join(', ') : 'Missing: none',
    a.unpublished?.length ? 'Unpublished: ' + a.unpublished.join(', ') : 'Unpublished: none',
    '',
    ...a.tips.map((t) => '· ' + t),
  ].join('\n');
}

export default {
  siteHelp,
  listSections,
  getSection,
  updateSection,
  generateSection,
  auditSite,
  polishSite,
  setPublished,
  publicPayload,
  formatList,
  formatAudit,
};
