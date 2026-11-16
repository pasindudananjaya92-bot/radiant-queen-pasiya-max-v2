/**
 * Wave 17 — Lab research + chunked reports + 500 roster map
 */
import { createClient } from '@supabase/supabase-js';

function sb() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export const LAB_MANDATE = [
  'Primary duty: raise Radiant Queen OS safely every day.',
  'Search public web + stack docs for better patterns.',
  'Respect Vercel Hobby, mobile-only Founder, 12-function limit.',
  'Proposals must include benefit, steps, risks, rollback.',
  'NEVER push code without Founder approval.',
  'Prefer free-tier, reversible changes.',
  'One daily report to Telegram (chunked if long).',
].join('\n');

/** Ordered hard-gate prefix list (document of truth) */
export const HARD_GATE_ORDER = [
  'qa', 'legion', 'lab', 'laboratory', 'codeswarm', 'pipeline',
  'swarm', 'nation', 'corps', 'mission', 'heal', 'sentinel', 'audit', 'scout',
  'think', 'health', 'vault', 'drive', 'bank', 'shadow', 'morning', 'night',
  'make', 'snap', 'cron', 'gh', 'mail', 'email', 'tts', 'mem', 'doc', 'voice',
];

const RESEARCH_ROLES = [
  'Serverless Patterns', 'Vercel Limits', 'Edge Runtime', 'Cron Design', 'Queue Patterns',
  'Postgres RLS', 'pgvector RAG', 'Supabase Storage', 'Realtime Safe', 'Backup Strategy',
  'Telegram Bot UX', 'Voice STT/TTS', 'PWA Offline', 'APK WebView', 'Mobile-First Ops',
  'Multi-Agent Debate', 'Tool Routing', 'Evidence Scoring', 'Prompt Safety', 'Hallucination Guards',
  'Self-Healing CI', 'Syntax Gates', 'Deploy Caps', 'Observability', 'Sentry Practice',
  'Rate Limits', 'API Fallbacks', 'Webhook Reliability', 'Idempotent Jobs', 'Secret Hygiene',
  'Cost Control', 'Free-Tier Stack', 'Open Source Alts', 'Redis Patterns', 'Cache TTL',
  'Security Headers', 'Auth Patterns', 'Threat Models', 'Red Team Notes', 'Compliance Light',
  'DX Reports', 'Changelog Craft', 'Migration Safety', 'Feature Flags', 'Canary Ideas',
  'Sinhala UX', 'Founder Workflow', 'Dashboard IA', 'Command Taxonomy', 'Lab Governance',
];

export function buildResearchRoster() {
  return RESEARCH_ROLES.map((role, i) => ({
    id: 'RSH-' + String(i + 1).padStart(2, '0'),
    corps: 'research',
    role,
  }));
}

/**
 * Wave 14D — 500 agent duty map (metadata only)
 * QA 200 already in qaEngine; here Lab Nation map totals ~500 including QA reference.
 */
