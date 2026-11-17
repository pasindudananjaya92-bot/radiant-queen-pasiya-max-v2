
/**
 * Wave 23A — Web Master (Supabase ↔ InfinityFree bridge)
 * Bot writes sections to rq_site_content. PHP site reads via /api/site public JSON.
 * NEVER mass-deletes site. Updates are section-scoped + revision backup.
 */

import { createClient } from '@supabase/supabase-js';

const VERSION = '23A';

function sb() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

const SECTIONS = ['home', 'about', 'services', 'pricing', 'contact', 'styles', 'nav', 'footer'];

export function siteHelp() {
  return (
    '*Web Master · ' + VERSION + '*\n' +
    'InfinityFree site ← Supabase ← Telegram Bot\n\n' +
    '• `site help` — this menu\n' +
    '• `site list` — sections in DB\n' +
    '• `site get <section>` — show content (trimmed)\n' +
    '• `site update <section> | <html or text>` — save + revision\n' +
    '• `site generate <section> | <brief>` — LLM HTML draft → save\n' +
    '• `site audit` — missing business sections + tips\n' +
    '• `site publish <section>` / `site unpublish <section>`\n\n' +
    'Public JSON: `/api/site` (for PHP index)\n' +
    '_Never wipes whole site. Section-only updates._'
  );
}

export async function listSections() {
  const client = sb();
  if (!client) return { ok: false, error: 'no supabase' };
  const { data, error } = await client
    .from('rq_site_content')
    .select('section,title,published,updated_at,version,content_type')
    .order('section');
  if (error) return { ok: false, error: error.message };
  return { ok: true, rows: data || [] };
}

export async function getSection(section) {
  const client = sb();
  if (!client) return { ok: false, error: 'no supabase' };
  const s = String(section || '').toLowerCase().trim().slice(0, 64);
  const { data, error } = await client
    .from('rq_site_content')
    .select('*')
    .eq('section', s)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: 'section not found: ' + s };
  return { ok: true, row: data };
}

async function saveRevision(client, row) {
  try {
    await client.from('rq_site_revisions').insert({
      section: row.section,
      title: row.title,
      content: row.content,
      meta: row.meta || {},
    });
  } catch (_) {}
}

export async function updateSection({ section, content, title, content_type }) {
  const client = sb();
  if (!client) return { ok: false, error: 'no supabase' };
  const s = String(section || '').toLowerCase().trim().slice(0, 64);
  if (!s || !/^[a-z0-9_-]+$/.test(s)) return { ok: false, error: 'invalid section name' };
  const body = String(content || '').slice(0, 200000);
  if (!body.trim()) return { ok: false, error: 'empty content' };

  const existing = await getSection(s);
  if (existing.ok && existing.row) {
    await saveRevision(client, existing.row);
  }

  const payload = {
    section: s,
    content: body,
    title: title != null ? String(title).slice(0, 200) : existing.row?.title || s,
    content_type: content_type || existing.row?.content_type || (s === 'styles' ? 'css' : 'html'),
    published: existing.row?.published !== false,
    version: (existing.row?.version || 0) + 1,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await client
    .from('rq_site_content')
    .upsert(payload, { onConflict: 'section' })
    .select('*')
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, row: data };
}

export async function setPublished(section, published) {
  const client = sb();
  if (!client) return { ok: false, error: 'no supabase' };
  const s = String(section || '').toLowerCase().trim();
  const { data, error } = await client
    .from('rq_site_content')
    .update({ published: !!published, updated_at: new Date().toISOString() })
    .eq('section', s)
    .select('*')
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, row: data };
}

