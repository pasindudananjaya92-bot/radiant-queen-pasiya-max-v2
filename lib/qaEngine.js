/**
 * Wave 13F — QA Legion (Self-Healing Test Army) foundation
 * 200-agent roster in ONE lib module (not 50 serverless functions).
 * Active workers stay tiny; roster is the "nation brain".
 */

import { createClient } from '@supabase/supabase-js';

function sb() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}


/** Wave 13F — 200+ roster metadata in ONE module (no extra api/*.js) */
const WING_ROLES = {
  syntax: [
    'Paren Balance', 'Unexpected Token', 'Missing Catch/Finally', 'Import/Export', 'Template Literal',
    'Async Await', 'Optional Chaining', 'Class Body', 'Object Literal', 'Array Literal',
    'Arrow Function', 'Default Export', 'Named Export', 'Dynamic Import', 'JSON Parse Guard',
    'Regex Literal', 'Comment Strip', 'Semicolon Insert', 'Spread Rest', 'Destructure',
  ],
  route: [
    'Prefix Intercept', 'Hallucination Block', 'Caption/Document Path', 'Voice Transcript Route', 'Fallthrough Detector',
    'Hard Gate Order', 'Founder Private Only', 'Group Silence', 'Command Alias Map', 'Slash Normalize',
    'Mission Family', 'Pipeline Family', 'QA Family', 'Think Family', 'Cron Family',
    'Drive Family', 'Bank Family', 'Shadow Family', 'Mail Family', 'Health Family',
  ],
  api: [
    '401/403 Rights', 'Timeout Soft Guard', 'Missing Env', 'Rate Limit', 'Webhook 410',
    'JSON Parse', 'AbortSignal', 'Retry Backoff', 'Provider Fallback', 'Header Auth',
    'Make Webhook', 'Tavily Quota', 'Groq Limit', 'Gemini Fallback', 'OpenRouter Failover',
    'Resend Mail', 'TTS Path', 'SnapDeploy Cap', 'Cron-job.org', 'Sentry DSN',
  ],
  supabase: [
    'RLS Policy', 'Missing Table', 'Column Drift', 'Storage Bucket', 'Service Role Hygiene',
    'Index Health', 'UUID Keys', 'Timestamps', 'Null Constraints', 'Unique Fingerprint',
    'Pipeline Log', 'QA Tickets', 'Think Jobs', 'Shadow Tasks', 'Bank Rows',
    'Memory Rows', 'Vault Paths', 'pgvector', 'Connection Pool', 'Query Timeout',
  ],
  telegram: [
    'Empty Reply', 'Double Reply', 'Markdown Parse Fail', 'TTS Leak Text', 'Caption Handler',
    'Document MIME', 'Photo Caption', 'Voice OGG', 'Inline Keyboard', 'Reply Markup',
    'Chat ID Resolve', 'Founder ID Gate', 'Group Anti-Link', 'Message Length 4096', 'Split Long Reply',
    'Sticker Ignore', 'Callback Query', 'Edited Message', 'Forward Noise', 'Bot Command Menu',
  ],
  dashboard: [
    'Dead Button', 'Empty List', 'SW Cache Stale', 'Auth Gate', 'Tab State Loss',
    'API JSON Parse', 'Toast Errors', 'PWA Install', 'Lab Filter', 'QA Panel',
    'War Room Load', 'Cron Toggle', 'Bank Chart', 'Drive List', 'Chat Scroll',
    'Secret Mask', 'Remember Me Cookie', 'Version Badge', 'Offline Shell', 'Mobile Viewport',
  ],
  evidence: [
    'Tool Overuse', 'False HIGH Trust', 'Irrelevant Evidence', 'Retry Hallucination', 'Long-Text Summary',
    'Doc Intent Lock', 'Web Consensus', 'Mem Relevance', 'Health Scope', 'Vault Scope',
    'Cache Hit', 'Soft Timeout Partial', 'Trust Floor 20', 'Source Agreement', 'Recency Weight',
    'Planner Constraints', 'Tool Registry', 'Hull B Queue', 'Think Trace', 'Direct LLM Summary',
  ],
  deploy: [
    '12 Function Cap', 'Deploy/Day Cap', '10s Timeout', 'Bundle Size', 'Cold Start',
    'Env Drift', 'Node Version', 'Package Lock', 'Edge vs Node', 'Cron Path',
    'Dash Consolidation', 'Telegram Bundle', 'Import Cycle', 'Tree Shake', 'Source Map',
    'Hobby Sleep', 'Region Latency', 'Build Cache', 'GitHub Push', 'Redeploy Hook',
  ],
  security: [
    'Secret Leak Scan', 'Founder Gate', 'DASH Auth', 'Token Scope', 'Redaction',
    'Service Role Server-Only', 'No Eval', 'Path Traversal', 'SQL Dangerous', 'CORS',
    'Webhook Secret', 'Cron Secret', 'Bot Token Hygiene', 'API Key Rotation', 'Log Scrub',
    'Ticket Fingerprint', 'PII Mask', 'Session Cookie', 'OAuth Optional', 'Audit Trail',
  ],
  scribe: [
    'Ticket Summary', 'Risk List', 'Next Action', 'Founder Brief', 'Legion Status',
    'Morning Pack Note', 'Scan Report', 'Playbook Attach', 'Severity Label', 'Wing Label',
    'Close Note', 'Dedup Notice', 'Timeline', 'Metrics Snapshot', 'Alert Digest',
    'Change Log', 'Test Checklist', 'Upload Order', 'Rollback Hint', 'Seal Summary',
  ],
};