export function buildLabNation500() {
  const agents = [];
  const pushWing = (corps, prefix, roles) => {
    roles.forEach((role, i) => {
      agents.push({
        id: `${prefix}-${String(i + 1).padStart(3, '0')}`,
        corps,
        role,
      });
    });
  };

  // Research 50
  pushWing('research', 'RSH', RESEARCH_ROLES);

  // Interior 120
  const interior = [];
  for (let i = 0; i < 120; i++) {
    interior.push(
      [
        'Pipeline Verify', 'Think Trace', 'Hull B Queue', 'Evidence Gate', 'Memory Index',
        'Vault Integrity', 'Bank FX', 'Shadow Due', 'Night Preflight', 'Cron Health',
        'Make Webhook', 'Snap Status', 'SQL Guard', 'Cache TTL', 'Job Lock',
      ][i % 15] + ` #${Math.floor(i / 15) + 1}`
    );
  }
  pushWing('interior', 'INT', interior);

  // Surface 120
  const surface = [];
  for (let i = 0; i < 120; i++) {
    surface.push(
      [
        'Telegram Reply', 'Caption Bind', 'Voice Path', 'Menu SI', 'Dashboard Tab',
        'PWA Shell', 'APK Wrapper', 'Alert Bell', 'War Room', 'QA Panel',
        'Lab UI', 'Drive List', 'Bank Chart', 'Chat Length', 'Auth Gate',
      ][i % 15] + ` #${Math.floor(i / 15) + 1}`
    );
  }
  pushWing('surface', 'SRF', surface);

  // Door / Probe 60
  const doors = [];
  for (let i = 0; i < 60; i++) {
    doors.push(
      [
        'Prefix Registry', 'Hard Gate Order', 'Contract Needle', 'Fallthrough Watch',
        'Wrong Handler', 'Probe Runner', 'Ticket On Fail', 'Alert Founder',
        'Deploy Smoke', 'Help Text Assert',
      ][i % 10] + ` #${Math.floor(i / 10) + 1}`
    );
  }
  pushWing('doors', 'DOR', doors);

  // Scribe / Mandate 50
  const scribe = [];
  for (let i = 0; i < 50; i++) {
    scribe.push(
      [
        'Daily Brief', 'Chunk Sender', 'Proposal Draft', 'Risk Note', 'Rollback Note',
        'Founder Digest', 'Change Log', 'Seal Summary', 'Metrics Snapshot', 'Upgrade Idea',
      ][i % 10] + ` #${Math.floor(i / 10) + 1}`
    );
  }
  pushWing('scribe', 'SCR', scribe);

  // QA reference slots 100 (pointer IDs — real QA lives in qaEngine 200)
  const qaRef = [];
  for (let i = 0; i < 100; i++) {
    qaRef.push(`QA-Ref-${String(i + 1).padStart(3, '0')}`);
  }
  pushWing('qa_ref', 'QAR', qaRef);

  return agents;
}

export const RESEARCH_NET = buildResearchRoster();
export const LAB_NATION = buildLabNation500();

export function nationSummary() {
  const by = {};
  for (const a of LAB_NATION) {
    by[a.corps] = (by[a.corps] || 0) + 1;
  }
  return { total: LAB_NATION.length, byCorps: by };
}

export function labHelp() {
  return (
    '*Agent Laboratory · Wave 17*\n' +
    `Research Net: *${RESEARCH_NET.length}* · Lab Nation map: *${LAB_NATION.length}*\n\n` +
    '• `lab help` / `lab status` / `lab mandate`\n' +
    '• `lab research` — Research 50 list\n' +
    '• `lab nation` — 500 duty map summary\n' +
    '• `lab gates` — ordered hard-gate prefixes\n' +
    '• `lab propose Title | Summary`\n' +
    '• `lab proposals` / `lab adopt <id>`\n' +
    '• `lab report` — daily brief (chunk-ready)\n' +
    '• `lab research run` — live Tavily/search pulse\n• `lab implement <id>` — 14E checklist\n' +
    '• Cron: `/api/cron?job=labdaily&secret=...`\n\n' +
    '_Code changes still require Founder + Grok ZIP path._'
  );
}

export function labStatus() {
  const n = nationSummary();
  return {
    ok: true,
    phase: '17',
    research: RESEARCH_NET.length,
    nation: n.total,
    byCorps: n.byCorps,
    gates: HARD_GATE_ORDER.length,
  };
}

export async function listProposals({ status = 'proposed', limit = 10 } = {}) {
  const client = sb();
  if (!client) return [];
  let q = client.from('rq_lab_proposals').select('*').order('created_at', { ascending: false }).limit(limit);
  if (status && status !== 'all') q = q.eq('status', status);
  const { data } = await q;
  return data || [];
}

export async function createProposal({ title, summary, category = 'upgrade', risk = '', sources = '' }) {
  const client = sb();
  const row = {
    title: String(title || 'Untitled').slice(0, 200),
    summary: String(summary || '').slice(0, 4000),
    category: String(category || 'upgrade').slice(0, 40),
    severity: 'info',
    status: 'proposed',
    risk: String(risk || '').slice(0, 1000),
    sources: String(sources || '').slice(0, 2000),
    steps: '1. Founder review\n2. Grok ZIP\n3. Mobile upload\n4. qa probe + health',
  };
  if (!client) return { ok: true, offline: true, proposal: { id: 'offline', ...row } };
  const { data, error } = await client.from('rq_lab_proposals').insert(row).select('*').single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, proposal: data };
}

