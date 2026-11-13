/**
 * Wave 11D — Auditors
 * Command-surface audit + static risk checklist for Queen OS.
 * Read-only — does not modify production code.
 */

/** Known command families the OS should expose */
const EXPECTED_FAMILIES = [
  { id: 'health', samples: ['health'], corps: 'watchdog' },
  { id: 'vault', samples: ['vault list', 'vault upload'], corps: 'quartermaster' },
  { id: 'mem', samples: ['mem list', 'mem remember'], corps: 'researcher' },
  { id: 'make', samples: ['make run', 'make help'], corps: 'executor' },
  { id: 'snap', samples: ['snap list', 'snap help'], corps: 'healer' },
  { id: 'cron', samples: ['cron list', 'cron heal'], corps: 'healer' },
  { id: 'think', samples: ['think', 'think jobs'], corps: 'oracle' },
  { id: 'shadow', samples: ['shadow list', 'shadow morning'], corps: 'scribe' },
  { id: 'morning', samples: ['morning pack', 'morning email'], corps: 'envoy' },
  { id: 'drive', samples: ['drive list', 'drive search'], corps: 'quartermaster' },
  { id: 'bank', samples: ['bank list'], corps: 'quartermaster' },
  { id: 'mission', samples: ['mission list', 'mission council'], corps: 'oracle' },
  { id: 'swarm', samples: ['swarm help', 'nation status'], corps: 'oracle' },
  { id: 'heal', samples: ['heal now', 'heal dry'], corps: 'healer' },
  { id: 'sentinel', samples: ['sentinel scan'], corps: 'sentinel' },
  { id: 'audit', samples: ['audit commands'], corps: 'auditor' },
];

/** Static risk rules (architecture) */
const RISK_RULES = [
  {
    id: 'vercel_hobby_deploy_cap',
    severity: 'warn',
    title: 'Vercel Hobby deploy cap',
    detail: 'Batch file uploads → one redeploy. Avoid gh-per-file deploys.',
  },
  {
    id: 'function_timeout',
    severity: 'warn',
    title: 'Serverless ~10s ceiling',
    detail: 'Council full LLM / heavy jobs must use Hull B or fast mode.',
  },
  {
    id: 'founder_gate',
    severity: 'info',
    title: 'Founder-only gates',
    detail: 'ADMIN_ID must stay set; never open heal/mission to public chats.',
  },
  {
    id: 'service_role',
    severity: 'critical',
    title: 'Service role key hygiene',
    detail: 'SUPABASE_SERVICE_ROLE_KEY only on server — never client/dashboard JS.',
  },
  {
    id: 'dash_secret',
    severity: 'warn',
    title: 'Dashboard auth',
    detail: 'DASH_SECRET required for /dashboard.html write actions.',
  },
];

export async function auditCommands() {
  const t0 = Date.now();
  const present = [];
  const gaps = [];

  // Presence = documented in EXPECTED_FAMILIES (catalog audit)
  // Runtime probe of a few safe handlers
  for (const fam of EXPECTED_FAMILIES) {
    present.push(fam);
  }

  // Probe route modules exist
  const modules = [
    ['missionRoutes', './missionRoutes.js'],
    ['healerRoutes', './healerRoutes.js'],
    ['platformRoutes', './platformRoutes.js'],
    ['cronRoutes', './cronRoutes.js'],
    ['thinkRoutes', './thinkRoutes.js'],
  ];
  const moduleStatus = [];
  for (const [name, path] of modules) {
    try {
      const mod = await import(path);
      const ok = typeof mod.tryHandle === 'function' || typeof mod.default?.tryHandle === 'function';
      moduleStatus.push({ name, ok, error: ok ? null : 'no tryHandle' });
      if (!ok) gaps.push({ id: name, detail: 'tryHandle missing' });
    } catch (e) {
      moduleStatus.push({ name, ok: false, error: e.message || String(e) });
      gaps.push({ id: name, detail: e.message || String(e) });
    }
  }

  const score = Math.max(0, 100 - gaps.length * 12);
  return {
    ok: true,
    score,
    ms: Date.now() - t0,
    families: present.length,
    gaps,
    moduleStatus,
    report: formatCommandAudit({ score, present, gaps, moduleStatus, ms: Date.now() - t0 }),
  };
}

function formatCommandAudit({ score, present, gaps, moduleStatus, ms }) {
  const lines = [
    `🔎 *Command Auditor · Wave 11D*`,
    `Score: *${score}/100* · ${ms}ms`,
    `Families catalogued: ${present.length}`,
    '',
    '*Route modules*',
    ...moduleStatus.map((m) => `${m.ok ? '✅' : '❌'} ${m.name}${m.error ? ' — ' + m.error : ''}`),
    '',
    '*Sample commands*',
    ...present.slice(0, 12).map((f) => `· *${f.id}*: \`${f.samples[0]}\``),
  ];
  if (gaps.length) {
    lines.push('', '*Gaps*', ...gaps.map((g) => `🟡 ${g.id}: ${g.detail}`));
  } else {
    lines.push('', '✓ No module gaps detected');
  }
  return lines.join('\n');
}

export function auditRiskChecklist() {
  const lines = [
    `📋 *Risk Auditor · Wave 11D*`,
    '',
    ...RISK_RULES.map((r) => {
      const icon = r.severity === 'critical' ? '🔴' : r.severity === 'warn' ? '🟡' : '⚪';
      return `${icon} *${r.title}*\n${r.detail}`;
    }),
    '',
    '_Checklist is advisory — pair with `sentinel scan` for live posture._',
  ];
  return { ok: true, rules: RISK_RULES, report: lines.join('\n') };
}

export async function runFullAudit() {
  const cmd = await auditCommands();
  const risk = auditRiskChecklist();
  const report = [
    cmd.report,
    '',
    '────────',
    '',
    risk.report,
  ].join('\n');
  return {
    ok: true,
    score: cmd.score,
    report,
    cmd,
    risk,
  };
}

export default { auditCommands, auditRiskChecklist, runFullAudit };
