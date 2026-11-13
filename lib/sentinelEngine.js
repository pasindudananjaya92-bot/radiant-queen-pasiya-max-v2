/**
 * Wave 11D — Sentinel (Cyber Wall)
 * Perimeter checks: env presence, secret patterns, auth posture, anomaly signals.
 * Never prints secret VALUES — only missing/present + redacted findings.
 */

import { createClient } from '@supabase/supabase-js';

function sb() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

async function logScan(row) {
  const client = sb();
  if (!client) return;
  try {
    await client.from('rq_sentinel_log').insert({
      scan_type: String(row.scan_type || 'scan').slice(0, 40),
      severity: String(row.severity || 'info').slice(0, 20),
      title: String(row.title || '').slice(0, 200),
      detail: String(row.detail || '').slice(0, 2000),
      meta: row.meta || {},
    });
  } catch (_) {}
}

/** Env keys that should exist (values never shown) */
const REQUIRED_ENV = [
  'BOT_TOKEN',
  'ADMIN_ID',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'GROQ_API_KEY',
];

const RECOMMENDED_ENV = [
  'GEMINI_API_KEY',
  'OPENROUTER_API_KEY',
  'TAVILY_API_KEY',
  'CRON_SECRET',
  'DASH_SECRET',
  'RESEND_API_KEY',
  'FOUNDER_EMAIL',
  'SENTRY_DSN',
];

