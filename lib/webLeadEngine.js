/**
 * Wave 38A — Website Bot-Builder Lead Engine
 * Form → Lead CRM → Graph → Blueprint → Score → Founder TG alert
 * Draft-only followups. No auto money / no auto publish.
 */
import { createClient } from '@supabase/supabase-js';

export const VERSION = '38A';

function sb() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

function founderChatId() {
  return String(process.env.ADMIN_ID || process.env.FOUNDER_ID || '')
    .split(/[\s,]+/)
    .filter(Boolean)[0];
}

function clean(s, n = 300) {
  return String(s || '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, n);
}

/** Heuristic score 0-100 when Decisions API unavailable */
export function heuristicScore(p) {
  let s = 30;
  const need = (p.need || '').toLowerCase();
  const biz = (p.business || p.name || '').toLowerCase();
  if (p.contact && /@|\+?\d{9,}/.test(p.contact)) s += 15;
  if (biz.length > 2) s += 10;
  if (need.length > 20) s += 15;
  if (/bot|automat|telegram|crm|whatsapp|shop|hotel|clinic|agency/i.test(need + ' ' + biz)) s += 15;
  if (/urgent|asap|today|refund|pay/i.test(need)) s += 10;
  if (/spam|test only|asdf/i.test(need)) s -= 40;
  return Math.max(0, Math.min(100, s));
}

export function priorityFromScore(score) {
  if (score >= 75) return 'high';
  if (score >= 50) return 'warm';
  return 'standard';
}

/** Instant architecture blueprint — template (fast, free, no 10s LLM risk) */
export function buildBlueprint(p) {
  const biz = clean(p.business || p.name || 'Your business', 80);
  const need = clean(p.need || 'automation', 200);
  return [
    '👑 *Queen OS Blueprint* (draft)',
    'Business: ' + biz,
    'Need: ' + need,
    '',
    '*Suggested stack (mobile founder)*',
    '1. Telegram bot control (Founder + staff roles)',
    '2. Vercel serverless + Supabase memory/CRM',
    '3. Lead inbox + draft replies (never auto-send money)',
    '4. Optional: website form → Telegram alert',
    '5. Health / deploy gate on free tier',
    '',
    '*First 7 days*',
    '· Day 1–2: core bot + menus',
    '· Day 3–4: CRM + notifications',
    '· Day 5–7: site + content packs',
    '',
    '_Quote / timeline only after Founder approve. GODMODEAUTO=OFF._',
  ].join('\n');
}

export async function scoreLead(p) {
  // Try Decisions API module if present
  try {
    const dec = await import('./decisionsEngine.js');
    if (dec && typeof dec.decideCheck === 'function') {
      const text = [p.name, p.business, p.need, p.contact].filter(Boolean).join(' | ');
      const r = await dec.decideCheck(text);
      if (r && r.ok) {
        let score = heuristicScore(p);
        if (r.money_risk === 'YES' || r.needs_founder === 'YES') score = Math.max(score, 80);
        if (r.urgent === 'YES') score = Math.min(100, score + 10);
        if (r.spam === 'YES') score = Math.min(score, 25);
        return {
          score,
          priority: priorityFromScore(score),
          decide: r,
          method: 'decide+heuristic',
        };
      }
    }
  } catch (_) {}
  const score = heuristicScore(p);
  return { score, priority: priorityFromScore(score), method: 'heuristic' };
}

async function notifyFounder(text) {
  const token = process.env.BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
  const chat = founderChatId();
  if (!token || !chat) return { ok: false, error: 'no_bot_or_admin' };
  try {
    const url = 'https://api.telegram.org/bot' + token + '/sendMessage';
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chat,
        text: String(text).slice(0, 3500),
        disable_web_page_preview: true,
      }),
    });
    const j = await res.json().catch(() => ({}));
    return { ok: !!j.ok, error: j.description };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

async function rateLimitOk(ipHash) {
  try {
    const cache = await import('./cacheManager.js');
    if (cache && typeof cache.rateLimit === 'function') {
      const r = await cache.rateLimit('weblead:' + (ipHash || 'x'), 8, 60);
      return r?.ok !== false;
    }
  } catch (_) {}
  return true;
}

/**
 * Main intake from website form (api/site POST)
 */
