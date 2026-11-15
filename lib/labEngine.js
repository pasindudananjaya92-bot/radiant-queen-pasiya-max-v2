/**
 * Wave 14A — Agent Laboratory foundation
 * Research Net (50) + proposals store + daily report skeleton.
 * Mandate: continuously find safer upgrades; Founder approves before code changes.
 */

import { createClient } from '@supabase/supabase-js';

function sb() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

/** Research Net — 50 scouts (metadata; work via think/web later in 14B+) */
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
    wing: 'research',
    role,
    mandate: 'Seek durable upgrades; propose only; never silent production breaks.',
  }));
}

export const RESEARCH_NET = buildResearchRoster();

export const LAB_MANDATE = [
  'Primary duty: raise Radiant Queen OS safely every day.',
  'Search the public web and known stack docs for better patterns.',
  'Compare ideas to CURRENT system constraints (Vercel Hobby, mobile-only Founder, 12 functions).',
  'Output proposals with: benefit, steps, risks, rollback.',
  'NEVER push code without Founder approval (lab adopt / Grok path).',
  'Prefer free-tier compatible, reversible changes.',
  'One consolidated Telegram report per day (chunked if long).',
].join('\n');

export function labHelp() {
  return (
    '*Agent Laboratory · Wave 14A*\n' +
    'Research Net: *' +
    RESEARCH_NET.length +
    '* · Proposals + daily report foundation\n\n' +
    '• `lab help` — menu\n' +
    '• `lab status` — lab + research roster\n' +
    '• `lab mandate` — standing orders\n' +
    '• `lab research` — list Research Net (50)\n' +
    '• `lab proposals` — open proposals\n' +
    '• `lab propose <title> | <summary>` — file a proposal\n' +
    '• `lab report` — generate daily lab brief (14A local)\n' +
    '• `lab adopt <id>` — Founder marks proposal approved (no auto-code)\n\n' +
    '_14B: scheduled daily research + web-backed proposals_\n' +
    '_14C: chunked Telegram delivery + safe implement pipeline_'
  );
}

export function labStatus() {
  return {
    ok: true,
    research: RESEARCH_NET.length,
    mandate: true,
    phase: '14A',
  };
}

export async function listProposals({ status = 'proposed', limit = 10 } = {}) {
  const client = sb();
  if (!client) return [];
  let q = client
    .from('rq_lab_proposals')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (status && status !== 'all') q = q.eq('status', status);
  const { data } = await q;
  return data || [];
}

export async function createProposal({ title, summary, category = 'upgrade', risk = '' }) {
  const client = sb();
  const row = {
    title: String(title || 'Untitled').slice(0, 200),
    summary: String(summary || '').slice(0, 4000),
    category: String(category || 'upgrade').slice(0, 40),
    severity: 'info',
    status: 'proposed',
    risk: String(risk || '').slice(0, 1000),
    steps: '1. Founder review\n2. Grok implements ZIP\n3. Mobile upload + redeploy\n4. Health + QA scan',
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
    .insert({ kind: 'daily', body: String(body).slice(0, 20000), meta })
    .select('*')
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, report: data };
}

/** 14A daily brief — system snapshot + research posture (web deep-dive = 14B) */
export async function generateDailyReport() {
  const t0 = Date.now();
  const lines = [
    '🧪 *Lab Daily Brief · 14A*',
    '_Research Net standing by · web deep-scan expands in 14B_',
    '',
    '*Mandate*',
    LAB_MANDATE.split('\n')
      .slice(0, 3)
      .map((x) => '· ' + x)
      .join('\n'),
    '',
  ];

  // Health
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

  // QA open
  try {
    const qa = await import('./qaEngine.js');
    const open = await qa.listTickets({ status: 'open', limit: 5 });
    const leg = qa.legionSummary();
    lines.push('*QA Legion*');
    lines.push(`Roster ${leg.total} · Open tickets ${open.length}`);
    for (const t of open.slice(0, 3)) {
      lines.push(`· [${t.severity}] ${t.wing} — ${String(t.title || '').slice(0, 40)}`);
    }
    lines.push('');
  } catch (_) {}

  // Proposals
  const props = await listProposals({ status: 'proposed', limit: 5 });
  lines.push('*Open proposals*');
  if (!props.length) lines.push('· none — use `lab propose title | summary`');
  else {
    for (const p of props) {
      lines.push(`· \`${String(p.id).slice(0, 8)}\` ${String(p.title).slice(0, 50)}`);
    }
  }
  lines.push('');
  lines.push('*Research Net*');
  lines.push(`${RESEARCH_NET.length} scouts · sample: ${RESEARCH_NET.slice(0, 3).map((a) => a.id).join(', ')}`);
  lines.push('');
  lines.push('*Next (automated path)*');
  lines.push('1. Daily web research (14B cron)');
  lines.push('2. Chunked Telegram report (14C)');
  lines.push('3. Founder `lab adopt` → Grok ZIP → upload → verify');
  lines.push('');
  lines.push(`_Generated in ${Date.now() - t0}ms_`);

  const body = lines.join('\n');
  await saveReport(body, { ms: Date.now() - t0, phase: '14A' });
  return { ok: true, body, ms: Date.now() - t0 };
}

export function formatResearchList() {
  const lines = [
    '🔭 *Research Net · 50*',
    '_Find upgrades · propose only · Founder approves_',
    '',
  ];
  for (const a of RESEARCH_NET) {
    lines.push(`\`${a.id}\` · ${a.role}`);
  }
  return lines.join('\n');
}

export default {
  RESEARCH_NET,
  LAB_MANDATE,
  labHelp,
  labStatus,
  listProposals,
  createProposal,
  setProposalStatus,
  saveReport,
  generateDailyReport,
  formatResearchList,
};