/** Patterns that look like leaked secrets in text */
const SECRET_PATTERNS = [
  { id: 'sk_live', re: /sk_live_[a-zA-Z0-9]{20,}/g, severity: 'critical' },
  { id: 'sk_test', re: /sk_test_[a-zA-Z0-9]{20,}/g, severity: 'warn' },
  { id: 'ghp', re: /ghp_[a-zA-Z0-9]{20,}/g, severity: 'critical' },
  { id: 'gho', re: /gho_[a-zA-Z0-9]{20,}/g, severity: 'critical' },
  { id: 'github_pat', re: /github_pat_[a-zA-Z0-9_]{20,}/g, severity: 'critical' },
  { id: 'openai', re: /sk-[a-zA-Z0-9]{20,}/g, severity: 'critical' },
  { id: 'aws_akid', re: /AKIA[0-9A-Z]{16}/g, severity: 'critical' },
  { id: 'telegram_bot', re: /\d{8,14}:[A-Za-z0-9_-]{30,}/g, severity: 'critical' },
  { id: 'bearer', re: /Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, severity: 'warn' },
  { id: 'supabase_jwt', re: /eyJ[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{10,}/g, severity: 'warn' },
];

export function scanTextForSecrets(text, source = 'text') {
  const findings = [];
  const s = String(text || '');
  for (const p of SECRET_PATTERNS) {
    const matches = s.match(p.re);
    if (matches && matches.length) {
      findings.push({
        id: p.id,
        severity: p.severity,
        source,
        count: matches.length,
        sample: redact(matches[0]),
      });
    }
  }
  return findings;
}

function redact(s) {
  const t = String(s || '');
  if (t.length <= 8) return '***';
  return t.slice(0, 4) + '…' + t.slice(-3) + ` (${t.length} chars)`;
}

export function scanEnvPosture() {
  const missingReq = [];
  const presentReq = [];
  for (const k of REQUIRED_ENV) {
    const v = process.env[k] || (k === 'BOT_TOKEN' ? process.env.TELEGRAM_BOT_TOKEN : '');
    if (v && String(v).trim()) presentReq.push(k);
    else missingReq.push(k);
  }
  const missingRec = [];
  const presentRec = [];
  for (const k of RECOMMENDED_ENV) {
    if (process.env[k] && String(process.env[k]).trim()) presentRec.push(k);
    else missingRec.push(k);
  }
  // Dangerous: service role exposed as anon mistakenly — can't detect fully
  const notes = [];
  if (process.env.SUPABASE_ANON_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    if (process.env.SUPABASE_ANON_KEY === process.env.SUPABASE_SERVICE_ROLE_KEY) {
      notes.push({
        severity: 'critical',
        title: 'ANON_KEY equals SERVICE_ROLE_KEY',
        detail: 'Service role must never equal anon key',
      });
    }
  }
  if (!process.env.DASH_SECRET || String(process.env.DASH_SECRET).length < 12) {
    notes.push({
      severity: 'warn',
      title: 'Weak or missing DASH_SECRET',
      detail: 'Dashboard auth should use a long random secret',
    });
  }
  if (!process.env.CRON_SECRET) {
    notes.push({
      severity: 'warn',
      title: 'CRON_SECRET missing',
      detail: 'Cron endpoints may be callable without auth',
    });
  }
  return { missingReq, presentReq, missingRec, presentRec, notes };
}

export async function scanRecentMissionLeak() {
  const client = sb();
  const findings = [];
  if (!client) return findings;
  try {
    const { data } = await client
      .from('rq_missions')
      .select('id, title, result, created_at')
      .order('created_at', { ascending: false })
      .limit(15);
    for (const m of data || []) {
      const hits = scanTextForSecrets(m.result || '', `mission:${String(m.id).slice(0, 8)}`);
      findings.push(...hits);
    }
  } catch (_) {}
  try {
    const { data } = await client
      .from('rq_mission_events')
      .select('message, mission_id')
      .order('created_at', { ascending: false })
      .limit(30);
    for (const e of data || []) {
      findings.push(...scanTextForSecrets(e.message || '', 'mission_event'));
    }
  } catch (_) {}
  return findings;
}

export async function scanAuthPosture() {
  const notes = [];
  const admin = String(process.env.ADMIN_ID || process.env.FOUNDER_ID || '')
    .split(/[\s,]+/)
    .filter(Boolean);
  if (!admin.length) {
    notes.push({
      severity: 'critical',
      title: 'ADMIN_ID / FOUNDER_ID not set',
      detail: 'Founder gates may be open or broken',
    });
  } else {
    notes.push({
      severity: 'info',
      title: `Founder IDs configured (${admin.length})`,
      detail: 'Values not shown',
    });
  }
  return notes;
}

/**
 * Full sentinel scan
 */
export async function runSentinelScan() {
  const t0 = Date.now();
  const env = scanEnvPosture();
  const auth = await scanAuthPosture();
  const leaks = await scanRecentMissionLeak();

  const findings = [];

  for (const k of env.missingReq) {
    findings.push({
      severity: 'critical',
      title: `Missing required env: ${k}`,
      detail: 'Set in Vercel project env — value never logged',
    });
  }
  for (const n of env.notes || []) findings.push(n);
  for (const n of auth) findings.push(n);
  for (const L of leaks) {
    findings.push({
      severity: L.severity,
      title: `Possible secret pattern (${L.id}) in ${L.source}`,
      detail: `count=${L.count} sample=${L.sample}`,
    });
  }

  const critical = findings.filter((f) => f.severity === 'critical').length;
  const warn = findings.filter((f) => f.severity === 'warn').length;
  const score = Math.max(0, 100 - critical * 25 - warn * 8);

  await logScan({
    scan_type: 'full',
    severity: critical ? 'critical' : warn ? 'warn' : 'info',
    title: `Sentinel scan score ${score}`,
    detail: `critical=${critical} warn=${warn}`,
    meta: { score, critical, warn, ms: Date.now() - t0 },
  });

  return {
    ok: true,
    score,
    critical,
    warn,
    ms: Date.now() - t0,
    env,
    findings,
    report: formatSentinelReport({ score, critical, warn, env, findings, ms: Date.now() - t0 }),
  };
}

function formatSentinelReport({ score, critical, warn, env, findings, ms }) {
  const lines = [
    `🛰️ *Sentinel · Wave 11D*`,
    `Score: *${score}/100* · ${ms}ms`,
    `Critical: ${critical} · Warn: ${warn}`,
    '',
    '*Env posture*',
    `· Required OK: ${env.presentReq.length}/${env.presentReq.length + env.missingReq.length}`,
    env.missingReq.length ? `· Missing REQUIRED: ${env.missingReq.join(', ')}` : '· Required: all present',
    `· Recommended present: ${env.presentRec.length}/${env.presentRec.length + env.missingRec.length}`,
    '',
    '*Findings*',
  ];
  if (!findings.length) {
    lines.push('· None — perimeter quiet');
  } else {
    const rank = { critical: 0, warn: 1, info: 2 };
    const sorted = [...findings].sort(
      (a, b) => (rank[a.severity] ?? 3) - (rank[b.severity] ?? 3)
    );
    for (const f of sorted.slice(0, 15)) {
      const icon = f.severity === 'critical' ? '🔴' : f.severity === 'warn' ? '🟡' : '⚪';
      lines.push(`${icon} *${f.title}*\n${f.detail || ''}`);
    }
  }
  lines.push('');
  lines.push('_Secrets are redacted. Rotate any critical hit immediately._');
  return lines.join('\n');
}

export async function recentSentinelLog(limit = 8) {
  const client = sb();
  if (!client) return [];
  const { data } = await client
    .from('rq_sentinel_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  return data || [];
}

export default { runSentinelScan, scanTextForSecrets, scanEnvPosture, recentSentinelLog };
