/**
 * Wave 13A/B — QA Legion (Self-Healing Test Army) foundation
 * 50-agent roster in ONE lib module (not 50 serverless functions).
 * Active workers stay tiny; roster is the "nation brain".
 */

import { createClient } from '@supabase/supabase-js';

function sb() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

/** 10 wings × 5 agents = 50 (metadata only — no extra Vercel functions) */
export const QA_LEGION = [
  // Syntax Gate
  { id: 'SYN-01', wing: 'syntax', role: 'Paren Balance' },
  { id: 'SYN-02', wing: 'syntax', role: 'Unexpected Token' },
  { id: 'SYN-03', wing: 'syntax', role: 'Missing Catch/Finally' },
  { id: 'SYN-04', wing: 'syntax', role: 'Import/Export' },
  { id: 'SYN-05', wing: 'syntax', role: 'Template Literal' },
  // Route Guard
  { id: 'RTE-01', wing: 'route', role: 'Prefix Intercept' },
  { id: 'RTE-02', wing: 'route', role: 'Hallucination Block' },
  { id: 'RTE-03', wing: 'route', role: 'Caption/Document Path' },
  { id: 'RTE-04', wing: 'route', role: 'Voice Transcript Route' },
  { id: 'RTE-05', wing: 'route', role: 'Fallthrough Detector' },
  // API / Env
  { id: 'API-01', wing: 'api', role: '401/403 Rights' },
  { id: 'API-02', wing: 'api', role: 'Timeout Soft Guard' },
  { id: 'API-03', wing: 'api', role: 'Missing Env' },
  { id: 'API-04', wing: 'api', role: 'Rate Limit' },
  { id: 'API-05', wing: 'api', role: 'Webhook 410' },
  // Supabase
  { id: 'SB-01', wing: 'supabase', role: 'RLS Policy' },
  { id: 'SB-02', wing: 'supabase', role: 'Missing Table' },
  { id: 'SB-03', wing: 'supabase', role: 'Column Drift' },
  { id: 'SB-04', wing: 'supabase', role: 'Storage Bucket' },
  { id: 'SB-05', wing: 'supabase', role: 'Service Role Hygiene' },
  // Telegram UX
  { id: 'TG-01', wing: 'telegram', role: 'Empty Reply' },
  { id: 'TG-02', wing: 'telegram', role: 'Double Reply' },
  { id: 'TG-03', wing: 'telegram', role: 'Markdown Parse Fail' },
  { id: 'TG-04', wing: 'telegram', role: 'TTS Leak Text' },
  { id: 'TG-05', wing: 'telegram', role: 'Caption Handler' },
  // Dashboard UI
  { id: 'UI-01', wing: 'dashboard', role: 'Dead Button' },
  { id: 'UI-02', wing: 'dashboard', role: 'Empty List' },
  { id: 'UI-03', wing: 'dashboard', role: 'SW Cache Stale' },
  { id: 'UI-04', wing: 'dashboard', role: 'Auth Gate' },
  { id: 'UI-05', wing: 'dashboard', role: 'Tab State Loss' },
  // Evidence / Think
  { id: 'EV-01', wing: 'evidence', role: 'Tool Overuse' },
  { id: 'EV-02', wing: 'evidence', role: 'False HIGH Trust' },
  { id: 'EV-03', wing: 'evidence', role: 'Irrelevant Evidence' },
  { id: 'EV-04', wing: 'evidence', role: 'Retry Hallucination' },
  { id: 'EV-05', wing: 'evidence', role: 'Long-Text Summary' },
  // Deploy / Vercel
  { id: 'DEP-01', wing: 'deploy', role: '12 Function Cap' },
  { id: 'DEP-02', wing: 'deploy', role: 'Deploy/Day Cap' },
  { id: 'DEP-03', wing: 'deploy', role: '10s Timeout' },
  { id: 'DEP-04', wing: 'deploy', role: 'Bundle Size' },
  { id: 'DEP-05', wing: 'deploy', role: 'Cold Start' },
  // Security
  { id: 'SEC-01', wing: 'security', role: 'Secret Leak Scan' },
  { id: 'SEC-02', wing: 'security', role: 'Founder Gate' },
  { id: 'SEC-03', wing: 'security', role: 'DASH Auth' },
  { id: 'SEC-04', wing: 'security', role: 'Token Scope' },
  { id: 'SEC-05', wing: 'security', role: 'Redaction' },
  // Scribe / Report
  { id: 'SCR-01', wing: 'scribe', role: 'Ticket Summary' },
  { id: 'SCR-02', wing: 'scribe', role: 'Risk List' },
  { id: 'SCR-03', wing: 'scribe', role: 'Next Action' },
  { id: 'SCR-04', wing: 'scribe', role: 'Founder Brief' },
  { id: 'SCR-05', wing: 'scribe', role: 'Legion Status' },
];

