/**
 * Wave 14B/C/D — Lab research + chunked reports + 500 roster map
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
    '*Agent Laboratory · Wave 14B/C/D*\n' +
    `Research Net: *${RESEARCH_NET.length}* · Lab Nation map: *${LAB_NATION.length}*\n\n` +
    '• `lab help` / `lab status` / `lab mandate`\n' +
    '• `lab research` — Research 50 list\n' +
    '• `lab nation` — 500 duty map summary\n' +
    '• `lab gates` — ordered hard-gate prefixes\n' +
    '• `lab propose Title | Summary`\n' +
    '• `lab proposals` / `lab adopt <id>`\n' +
    '• `lab report` — daily brief (chunk-ready)\n' +
    '• `lab research run` — web-backed research pulse (14B)\n' +
    '• Cron: `/api/cron?job=labdaily&secret=...`\n\n' +
    '_Code changes still require Founder + Grok ZIP path._'
  );
}

export function labStatus() {
  const n = nationSummary();
  return {
    ok: true,
    phase: '14B/C/D',
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
    'Vercel serverless best practices 2025 free tier limits',
    'Supabase RLS patterns multi tenant bots',
    'Telegram bot architecture node.js production',
  ];
  const findings = [];
  let webOk = false;

  try {
    const ws = await import('./webSearch.js');
    const fn = ws.webSearch || ws.search || ws.tavilySearch || ws.default;
    if (typeof fn === 'function') {
      webOk = true;
      for (const topic of topics) {
        try {
          const r = await fn(topic, { maxResults: 3 });
          const text =
            typeof r === 'string'
              ? r
              : r?.answer ||
                (Array.isArray(r?.results)
                  ? r.results.map((x) => x.title || x.content || '').join(' | ')
                  : JSON.stringify(r).slice(0, 400));
          findings.push({ topic, snippet: String(text).slice(0, 500) });
        } catch (e) {
          findings.push({ topic, snippet: 'search error: ' + (e.message || e) });
        }
      }
    }
  } catch (_) {
    webOk = false;
  }

  if (!webOk) {
    findings.push({
      topic: 'offline-mode',
      snippet:
        'webSearch module unavailable — stored structural proposals only. Enable Tavily for live research.',
    });
  }

  // Auto-file one proposal from first finding
  const first = findings[0];
  if (first) {
    await createProposal({
      title: 'Research pulse: ' + first.topic.slice(0, 80),
      summary: first.snippet,
      category: 'research',
      sources: first.topic,
      risk: 'Review before any code change; may be generic web noise.',
    });
  }

  return {
    ok: true,
    webOk,
    findings,
    ms: Date.now() - t0,
  };
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
  generateDailyReport,
  deliverReportToChat,
  runLabDailyCron,
  nationSummary,
};