export async function setProposalStatus(id, status) {
  const client = sb();
  if (!client) return { ok: false, error: 'no db' };
  const rows = await listProposals({ status: 'all', limit: 50 });
  const hit = rows.find((x) => String(x.id).startsWith(String(id).toLowerCase()));
  const fullId = hit ? hit.id : id;
  const { data, error } = await client
    .from('rq_lab_proposals')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', fullId)
    .select('*')
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, proposal: data };
}

export async function saveReport(body, meta = {}) {
  const client = sb();
  if (!client) return { ok: true, offline: true, body };
  const { data, error } = await client
    .from('rq_lab_reports')
    .insert({ kind: meta.kind || 'daily', body: String(body).slice(0, 50000), meta })
    .select('*')
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, report: data };
}

/** 14C — chunk long Telegram text */
export function chunkText(text, size = 3500) {
  const s = String(text || '');
  if (s.length <= size) return [s];
  const chunks = [];
  let i = 0;
  while (i < s.length) {
    let end = Math.min(i + size, s.length);
    if (end < s.length) {
      const nl = s.lastIndexOf('\n', end);
      if (nl > i + size * 0.5) end = nl;
    }
    chunks.push(s.slice(i, end).trim());
    i = end;
  }
  return chunks.filter(Boolean);
}

export function formatResearchList() {
  return (
    '🔭 *Research Net · 50*\n_Propose only · Founder approves_\n\n' +
    RESEARCH_NET.map((a) => `\`${a.id}\` · ${a.role}`).join('\n')
  );
}

export function formatNation() {
  const n = nationSummary();
  const lines = [
    '🏛 *Lab Nation Map · 14D*',
    `Total mapped: *${n.total}* (metadata — not 500 serverless fns)`,
    '',
  ];
  for (const [k, v] of Object.entries(n.byCorps)) {
    lines.push(`• *${k}*: ${v}`);
  }
  lines.push('');
  lines.push('_QA full roster still in `qa legion` (200). This map places Research + Interior + Surface + Doors + Scribe._');
  return lines.join('\n');
}

export function formatGates() {
  return (
    '🚪 *Hard-gate order (document of truth)*\n' +
    HARD_GATE_ORDER.map((p, i) => `${i + 1}. \`${p}\``).join('\n') +
    '\n\n_New prefixes must be added here + `qa probe` contracts + telegram/agentExecute gates._'
  );
}