export function classifyIssue(text = '') {
  const s = String(text || '').toLowerCase();
  if (/syntax|missing \)|unexpected token|paren|balanceok|unbalanced/.test(s))
    return { wing: 'syntax', agents: ['SYN-01', 'SYN-02'], severity: 'red' };
  if (/does not exist|fallthrough|hallucin|route miss|command/.test(s))
    return { wing: 'route', agents: ['RTE-01', 'RTE-02', 'RTE-05'], severity: 'red' };
  if (/401|403|timeout|env|rate limit|410/.test(s))
    return { wing: 'api', agents: ['API-01', 'API-02', 'API-03'], severity: 'yellow' };
  if (/rls|relation|column|supabase|bucket/.test(s))
    return { wing: 'supabase', agents: ['SB-01', 'SB-02', 'SB-03'], severity: 'yellow' };
  if (/empty reply|double|markdown|tts|caption/.test(s))
    return { wing: 'telegram', agents: ['TG-01', 'TG-02', 'TG-04'], severity: 'yellow' };
  if (/button|dashboard|cache|sw\.js|login/.test(s))
    return { wing: 'dashboard', agents: ['UI-01', 'UI-03', 'UI-04'], severity: 'yellow' };
  if (/trust|evidence|tool|doc_ask|web_search/.test(s))
    return { wing: 'evidence', agents: ['EV-01', 'EV-02', 'EV-03'], severity: 'yellow' };
  if (/deploy|function limit|hobby|vercel|10s|serverless/.test(s))
    return { wing: 'deploy', agents: ['DEP-01', 'DEP-02', 'DEP-03'], severity: 'yellow' };
  if (/secret|token|founder|unauthorized|dash_secret/.test(s))
    return { wing: 'security', agents: ['SEC-01', 'SEC-02', 'SEC-03'], severity: 'red' };
  return { wing: 'scribe', agents: ['SCR-01', 'SCR-03'], severity: 'white' };
}

export function legionSummary() {
  const by = {};
  for (const a of QA_LEGION) {
    by[a.wing] = by[a.wing] || [];
    by[a.wing].push(a);
  }
  const wings = Object.keys(by);
  return {
    total: QA_LEGION.length,
    wings: wings.length,
    byWing: by,
  };
}