function buildLegion() {
  const out = [];
  for (const [wing, roles] of Object.entries(WING_ROLES)) {
    const prefix =
      wing === 'syntax'
        ? 'SYN'
        : wing === 'route'
          ? 'RTE'
          : wing === 'api'
            ? 'API'
            : wing === 'supabase'
              ? 'SB'
              : wing === 'telegram'
                ? 'TG'
                : wing === 'dashboard'
                  ? 'UI'
                  : wing === 'evidence'
                    ? 'EV'
                    : wing === 'deploy'
                      ? 'DEP'
                      : wing === 'security'
                        ? 'SEC'
                        : 'SCR';
    roles.forEach((role, i) => {
      const n = String(i + 1).padStart(2, '0');
      out.push({ id: `${prefix}-${n}`, wing, role, tier: i < 5 ? 'core' : 'extended' });
    });
  }
  return out;
}

/** 10 wings × 20 roles = 200 agents (metadata only) */
export const QA_LEGION = buildLegion();

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
  let core = 0;
  for (const a of QA_LEGION) {
    by[a.wing] = by[a.wing] || [];
    by[a.wing].push(a);
    if (a.tier === 'core') core += 1;
  }
  const wings = Object.keys(by);
  return {
    total: QA_LEGION.length,
    wings: wings.length,
    core,
    extended: QA_LEGION.length - core,
    byWing: by,
  };
}