/** 14B — research pulse using web_search when available */
export async function runResearchPulse() {
  const t0 = Date.now();
  const topics = [
    'Vercel serverless free tier limits best practices 2026',
    'Supabase RLS multi-tenant bot patterns',
    'Telegram bot Node.js production architecture',
  ];
  const findings = [];
  let webOk = false;
  let provider = '';
  let tried = [];

  try {
    const ws = await import('./webSearch.js');
    // Real export: searchWeb(query, { max })
    const fn =
      (typeof ws.searchWeb === 'function' && ws.searchWeb) ||
      (typeof ws.webSearch === 'function' && ws.webSearch) ||
      (typeof ws.default === 'function' && ws.default) ||
      (ws.default && typeof ws.default.searchWeb === 'function' && ws.default.searchWeb);

    if (typeof fn === 'function') {
      for (const topic of topics) {
        try {
          const r = await fn(topic, { max: 4 });
          if (r && r.tried) tried = r.tried;
          if (r && r.ok === false && !(r.hits && r.hits.length)) {
            findings.push({
              topic,
              snippet: 'search soft-fail: ' + (r.error || 'empty'),
              provider: (r.tried || []).join(',') || 'none',
            });
            continue;
          }
          webOk = true;
          provider = (r && r.provider) || provider || 'search';
          const hitText = (r.hits || [])
            .slice(0, 3)
            .map((h) => (h.title || '') + ' — ' + (h.snippet || h.content || '').slice(0, 160))
            .join(' | ');
          const text = (r.answer ? r.answer + ' | ' : '') + hitText || JSON.stringify(r).slice(0, 400);
          findings.push({
            topic,
            snippet: String(text).slice(0, 600),
            provider: r.provider || provider,
            urls: (r.hits || []).slice(0, 3).map((h) => h.url).filter(Boolean),
          });
        } catch (e) {
          findings.push({ topic, snippet: 'search error: ' + (e.message || e) });
        }
      }
    } else {
      findings.push({
        topic: 'bridge-error',
        snippet: 'webSearch.js loaded but searchWeb export missing',
      });
    }
  } catch (e) {
    findings.push({
      topic: 'import-error',
      snippet: 'webSearch import failed: ' + (e.message || e),
    });
  }

  if (!webOk && !findings.length) {
    findings.push({
      topic: 'offline-mode',
      snippet:
        'No live search — set TAVILY_API_KEY (or EXA/BRAVE) on Vercel and redeploy.',
    });
  }

  const first = findings.find((f) => f.urls && f.urls.length) || findings[0];
  if (first) {
    await createProposal({
      title: 'Research pulse: ' + String(first.topic).slice(0, 80),
      summary: first.snippet,
      category: 'research',
      sources: (first.urls || []).join('\n') || first.topic,
      risk: 'Web noise possible — Founder must review before adopt/implement.',
    });
  }

  return {
    ok: true,
    webOk,
    provider: provider || (tried[0] || ''),
    tried,
    findings,
    ms: Date.now() - t0,
  };
}

/** Wave 17 — implement checklist for an approved proposal (no auto code push) */
export function implementChecklist(proposal) {
  const p = proposal || {};
  const id = p.id ? String(p.id).slice(0, 8) : '????';
  const title = p.title || 'Proposal';
  return {
    proposal_id: p.id,
    title,
    steps: [
      { n: 1, text: 'Confirm proposal approved (`lab adopt ' + id + '`)', done: p.status === 'approved' },
      { n: 2, text: 'Paste proposal + constraints to Grok for safe ZIP', done: false },
      { n: 3, text: 'Upload files via Telegram `gh` (caption on same message)', done: false },
      { n: 4, text: 'Single Vercel redeploy', done: false },
      { n: 5, text: 'Run `qa probe` — must ALL PASS', done: false },
      { n: 6, text: 'Run `health` + `lab status`', done: false },
      { n: 7, text: 'Run feature-specific tests from proposal summary', done: false },
      { n: 8, text: 'If fail: `qa scan` + open tickets — do not stack more deploys', done: false },
      { n: 9, text: 'Mark complete in chat / close related QA tickets', done: false },
    ],
    rollback: 'Redeploy previous Git commit; keep CRON_SECRET/env unchanged; re-run qa probe.',
    risk: p.risk || 'Unknown — treat as yellow until verified.',
  };
}

export function formatImplementChecklist(c) {
  if (!c) return 'No checklist';
  const lines = [
    '🛠 *Implement checklist · 14E*',
    'Proposal: `' + String(c.proposal_id || '').slice(0, 8) + '`',
    '*' + (c.title || '') + '*',
    '',
  ];
  for (const s of c.steps || []) {
    lines.push((s.done ? '✅' : '☐') + ' ' + s.n + '. ' + s.text);
  }
  lines.push('');
  lines.push('*Rollback:* ' + (c.rollback || '—'));
  lines.push('*Risk:* ' + (c.risk || '—'));
  lines.push('');
  lines.push('_No auto git push. Founder + Grok path only._');
  return lines.join('\n');
}



/** Wave 17C — short Founder digest */