export async function intakeWebLead(body, meta = {}) {
  const honeypot = clean(body.website || body.company_url || body.hp || '', 50);
  if (honeypot) {
    return { ok: true, ignored: true, reason: 'honeypot' };
  }

  const name = clean(body.name || body.full_name || '', 120);
  const business = clean(body.business || body.company || name, 120);
  const contact = clean(body.contact || body.phone || body.email || '', 200);
  const need = clean(body.need || body.message || body.goal || '', 500);

  if (!name && !contact) {
    return { ok: false, error: 'name_or_contact_required' };
  }

  const ipHash = clean(meta.ipHash || '', 64);
  if (!(await rateLimitOk(ipHash))) {
    return { ok: false, error: 'rate_limited' };
  }

  const client = sb();
  if (!client) return { ok: false, error: 'supabase_missing' };

  const scored = await scoreLead({ name, business, contact, need });
  const blueprint = buildBlueprint({ name, business, need, contact });

  const note = [
    'Source: website form',
    business ? 'Business: ' + business : '',
    need ? 'Need: ' + need : '',
    'Score: ' + scored.score + ' (' + scored.priority + ')',
  ]
    .filter(Boolean)
    .join('\n')
    .slice(0, 500);

  // Insert lead — tolerate missing optional columns
  let lead = null;
  let insertErr = null;
  const fullRow = {
    name: name || business || 'Web lead',
    contact,
    note,
    status: scored.priority === 'high' ? 'warm' : 'new',
    source: 'website',
    score: scored.score,
    priority: scored.priority,
    business,
    need,
    blueprint,
    meta: {
      utm: meta.utm || {},
      ipHash: ipHash || null,
      ua: meta.ua || null,
      method: scored.method,
    },
    last_touch_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  {
    const { data, error } = await client.from('rq_leads').insert(fullRow).select('id,name,status,score,priority').single();
    if (error) {
      insertErr = error.message;
      // Fallback minimal columns (pre-38A schema)
      const { data: d2, error: e2 } = await client
        .from('rq_leads')
        .insert({
          name: fullRow.name,
          contact,
          note,
          status: fullRow.status,
        })
        .select('id,name,status')
        .single();
      if (e2) return { ok: false, error: e2.message || insertErr };
      lead = d2;
    } else {
      lead = data;
    }
  }

  // Graph node
  try {
    const mg = await import('./memoryGraph.js');
    if (mg && typeof mg.graphAdd === 'function') {
      await mg.graphAdd(
        'person',
        business || name,
        'web lead · ' + scored.priority + ' · ' + (need || '').slice(0, 80)
      );
    }
  } catch (_) {}

  // Revenue pipeline soft touch
  try {
    const rev = await import('./revenuePipeline.js');
    if (rev && typeof rev.touchLead === 'function') {
      await rev.touchLead({ id: lead.id, stage: 'new' });
    }
  } catch (_) {}

  // Event log
  try {
    await client.from('rq_web_events').insert({
      kind: 'lead_form',
      ip_hash: ipHash || null,
      payload: { lead_id: lead.id, priority: scored.priority, score: scored.score },
    });
  } catch (_) {}

  // Founder alert
  const flag = scored.priority === 'high' ? '🔥 HIGH PRIORITY' : '📩 New web lead';
  const alert = [
    flag + ' · Queen OS 38A',
    'Name: ' + (name || '—'),
    'Business: ' + (business || '—'),
    'Contact: ' + (contact || '—'),
    'Need: ' + (need || '—').slice(0, 200),
    'Score: ' + scored.score + ' · ' + scored.priority,
    lead?.id ? 'Lead: ' + String(lead.id).slice(0, 8) : '',
    '',
    'Commands: lead list · lead get ' + String(lead.id || '').slice(0, 8),
    'Follow-up draft: funnel follow ' + String(lead.id || '').slice(0, 8),
  ]
    .filter(Boolean)
    .join('\n');

  const notified = await notifyFounder(alert);

  return {
    ok: true,
    lead,
    score: scored.score,
    priority: scored.priority,
    blueprint,
    notified: notified.ok,
    publicMessage:
      scored.priority === 'high'
        ? 'Thanks — Founder was notified as priority. You will hear back soon.'
        : 'Thanks — your request is in the Queen OS pipeline. Founder will review.',
  };
}

/** Draft follow-up if lead untouched > hours (default 24) */
export async function listStaleLeads(hours = 24) {
  const client = sb();
  if (!client) return { ok: false, error: 'supabase_missing', rows: [] };
  const since = new Date(Date.now() - hours * 3600 * 1000).toISOString();
  const { data, error } = await client
    .from('rq_leads')
    .select('id,name,contact,note,status,business,need,created_at,last_touch_at')
    .in('status', ['new', 'warm'])
    .lt('created_at', since)
    .order('created_at', { ascending: true })
    .limit(15);
  if (error) {
    // fallback without last_touch
    const r2 = await client
      .from('rq_leads')
      .select('id,name,contact,note,status,created_at')
      .in('status', ['new', 'warm'])
      .lt('created_at', since)
      .limit(15);
    return { ok: !r2.error, rows: r2.data || [], error: r2.error?.message };
  }
  return { ok: true, rows: data || [] };
}

export async function draftFollowUp(lead) {
  const name = lead.name || 'there';
  const biz = lead.business || '';
  const body = [
    'Hi ' + name + (biz ? ' (' + biz + ')' : '') + ',',
    '',
    'Following up on your Queen OS / bot request.',
    'Happy to share a simple mobile-first plan + timeline.',
    'Reply with your preferred time — Founder approves next steps.',
    '',
    '— Pasiya Max · Queen OS',
  ].join('\n');

  // Optional twin polish
  try {
    const twin = await import('./twinEngine.js');
    if (twin && typeof twin.draftReply === 'function') {
      const d = await twin.draftReply('Follow up with lead: ' + name + ' about ' + (lead.need || 'bot setup'));
      if (d && (d.text || d.draft)) {
        return { ok: true, text: d.text || d.draft, via: 'twin' };
      }
    }
  } catch (_) {}

  return { ok: true, text: body, via: 'template' };
}

/** Seed website sections for bot-builder funnel */
export async function seedFunnelSections() {
  const wm = await import('./webMaster.js');
  const sections = {
    home: {
      title: 'Get a Bot like Queen',
      content: `<section class="hero card">
  <h1>Get a Bot like Queen for your Business</h1>
  <p class="lead">Mobile-first Telegram automation · Vercel · Supabase · Founder-approved money moves</p>
  <p><a class="btn" href="#get-bot">Get My Bot</a> <a class="btn secondary" href="#how">How it works</a></p>
</section>
<section id="how" class="card">
  <h2>How it works</h2>
  <ol class="steps">
    <li><strong>Request</strong> — tell us your business + need</li>
    <li><strong>AI Blueprint</strong> — instant architecture summary</li>
    <li><strong>Bot delivered</strong> — Founder-built, mobile operated</li>
  </ol>
</section>
<section id="get-bot" class="card">
  <h2>Request your bot</h2>
  <form id="queen-lead-form" method="POST" action="https://radiant-queen-pasiya-max-v2.vercel.app/api/site?action=lead">
    <input type="text" name="name" placeholder="Your name" required maxlength="120" />
    <input type="text" name="business" placeholder="Business name" maxlength="120" />
    <input type="text" name="contact" placeholder="Phone or email" required maxlength="200" />
    <textarea name="need" placeholder="What should the bot do?" required maxlength="500"></textarea>
    <!-- honeypot -->
    <input type="text" name="website" value="" tabindex="-1" autocomplete="off" style="position:absolute;left:-9999px" aria-hidden="true" />
    <button type="submit" class="btn">Get My Bot</button>
  </form>
  <p class="note">No spam. Founder reviews every request. Money moves only after approve.</p>
</section>`,
    },
    services: {
      title: 'Services',
      content: `<section id="services" class="card">
  <h2>What Queen OS builds</h2>
  <ul>
    <li>Telegram command center for mobile founders</li>
    <li>Lead CRM + draft replies (never auto-send)</li>
    <li>Website form → Telegram alert pipeline</li>
    <li>Health, deploy gate, free-tier hardening</li>
  </ul>
</section>`,
    },
    pricing: {
      title: 'Packs',
      content: `<section id="pricing" class="card">
  <h2>Packs</h2>
  <div class="grid-3">
    <article class="pkg"><h3>Starter</h3><p class="price">Talk</p><ul><li>Core bot</li><li>Telegram control</li><li>Health monitor</li></ul></article>
    <article class="pkg featured"><h3>Pro</h3><p class="price">Talk</p><ul><li>Dashboard OS</li><li>CRM + leads</li><li>Night Operator</li></ul></article>
    <article class="pkg"><h3>Queen OS</h3><p class="price">Talk</p><ul><li>Full stack</li><li>Web Master</li><li>Founder training</li></ul></article>
  </div>
  <p class="note">Mobile-first · prices confirmed only after Founder approve.</p>
</section>`,
    },
  };

  const results = [];
  for (const [sec, v] of Object.entries(sections)) {
    try {
      if (typeof wm.updateSection === 'function') {
        await wm.updateSection(sec, v.content, v.title);
        if (typeof wm.setPublished === 'function') await wm.setPublished(sec, true);
        results.push(sec + ':ok');
      }
    } catch (e) {
      results.push(sec + ':' + (e.message || 'fail'));
    }
  }
  return { ok: true, results };
}

export function helpText() {
  return [
    '🌐 *Website Bot-Builder · ' + VERSION + '*',
    'Funnel: Site form → Lead → Graph → Blueprint → Founder alert',
    '',
    '• `funnel help` — this menu',
    '• `funnel seed` — push Hero/How/Form HTML to Web Master',
    '• `funnel status` — recent web leads',
    '• `funnel follow` — stale leads (>24h) + draft texts',
    '• `funnel follow <id>` — one draft',
    '',
    'Public POST: /api/site?action=lead',
    'PHP form on InfinityFree posts there.',
    '_No auto-reply to visitors. No auto money._',
  ].join('\n');
}

export default {
  VERSION,
  intakeWebLead,
  buildBlueprint,
  scoreLead,
  listStaleLeads,
  draftFollowUp,
  seedFunnelSections,
  helpText,
};