/** Wave 13C — deterministic playbook suggestions (no extra LLM) */
export function suggestPlaybook({ wing, title = '', detail = '', severity = '' } = {}) {
  const blob = `${wing} ${title} ${detail} ${severity}`.toLowerCase();
  const steps = [];
  let name = 'general_triage';

  if (wing === 'syntax' || /syntax|unbalanced|paren|unhealed/.test(blob)) {
    name = 'syntax_gate_fix';
    steps.push(
      'Send the .js file again with caption on the SAME message: `gh path/to/file.js`',
      'Run `codeswarm triage <paste error>` for kind + line',
      'Fix brackets/parens near the reported line; re-upload with caption',
      'If still blocked, paste the exact bot error to Founder/Grok'
    );
  } else if (wing === 'route' || /hallucin|fallthrough|does not exist/.test(blob)) {
    name = 'route_intercept';
    steps.push(
      'Confirm prefix is in telegram.js + agentExecute hard gate',
      'Redeploy after uploading routes + agentExecute + telegram.js',
      'Test command should NOT reach the AI LLM'
    );
  } else if (wing === 'api' || /401|403|timeout|env/.test(blob)) {
    name = 'api_env_check';
    steps.push(
      'Check Vercel env vars for the service',
      'Confirm free-plan limits (Make API, Snap quota)',
      'Retry after redeploy; check Sentry if configured'
    );
  } else if (wing === 'supabase' || /rls|relation|column/.test(blob)) {
    name = 'supabase_schema';
    steps.push(
      'Run the matching sql/*.sql in Supabase SQL editor',
      'Confirm SUPABASE_SERVICE_ROLE_KEY on Vercel (server only)',
      'Re-test the command that failed'
    );
  } else if (wing === 'telegram') {
    name = 'telegram_ux';
    steps.push(
      'Check double-reply / parse_mode fallback paths',
      'For documents: caption must be on the document message',
      'Test /ping to confirm bot alive'
    );
  } else if (wing === 'dashboard') {
    name = 'dashboard_cache';
    steps.push(
      'Hard refresh dashboard.html?v=new',
      'Clear service worker if UI shell is stale',
      'Verify api/dash.js action returns JSON'
    );
  } else if (wing === 'evidence') {
    name = 'evidence_routing';
    steps.push(
      'Re-run with stricter intent (doc-only vs web-only)',
      'Clear think_cache row if stale answer',
      'Check evidenceEngine relevance gate'
    );
  } else if (wing === 'deploy') {
    name = 'vercel_hobby';
    steps.push(
      'Batch file uploads; one redeploy',
      'Stay under 12 serverless functions',
      'Watch deploy/day Hobby cap'
    );
  } else if (wing === 'security') {
    name = 'security_hygiene';
    steps.push(
      'Never paste secrets in chat',
      'Rotate exposed tokens',
      'Run `sentinel scan`'
    );
  } else {
    steps.push(
      'Run `qa scan` for system-wide signals',
      'Check `pipeline fails` and `health`',
      'Escalate to Grok with ticket id if stuck'
    );
  }

  return { name, steps, wing: wing || 'scribe' };
}

export function formatPlaybook(pb) {
  if (!pb) return '';
  return (
    `*Playbook \`${pb.name}\`* (${pb.wing})\n` +
    pb.steps.map((s, i) => `${i + 1}. ${s}`).join('\n')
  );
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
  const lines = [
    '⚔ *QA Legion · 13E*',
    'Roster: *' + s.total + '* agents · Wings: *' + s.wings + '*',
    '_Metadata scale — still one lib file, zero new api routes_',
    '',
  ];
  for (const [wing, agents] of Object.entries(s.byWing)) {
    const core = agents.filter((a) => a.tier === 'core').length;
    const sample = agents
      .slice(0, 4)
      .map((a) => a.id)
      .join(' ');
    lines.push('*' + wing + '* · ' + agents.length + ' (core ' + core + ')');
    lines.push('`' + sample + ' …`');
  }
  lines.push('');
  lines.push('`qa wing <name>` — list one wing (13E)');
  return lines.join('\n');
}


/**
 * Wave 13F — SAFE auto-apply only (whitelist).
 * Never: git push, file rewrite, env change, destructive SQL.
 */