/** Wave 17 — seed Lab proposals from Supabase product updates (Founder email digest) */
export async function seedSupabaseIdeas({ force = false } = {}) {
  const ideas = [
    {
      title: 'Supabase + Make MCP automation bridge',
      summary:
        'Supabase now works with Make via MCP: scenarios can query data and create rows. Map Queen OS events (QA tickets, bank txs, shadow tasks) to Make scenarios without new Vercel functions.',
      category: 'integration',
      risk: 'Keep using webhook mode on free Make plan; avoid paid API-only features.',
    },
    {
      title: 'Supabase Knowledge Base for agent troubleshooting',
      summary:
        'Use Supabase public Knowledge Base (beta) as a source list for Research Net when diagnosing RLS, auth, and storage issues. Add links into lab research topics.',
      category: 'research',
      risk: 'External docs change; always verify against current project settings.',
    },
    {
      title: 'Stripe Data Pipeline → Private Bank (optional)',
      summary:
        'Stripe can sync charges/customers/subscriptions into Supabase schema stripe_sdp_data. Only adopt if Queen OS adds real payments; otherwise skip to stay free-tier.',
      category: 'future',
      risk: 'Not free-critical; ignore until payments exist.',
    },
    {
      title: 'Incident-aware status checks',
      summary:
        'Supabase status moved to incident.io. Health/monitor docs should link new status page; optional webhook subscribe later for downtime alerts into QA tickets.',
      category: 'ops',
      risk: 'Resubscribe SMS/Slack if previously used.',
    },
  ];
  const existing = await listProposals({ status: 'all', limit: 40 });
  const titles = new Set((existing || []).map((p) => String(p.title || '').toLowerCase()));
  const created = [];
  for (const idea of ideas) {
    if (!force && titles.has(idea.title.toLowerCase())) continue;
    const r = await createProposal(idea);
    if (r.ok) created.push(r.proposal?.id || idea.title);
  }
  return { ok: true, created: created.length, ids: created };
}

export async function generateFounderDigest() {
  const t0 = Date.now();
  const lines = ['👑 *Founder Digest · 16C*', ''];
  try {
    const h = await import('./healthManager.js');
    const fn = h.runHealthCheck || h.healthCheck || h.checkAll;
    if (typeof fn === 'function') {
      const r = await fn();
      lines.push('*Health*');
      lines.push(String(r.summary || r.text || 'ok').slice(0, 400));
      lines.push('');
    }
  } catch (e) {
    lines.push('*Health* ⚠️ ' + (e.message || e));
    lines.push('');
  }
  try {
    const qa = await import('./qaEngine.js');
    if (typeof qa.runRouteProbe === 'function') {
      const probe = await qa.runRouteProbe({ openTickets: false });
      lines.push('*Route probe*');
      lines.push((probe.ok ? '✅' : '❌') + ' ' + probe.passed + '/' + probe.total + ' · ' + probe.ms + 'ms');
      lines.push('');
    }
    const open = await qa.listTickets({ status: 'open', limit: 5 });
    lines.push('*QA open:* ' + open.length);
    for (const t of open.slice(0, 3)) {
      lines.push('· [' + (t.severity || '') + '] ' + String(t.title || '').slice(0, 40));
    }
    lines.push('');
  } catch (_) {}
  const props = await listProposals({ status: 'proposed', limit: 5 });
  lines.push('*Proposals:* ' + props.length);
  for (const p of props.slice(0, 3)) {
    lines.push('· `' + String(p.id).slice(0, 8) + '` ' + String(p.title || '').slice(0, 40));
  }
  lines.push('');
  lines.push('_Next: lab research run · lab implement <id> · qa probe_');
  lines.push('_' + (Date.now() - t0) + 'ms_');
  const body = lines.join('\n');
  await saveReport(body, { kind: 'digest', ms: Date.now() - t0, phase: '16C' });
  return { ok: true, body, ms: Date.now() - t0 };
}