export async function generateSection(section, brief) {
  const s = String(section || 'home').toLowerCase().trim().slice(0, 64);
  const b = String(brief || 'Professional mobile-first business section for Pasiya Max Queen OS').slice(0, 1500);

  let html =
    '<section id="' +
    s +
    '"><h2>' +
    s +
    '</h2><p>' +
    b.replace(/</g, '&lt;') +
    '</p></section>';

  try {
    const ai = await import('./aiRouter.js');
    const ask = ai.ask || ai.chat || ai.complete || ai.generate;
    if (typeof ask === 'function') {
      const prompt =
        'You are Web Master for Pasiya Max business site. Output ONLY HTML fragment (no markdown fences, no <html>).\n' +
        'Rules: mobile-first, semantic HTML, Baseline 2024, accessible labels, no inline scripts, prefers-reduced-motion friendly.\n' +
        'Section: ' + s + '\nBrief: ' + b + '\n' +
        'Brand: dark premium, teal accent, Founder mobile automation (Queen OS).\n' +
        'If section is styles, output CSS only.';
      const out = await ask(prompt);
      const text = typeof out === 'string' ? out : out?.text || out?.content || '';
      if (text && String(text).length > 30) {
        html = String(text)
          .replace(/^```[a-z]*\n?/i, '')
          .replace(/```$/i, '')
          .trim()
          .slice(0, 200000);
      }
    }
  } catch (_) {}

  const ctype = s === 'styles' ? 'css' : 'html';
  return updateSection({ section: s, content: html, title: s, content_type: ctype });
}

export async function auditSite() {
  const listed = await listSections();
  if (!listed.ok) return listed;
  const have = new Set((listed.rows || []).map((r) => r.section));
  const required = ['home', 'about', 'services', 'pricing', 'contact', 'styles'];
  const missing = required.filter((s) => !have.has(s));
  const empty = (listed.rows || []).filter((r) => !String(r.title || '').trim() && r.section !== 'styles');
  const unpublished = (listed.rows || []).filter((r) => r.published === false);

  const tips = [];
  if (missing.length) tips.push('Missing sections: ' + missing.join(', ') + ' — run `site generate <section> | brief`');
  if (!have.has('styles')) tips.push('No styles section — generate Baseline 2024 mobile CSS');
  if (unpublished.length) tips.push('Unpublished: ' + unpublished.map((r) => r.section).join(', '));
  if (!missing.length && !unpublished.length) tips.push('Core business sections present. Polish copy with site update.');

  return {
    ok: true,
    have: [...have],
    missing,
    unpublished: unpublished.map((r) => r.section),
    tips,
    score: Math.max(0, 100 - missing.length * 15 - unpublished.length * 5),
  };
}

/** Public payload for PHP / CDN */
export async function publicSitePayload() {
  const client = sb();
  if (!client) return { ok: false, error: 'no supabase', version: VERSION };
  const { data, error } = await client
    .from('rq_site_content')
    .select('section,title,content,content_type,updated_at,version')
    .eq('published', true)
    .order('section');
  if (error) return { ok: false, error: error.message, version: VERSION };
  const sections = {};
  for (const row of data || []) {
    sections[row.section] = {
      title: row.title,
      content: row.content,
      content_type: row.content_type,
      updated_at: row.updated_at,
      version: row.version,
    };
  }
  return {
    ok: true,
    version: VERSION,
    brand: 'Pasiya Max',
    generated_at: new Date().toISOString(),
    sections,
  };
}

export function formatList(rows) {
  if (!rows?.length) return 'No site sections yet. Run SQL 001_webmaster.sql then `site generate home | hero`';
  const lines = ['🌐 *Site sections*', ''];
  for (const r of rows) {
    lines.push(
      (r.published === false ? '⏸' : '✅') +
        ' `' +
        r.section +
        '` v' +
        (r.version || 1) +
        (r.title ? ' — ' + r.title : '')
    );
  }
  return lines.join('\n');
}

export function formatAudit(a) {
  if (!a.ok) return '❌ Audit: ' + (a.error || 'fail');
  return [
    '🔎 *Site audit · ' + VERSION + '*',
    'Score: *' + a.score + '/100*',
    'Have: ' + (a.have.join(', ') || '—'),
    a.missing?.length ? 'Missing: ' + a.missing.join(', ') : 'Missing: none',
    a.unpublished?.length ? 'Unpublished: ' + a.unpublished.join(', ') : '',
    '',
    '*Tips*',
    ...(a.tips || []).map((t) => '· ' + t),
  ]
    .filter(Boolean)
    .join('\n');
}

export default {
  VERSION,
  siteHelp,
  listSections,
  getSection,
  updateSection,
  setPublished,
  generateSection,
  auditSite,
  publicSitePayload,
  formatList,
  formatAudit,
};