export async function applySafePlaybook(ticketOrId, { mode = 'safe' } = {}) {
  const t0 = Date.now();
  let ticket = ticketOrId;
  if (typeof ticketOrId === 'string') {
    const rows = await listTickets({ status: 'all', limit: 80 });
    const id = ticketOrId.toLowerCase();
    ticket = rows.find((x) => String(x.id).startsWith(id)) || (await getTicket(ticketOrId));
  }
  if (!ticket || !ticket.id) {
    return { ok: false, error: 'ticket not found' };
  }
  if (ticket.status === 'closed' || ticket.status === 'resolved') {
    return { ok: true, skipped: true, reason: 'already_closed', ticket };
  }

  const pb = suggestPlaybook({
    wing: ticket.wing,
    title: ticket.title,
    detail: ticket.detail,
    severity: ticket.severity,
  });

  const actions = [];
  let resolution = `Playbook ${pb.name}\n` + pb.steps.map((s, i) => `${i + 1}. ${s}`).join('\n');

  // 1) Always attach playbook text to resolution (safe)
  actions.push({ id: 'attach_playbook', ok: true });

  // 2) Health recheck (read-only)
  try {
    const h = await import('./healthManager.js');
    const fn = h.runHealthCheck || h.healthCheck || h.checkAll;
    if (typeof fn === 'function') {
      const r = await fn();
      const summary = r.summary || r.text || JSON.stringify(r).slice(0, 240);
      resolution += `\n\nHealth recheck: ${summary}`;
      actions.push({ id: 'health_recheck', ok: true });
    }
  } catch (e) {
    actions.push({ id: 'health_recheck', ok: false, error: e.message || String(e) });
  }

  // 3) Light QA rescan (may open more tickets — ok)
  try {
    const scan = await runQaScan();
    resolution += `\n\nQA rescan: findings=${scan.findings} clean=${scan.clean}`;
    actions.push({ id: 'qa_rescan', ok: true, findings: scan.findings });
  } catch (e) {
    actions.push({ id: 'qa_rescan', ok: false, error: e.message || String(e) });
  }

  // 4) Auto-close only for low-risk informational tickets after playbook attached
  const autoClose =
    mode === 'safe' &&
    (ticket.severity === 'white' ||
      /standing by|no findings|clean/i.test(String(ticket.title || '') + String(ticket.detail || '')));

  if (autoClose) {
    const closed = await setTicketStatus(ticket.id, 'closed', resolution + '\n\n[13F auto-closed: informational]');
    actions.push({ id: 'auto_close', ok: !!closed.ok });
    return {
      ok: true,
      ticket_id: ticket.id,
      playbook: pb.name,
      actions,
      status: 'closed',
      resolution,
      ms: Date.now() - t0,
    };
  }

  // Default: mark resolved_pending (still open for Founder) via resolution update without close
  // Use status 'open' but write resolution as suggested fix
  const client = sb();
  if (client) {
    try {
      await client
        .from('rq_qa_tickets')
        .update({
          resolution,
          updated_at: new Date().toISOString(),
        })
        .eq('id', ticket.id);
      actions.push({ id: 'write_resolution', ok: true });
    } catch (e) {
      actions.push({ id: 'write_resolution', ok: false, error: e.message || String(e) });
    }
  }

  return {
    ok: true,
    ticket_id: ticket.id,
    playbook: pb.name,
    actions,
    status: ticket.status,
    resolution,
    ms: Date.now() - t0,
    note: 'Safe apply done. Ticket left open for Founder unless auto-closed.',
  };
}

export function formatApplyResult(r) {
  if (!r || !r.ok) return '❌ Apply failed: ' + (r && r.error ? r.error : 'unknown');
  if (r.skipped) return `⏭ Skipped — ticket already closed.`;
  const lines = [
    '⚔ *QA Apply · 13F (safe)*',
    'Ticket: `' + String(r.ticket_id).slice(0, 8) + '`',
    'Playbook: `' + (r.playbook || '') + '`',
    'Status: ' + (r.status || ''),
    'Time: ' + (r.ms || 0) + 'ms',
    '',
    '*Actions*',
    ...(r.actions || []).map((a) => (a.ok ? '✅ ' : '❌ ') + a.id + (a.error ? ' · ' + a.error : '')),
  ];
  if (r.note) lines.push('', '_' + r.note + '_');
  lines.push('', '_Never auto-pushes code. Use Grok/Founder for code fixes._');
  return lines.join('\n');
}


export function qaHelp() {
  return (
    '*QA Legion · Wave 13F*\n' +
    'Self-healing test army (roster 200+ · 1 lib module)\n\n' +
    '• `qa help` — menu\n' +
    '• `qa status` — open tickets summary\n' +
    '• `qa legion` — full 200-agent roster\n' +
    '• `qa scan` — pipeline + sentinel + health sweep\n' +
    '• `qa last` — recent tickets\n' +
    '• `qa ticket <id>` — ticket detail\n' +
    '• `qa close <id>` — close ticket\n\n' +
    '_13C: playbooks on tickets · `qa playbook <id>`_'
  );
}

export default {
  QA_LEGION,
  classifyIssue,
  legionSummary,
  openTicket,
  suggestPlaybook,
  formatPlaybook,
  listTickets,
  getTicket,
  setTicketStatus,
  applySafePlaybook,
  formatApplyResult,
  runQaScan,
  formatLegion,
  qaHelp,
};