export async function generateDailyReport() {
  const t0 = Date.now();
  const lines = [
    '🧪 *Lab Daily Brief · 14B*',
    `Nation map: ${LAB_NATION.length} · Research: ${RESEARCH_NET.length}`,
    '',
    '*Mandate (short)*',
    LAB_MANDATE.split('\n')
      .slice(0, 4)
      .map((x) => '· ' + x)
      .join('\n'),
    '',
  ];

  try {
    const h = await import('./healthManager.js');
    const fn = h.runHealthCheck || h.healthCheck || h.checkAll;
    if (typeof fn === 'function') {
      const r = await fn();
      lines.push('*Health*');
      lines.push(String(r.summary || r.text || 'ok').slice(0, 500));
      lines.push('');
    }
  } catch (e) {
    lines.push('*Health* ⚠️ ' + (e.message || e));
    lines.push('');
  }

  try {
    const qa = await import('./qaEngine.js');
    if (typeof qa.runRouteProbe === 'function') {
      const probe = await qa.runRouteProbe({ openTickets: true });
      lines.push('*Route probe*');
      lines.push(`${probe.ok ? '✅' : '❌'} ${probe.passed}/${probe.total} · ${probe.ms}ms`);
      if (!probe.ok) {
        for (const x of (probe.results || []).filter((r) => !r.pass)) {
          lines.push(`· FAIL ${x.cmd}: ${x.reason}`);
        }
      }
      lines.push('');
    }
    const open = await qa.listTickets({ status: 'open', limit: 5 });
    lines.push(`*QA open tickets:* ${open.length}`);
    lines.push('');
  } catch (_) {}

  const props = await listProposals({ status: 'proposed', limit: 5 });
  lines.push('*Proposals*');
  if (!props.length) lines.push('· none');
  else for (const p of props) lines.push(`· \`${String(p.id).slice(0, 8)}\` ${String(p.title).slice(0, 50)}`);
  lines.push('');
  lines.push('*Gates registered:* ' + HARD_GATE_ORDER.length);
  lines.push(`_Generated ${Date.now() - t0}ms_`);

  const body = lines.join('\n');
  await saveReport(body, { ms: Date.now() - t0, phase: '14B', kind: 'daily' });
  return { ok: true, body, chunks: chunkText(body), ms: Date.now() - t0 };
}

/** Deliver report chunks to Telegram chat (14C) */
export async function deliverReportToChat(chatId, body) {
  const token = process.env.BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
  if (!token || !chatId) return { ok: false, error: 'missing token/chat' };
  const chunks = chunkText(body, 3500);
  const results = [];
  for (let i = 0; i < chunks.length; i++) {
    const prefix = chunks.length > 1 ? `(${i + 1}/${chunks.length})\n` : '';
    const text = prefix + chunks[i];
    try {
      const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: text.slice(0, 4000),
          disable_web_page_preview: true,
        }),
      });
      results.push({ i, status: r.status, ok: r.ok });
    } catch (e) {
      results.push({ i, ok: false, error: e.message || String(e) });
    }
  }
  return { ok: results.every((x) => x.ok), chunks: chunks.length, results };
}

/** Cron entry — lab daily */
export async function runLabDailyCron() {
  const report = await generateDailyReport();
  let research = null;
  try {
    research = await runResearchPulse();
  } catch (e) {
    research = { ok: false, error: e.message || String(e) };
  }
  const chatId = process.env.ADMIN_ID || process.env.FOUNDER_ID || process.env.LAB_CHAT_ID;
  let delivery = null;
  if (chatId) {
    delivery = await deliverReportToChat(String(chatId).split(/[\s,]+/)[0], report.body);
  }
  return {
    ok: true,
    job: 'labdaily',
    report_ms: report.ms,
    chunks: report.chunks?.length || 1,
    research_ok: research?.ok,
    delivery,
  };
}

export default {
  LAB_MANDATE,
  HARD_GATE_ORDER,
  RESEARCH_NET,
  LAB_NATION,
  labHelp,
  labStatus,
  listProposals,
  createProposal,
  setProposalStatus,
  saveReport,
  chunkText,
  formatResearchList,
  formatNation,
  formatGates,
  runResearchPulse,
  implementChecklist,
  formatImplementChecklist,
  generateDailyReport,
  generateFounderDigest,
  seedSupabaseIdeas,
  deliverReportToChat,
  runLabDailyCron,
  nationSummary,
};
