/**
 * Wave 12A — Self-Healing Code Swarm (foundation)
 * Pipeline: Gate → Triage → Coder → Critic → (optional) Deployer handoff
 * Wraps existing ghHeal syntax tools + staged reporting for Telegram.
 */

import { syntaxCheck, balanceOk, healSourceBeforePush } from './ghHeal.js';

const STAGES = ['gate', 'triage', 'coder', 'critic', 'security', 'deployer'];

/**
 * Triage a Node syntax error message into structured form.
 */
export function triageError(errorText = '', source = '') {
  const msg = String(errorText || '');
  const lineMatch = msg.match(/:(\d+)\r?\n/) || msg.match(/line\s+(\d+)/i) || msg.match(/:(\d+):/);
  const line = lineMatch ? Number(lineMatch[1]) : null;
  let kind = 'unknown';
  if (/missing \) after argument list/i.test(msg)) kind = 'missing_paren';
  else if (/Unexpected token/i.test(msg)) kind = 'unexpected_token';
  else if (/Missing catch or finally/i.test(msg)) kind = 'missing_catch';
  else if (/Unexpected identifier/i.test(msg)) kind = 'unexpected_identifier';
  else if (/is not defined/i.test(msg)) kind = 'ref_error_pattern';
  const lines = String(source || '').split('\n');
  const context =
    line && lines.length
      ? lines.slice(Math.max(0, line - 3), Math.min(lines.length, line + 2)).join('\n')
      : '';
  return { ok: true, stage: 'triage', line, kind, message: msg.slice(0, 800), context };
}

/**
 * Gate: syntax + brace balance
 */
export async function stageGate(source, filename = 'file.js') {
  const bal = balanceOk(source);
  const syn = await syntaxCheck(source, filename);
  return {
    stage: 'gate',
    ok: !!(syn.ok && bal),
    balance: bal,
    syntax: syn,
  };
}

/**
 * Coder: attempt heal via existing healSourceBeforePush
 */
export async function stageCoder(filePath, source) {
  try {
    const healed = await healSourceBeforePush(filePath || 'lib/unknown.js', source);
    return {
      stage: 'coder',
      ok: !!(healed && healed.ok !== false && (healed.source || healed.code)),
      healed: healed || null,
      error: healed && healed.error ? healed.error : null,
    };
  } catch (e) {
    return { stage: 'coder', ok: false, error: e.message || String(e), healed: null };
  }
}

/**
 * Critic: re-check healed source
 */
export async function stageCritic(source, filename = 'file.js') {
  const gate = await stageGate(source, filename);
  return {
    stage: 'critic',
    ok: gate.ok,
    balance: gate.balance,
    syntax: gate.syntax,
  };
}

/**
 * Security: light static denies
 */
export function stageSecurity(source = '') {
  const s = String(source);
  const flags = [];
  if (/eval\s*\(/i.test(s)) flags.push('eval()');
  if (/child_process|execSync|spawnSync/i.test(s) && /rm\s+-rf|process\.env\.BOT_TOKEN/i.test(s)) {
    flags.push('dangerous_exec_pattern');
  }
  // never allow obvious secret literals of high length telegram tokens in new code
  if (/\d{8,14}:[A-Za-z0-9_-]{30,}/.test(s)) flags.push('possible_bot_token_literal');
  return {
    stage: 'security',
    ok: flags.length === 0,
    flags,
  };
}

/**
 * Full swarm pipeline on a source string (does NOT auto-push to GitHub).
 * Returns report + optional healed source for Founder approval.
 */
export async function runCodeSwarm({ source, filename = 'file.js', filePath = '', autoHeal = true } = {}) {
  const t0 = Date.now();
  const log = [];

  const gate = await stageGate(source, filename);
  log.push(gate);
  if (gate.ok) {
    return {
      ok: true,
      clean: true,
      ms: Date.now() - t0,
      log,
      source,
      report: formatReport({ clean: true, log, ms: Date.now() - t0, filename }),
    };
  }

  const triage = triageError(gate.syntax?.error || 'syntax fail', source);
  log.push(triage);

  let working = source;
  let coder = { stage: 'coder', ok: false, skipped: !autoHeal };
  if (autoHeal) {
    coder = await stageCoder(filePath || filename, source);
    log.push(coder);
    if (coder.ok && coder.healed) {
      working = coder.healed.source || coder.healed.code || source;
    }
  }

  const critic = await stageCritic(working, filename);
  log.push(critic);

  const security = stageSecurity(working);
  log.push(security);

  const pass = !!(critic.ok && security.ok);
  return {
    ok: pass,
    clean: false,
    ms: Date.now() - t0,
    log,
    source: working,
    healed: pass && working !== source,
    report: formatReport({
      clean: false,
      pass,
      log,
      ms: Date.now() - t0,
      filename,
      triage,
    }),
  };
}

function formatReport({ clean, pass, log, ms, filename, triage }) {
  if (clean) {
    return `🧠 *Code Swarm · Gate*\n\`${filename}\`\n✅ Already clean · ${ms}ms`;
  }
  const lines = [
    `🧠 *Code Swarm · Wave 12A*`,
    `File: \`${filename}\``,
    `Result: ${pass ? '✅ PASS (healed candidate)' : '❌ FAIL — needs Founder/Grok'}`,
    `Time: ${ms}ms`,
    '',
  ];
  if (triage) {
    lines.push(`*Triage*: ${triage.kind || 'unknown'} @ line ${triage.line ?? '?'}`);
    lines.push(String(triage.message || '').slice(0, 200));
    lines.push('');
  }
  for (const s of log || []) {
    if (!s || !s.stage) continue;
    const ok =
      s.ok === true ? '✅' : s.ok === false ? '❌' : s.skipped ? '⏭' : '·';
    lines.push(`${ok} *${s.stage}*${s.kind ? ' · ' + s.kind : ''}${s.line != null ? ' · L' + s.line : ''}`);
  }
  lines.push('');
  lines.push(
    pass
      ? '_Healed source ready in memory — review before push. Auto-deployer = later wave._'
      : '_Push blocked pattern. Send error + file to Grok if swarm cannot heal._'
  );
  return lines.join('\n');
}

export async function swarmStatus() {
  return {
    ok: true,
    stages: STAGES,
    report:
      '*Code Swarm 12A*\n' +
      'Stages: ' +
      STAGES.join(' → ') +
      '\n' +
      '• `codeswarm help`\n' +
      '• `codeswarm status`\n' +
      '• `codeswarm triage <paste error>`\n' +
      '• Upload path still uses existing `gh` + ghHeal gate on push\n',
  };
}

export default {
  runCodeSwarm,
  stageGate,
  stageCoder,
  stageCritic,
  stageSecurity,
  triageError,
  swarmStatus,
};