export async function openTicket({ title, detail, fingerprint }) {
  const cls = classifyIssue(`${title} ${detail}`);
  const client = sb();
  const row = {
    title: String(title || 'QA ticket').slice(0, 200),
    wing: cls.wing,
    severity: cls.severity,
    status: 'open',
    fingerprint: String(fingerprint || title || '').slice(0, 120),
    detail: String(detail || '').slice(0, 2000),
    assigned_agents: cls.agents,
  };
  if (!client) {
    return { ok: true, offline: true, ticket: { id: 'offline', ...row } };
  }
  // de-dupe open same fingerprint
  try {
    const { data: existing } = await client
      .from('rq_qa_tickets')
      .select('*')
      .eq('status', 'open')
      .eq('fingerprint', row.fingerprint)
      .limit(1);
    if (existing && existing[0]) {
      return { ok: true, ticket: existing[0], deduped: true };
    }
    const { data, error } = await client.from('rq_qa_tickets').insert(row).select('*').single();
    if (error) return { ok: false, error: error.message };
    return { ok: true, ticket: data };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

export async function listTickets({ status = 'open', limit = 10 } = {}) {
  const client = sb();
  if (!client) return [];
  let q = client.from('rq_qa_tickets').select('*').order('created_at', { ascending: false }).limit(limit);
  if (status && status !== 'all') q = q.eq('status', status);
  const { data } = await q;
  return data || [];
}

export async function getTicket(id) {
  const client = sb();
  if (!client) return null;
  const { data } = await client.from('rq_qa_tickets').select('*').eq('id', id).maybeSingle();
  return data;
}

export async function setTicketStatus(id, status, resolution = '') {
  const client = sb();
  if (!client) return { ok: false, error: 'no db' };
  const { data, error } = await client
    .from('rq_qa_tickets')
    .update({
      status,
      resolution: resolution || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('*')
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, ticket: data };
}

/** Lightweight scan — no heavy LLM (Hobby-safe) */
export async function runQaScan() {
  const t0 = Date.now();
  const findings = [];
  // Pipeline fails
  try {
    const pe = await import('./pipelineEngine.js');
    const fails = await pe.failAlerts(8);
    if (fails.count > 0) {
      findings.push({
        source: 'pipeline',
        title: `${fails.count} pipeline fail(s)`,
        detail: fails.items
          .slice(0, 3)
          .map((x) => `${x.family}: ${x.raw_text}`)
          .join(' | '),
      });
    }
  } catch (e) {
    findings.push({ source: 'pipeline', title: 'pipeline scan error', detail: e.message || String(e) });
  }
  // Sentinel snapshot (if available)
  try {
    const se = await import('./sentinelEngine.js');
    if (typeof se.runScan === 'function') {
      const r = await se.runScan();
      if (r && (r.critical > 0 || r.warn > 0)) {
        findings.push({
          source: 'sentinel',
          title: `Sentinel score ${r.score}/100`,
          detail: `critical=${r.critical} warn=${r.warn}`,
        });
      }
    } else if (typeof se.scan === 'function') {
      const r = await se.scan();
      if (r && r.score != null && r.score < 80) {
        findings.push({ source: 'sentinel', title: `Sentinel ${r.score}/100`, detail: JSON.stringify(r).slice(0, 200) });
      }
    }
  } catch (_) {}
  // Health
  try {
    const h = await import('./healthManager.js');
    const fn = h.runHealthCheck || h.healthCheck || h.checkAll;
    if (typeof fn === 'function') {
      const r = await fn();
      const checks = r.checks || r.results || [];
      const down = (checks || []).filter((c) => c.ok === false || c.status === 'down');
      if (down.length) {
        findings.push({
          source: 'health',
          title: `${down.length} service(s) down`,
          detail: down.map((c) => c.name || c.id).join(', '),
        });
      }
    }
  } catch (_) {}

  const tickets = [];
  for (const f of findings) {
    const t = await openTicket({
      title: f.title,
      detail: `[${f.source}] ${f.detail || ''}`,
      fingerprint: `${f.source}:${String(f.title).slice(0, 80)}`,
    });
    if (t.ok && t.ticket) tickets.push(t.ticket);
  }

  return {
    ok: true,
    ms: Date.now() - t0,
    findings: findings.length,
    tickets_opened: tickets.length,
    tickets,
    clean: findings.length === 0,
  };
}

export function formatLegion() {
  const s = legionSummary();
  const lines = [`⚔ *QA Legion · 13A*`, `Roster: *${s.total}* agents · Wings: *${s.wings}*`, ''];
  for (const [wing, agents] of Object.entries(s.byWing)) {
    lines.push(`*${wing}* (${agents.length})`);
    lines.push(agents.map((a) => `\`${a.id}\``).join(' '));
  }
  lines.push('');
  lines.push('_Active workers = few. Roster scales without new api/*.js files._');
  return lines.join('\n');
}

export function qaHelp() {
  return (
    '*QA Legion · Wave 13A/B*\n' +
    'Self-healing test army (roster 50 · 1 lib module)\n\n' +
    '• `qa help` — menu\n' +
    '• `qa status` — open tickets summary\n' +
    '• `qa legion` — full 50-agent roster\n' +
    '• `qa scan` — pipeline + sentinel + health sweep\n' +
    '• `qa last` — recent tickets\n' +
    '• `qa ticket <id>` — ticket detail\n' +
    '• `qa close <id>` — close ticket\n\n' +
    '_13B: auto-open on pipeline fail + gh syntax block_'
  );
}

export default {
  QA_LEGION,
  classifyIssue,
  legionSummary,
  openTicket,
  listTickets,
  getTicket,
  setTicketStatus,
  runQaScan,
  formatLegion,
  qaHelp,
};
