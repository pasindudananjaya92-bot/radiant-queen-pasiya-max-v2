
/**
 * Wave 20A — OMNI-CORE (foundation)
 * Self-heal (safe whitelist) + predictive limits + shadow pulse.
 * NEVER auto git push / auto code rewrite / auto-adopt proposals into production.
 */

import { createClient } from '@supabase/supabase-js';

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

async function tgSend(text) {
  const token = process.env.BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
  const chatId = founderChatId();
  if (!token || !chatId) return { ok: false, error: 'no token/chat' };
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: String(text).slice(0, 4000),
      parse_mode: 'Markdown',
      disable_web_page_preview: true,
    }),
    signal: AbortSignal.timeout(10000),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j.ok === false) {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: String(text).replace(/[*_`]/g, '').slice(0, 4000),
      }),
      signal: AbortSignal.timeout(10000),
    });
  }
  return { ok: true };
}

export function omniHelp() {
  return (
    '*OMNI-MIND · Wave 20A*\n' +
    'Core online — *safe autonomy only*\n\n' +
    '• `omni help` — menu\n' +
    '• `omni status` — core status\n' +
    '• `omni pulse` — full cycle (heal + predict + coverage)\n' +
    '• `omni heal` — Auto-Healer v2 (safe whitelist)\n' +
    '• `omni predict` — limit / risk warnings\n' +
    '• `omni shadow` — night shadow pulse (manual)\n\n' +
    '*Safe rules*\n' +
    '· Auto: immune cycle, probe tickets clear, health recheck\n' +
    '· Auto: snap wake *only if* SNAP auto enabled + API works\n' +
    '· NEVER: git push, silent code rewrite, auto-implement lab proposals\n' +
    '· Cron: `job=omni` / `job=omnipulse`\n'
  );
}

/** Predictive brain — best-effort signals (no external billing APIs required) */
export async function runPredict() {
  const warnings = [];
  const notes = [];

  // Vercel duration soft ceiling
  notes.push('Vercel Hobby ~10s serverless ceiling — long think uses Hull B');

  // Snap hours — cannot read exact quota without API; flag if key missing
  if (!process.env.SNAPDEPLOY_API_KEY) {
    warnings.push({ level: 'yellow', key: 'snap', msg: 'SNAPDEPLOY_API_KEY missing — cannot auto-heal containers' });
  } else {
    notes.push('Snap key present — auto-wake allowed only when OMNI_SNAP_AUTO=1');
  }

  // Make
  if (!process.env.MAKE_WEBHOOK_URL) {
    warnings.push({ level: 'yellow', key: 'make', msg: 'MAKE_WEBHOOK_URL missing' });
  }

  // AI keys
  const ai = [process.env.GROQ_API_KEY, process.env.GEMINI_API_KEY, process.env.OPENROUTER_API_KEY].filter(Boolean);
  if (ai.length === 0) {
    warnings.push({ level: 'red', key: 'ai', msg: 'No AI keys (GROQ/GEMINI/OPENROUTER)' });
  } else if (ai.length === 1) {
    warnings.push({ level: 'yellow', key: 'ai', msg: 'Only 1 AI provider — add fallback key for resilience' });
  } else {
    notes.push('AI providers configured: ' + ai.length);
  }

  // Search
  if (!process.env.TAVILY_API_KEY && !process.env.EXA_API_KEY) {
    warnings.push({ level: 'yellow', key: 'search', msg: 'No Tavily/Exa — research pulse limited' });
  }

  // Open QA reds
  try {
    const qa = await import('./qaEngine.js');
    const open = await qa.listTickets({ status: 'open', limit: 20 });
    const reds = (open || []).filter((t) => String(t.severity).toLowerCase() === 'red');
    if (reds.length >= 3) {
      warnings.push({ level: 'red', key: 'qa', msg: reds.length + ' open RED QA tickets' });
    } else if (reds.length) {
      warnings.push({ level: 'yellow', key: 'qa', msg: reds.length + ' open RED QA ticket(s)' });
    } else {
      notes.push('QA reds: 0');
    }
  } catch (_) {}

  // Lab proposals backlog
  try {
    const lab = await import('./labEngine.js');
    const props = await lab.listProposals({ status: 'proposed', limit: 30 });
    if ((props || []).length >= 10) {
      warnings.push({ level: 'yellow', key: 'lab', msg: props.length + ' open lab proposals — prune/stage recommended' });
    } else {
      notes.push('Lab proposals: ' + (props || []).length);
    }
  } catch (_) {}

  return {
    ok: !warnings.some((w) => w.level === 'red'),
    warnings,
    notes,
    ts: new Date().toISOString(),
  };
}

export function formatPredict(p) {
  const lines = ['🔮 *OMNI Predict*', ''];
  if (!(p.warnings || []).length) lines.push('✅ No critical warnings');
  for (const w of p.warnings || []) {
    lines.push((w.level === 'red' ? '🔴' : '🟡') + ' ' + w.msg);
  }
  if ((p.notes || []).length) {
    lines.push('');
    lines.push('*Notes*');
    for (const n of p.notes) lines.push('· ' + n);
  }
  return lines.join('\n');
}

/** Auto-Healer v2 — extends immune cycle with optional snap wake */
export async function runOmniHeal({ notify = false } = {}) {
  const t0 = Date.now();
  const actions = [];

  // 1) Immune cycle (existing safe playbooks)
  try {
    const he = await import('./healerEngine.js');
    const r = await he.runImmuneCycle({ dryRun: false });
    actions.push({
      id: 'immune',
      ok: r.ok !== false,
      detail: r.report ? String(r.report).slice(0, 200) : r.error || 'done',
    });
  } catch (e) {
    actions.push({ id: 'immune', ok: false, detail: e.message || String(e) });
  }

  // 2) Route probe (no ticket spam if all pass)
  try {
    const qa = await import('./qaEngine.js');
    const probe = await qa.runRouteProbe({ openTickets: true });
    actions.push({
      id: 'probe',
      ok: !!probe.ok,
      detail: (probe.passed || 0) + '/' + (probe.total || 0),
    });
  } catch (e) {
    actions.push({ id: 'probe', ok: false, detail: e.message || String(e) });
  }

  // 3) Clear probe false-positives
  try {
    const qa = await import('./qaEngine.js');
    if (typeof qa.closeTicketsBulk === 'function') {
      const c = await qa.closeTicketsBulk({ onlyProbeFails: true, limit: 20 });
      actions.push({ id: 'clear_probe_tickets', ok: true, detail: 'closed ' + (c.closed || 0) });
    }
  } catch (e) {
    actions.push({ id: 'clear_probe_tickets', ok: false, detail: e.message || String(e) });
  }

  // 4) Optional snap auto-wake (OFF by default)
  if (String(process.env.OMNI_SNAP_AUTO || '0') === '1') {
    try {
      const snap = await import('./snapDeployManager.js');
      const listFn = snap.listContainers || snap.list || snap.getContainers;
      if (typeof listFn === 'function') {
        const list = await listFn();
        const arr = Array.isArray(list) ? list : list?.containers || list?.items || [];
        let woken = 0;
        for (const c of arr.slice(0, 5)) {
          const status = String(c.status || c.state || '').toUpperCase();
          if (/STOP|SLEEP|EXIT|DOWN/.test(status)) {
            const wake = snap.wake || snap.start || snap.restart;
            if (typeof wake === 'function') {
              await wake(c.id || c.containerId || c.name);
              woken += 1;
            }
          }
        }
        actions.push({ id: 'snap_auto', ok: true, detail: 'woken ' + woken });
      } else {
        actions.push({ id: 'snap_auto', ok: false, detail: 'list fn missing' });
      }
    } catch (e) {
      actions.push({ id: 'snap_auto', ok: false, detail: e.message || String(e) });
    }
  } else {
    actions.push({ id: 'snap_auto', ok: true, detail: 'skipped (set OMNI_SNAP_AUTO=1 to enable)' });
  }

  const summary = {
    ok: actions.every((a) => a.ok),
    actions,
    ms: Date.now() - t0,
  };

  if (notify) {
    const lines = ['🛡 *OMNI Heal*', summary.ok ? '✅ cycle ok' : '⚠️ cycle had issues', ''];
    for (const a of actions) {
      lines.push((a.ok ? '✅' : '❌') + ' ' + a.id + ' — ' + a.detail);
    }
    await tgSend(lines.join('\n'));
  }

  return summary;
}

export function formatHeal(h) {
  const lines = ['🛡 *OMNI Heal · 20A*', (h.ok ? '✅' : '⚠️') + ' ' + h.ms + 'ms', ''];
  for (const a of h.actions || []) {
    lines.push((a.ok ? '✅' : '❌') + ' `' + a.id + '` — ' + a.detail);
  }
  return lines.join('\n');
}

/** Shadow pulse — night work without destructive ops */
export async function runOmniShadow({ notify = true } = {}) {
  const t0 = Date.now();
  const parts = [];

  // coverage gaps
  try {
    const cov = await import('./coverageEngine.js');
    const scan = await cov.runCoverageScan({ openTickets: true });
    parts.push('Coverage: OK ' + scan.ok_n + ' · WARN ' + scan.warn_n + ' · FAIL ' + scan.fail_n);
  } catch (e) {
    parts.push('Coverage error: ' + (e.message || e));
  }

  // heal
  const heal = await runOmniHeal({ notify: false });
  parts.push('Heal: ' + (heal.ok ? 'ok' : 'issues') + ' · ' + heal.ms + 'ms');

  // predict
  const pred = await runPredict();
  parts.push('Predict warnings: ' + (pred.warnings || []).length);

  // prune lab dupes
  try {
    const lab = await import('./labEngine.js');
    if (typeof lab.pruneDuplicateProposals === 'function') {
      const p = await lab.pruneDuplicateProposals();
      parts.push('Lab prune closed: ' + (p.closed || 0));
    }
  } catch (_) {}

  const body =
    '🌑 *OMNI Shadow Pulse*\n' +
    parts.map((p) => '· ' + p).join('\n') +
    '\n_' +
    (Date.now() - t0) +
    'ms_';

  if (notify) await tgSend(body);
  return { ok: true, body, ms: Date.now() - t0 };
}

/** Full pulse */
export async function runOmniPulse({ notify = true } = {}) {
  const t0 = Date.now();
  const heal = await runOmniHeal({ notify: false });
  const pred = await runPredict();
  let cov = null;
  try {
    const c = await import('./coverageEngine.js');
    cov = await c.runCoverageScan({ openTickets: false });
  } catch (e) {
    cov = { error: e.message || String(e) };
  }

  const lines = [
    '👑 *OMNI Pulse · 20A*',
    '',
    '*Heal* ' + (heal.ok ? '✅' : '⚠️') + ' ' + heal.ms + 'ms',
    ...heal.actions.map((a) => '· ' + (a.ok ? '✅' : '❌') + ' ' + a.id + ': ' + a.detail),
    '',
    '*Predict*',
    formatPredict(pred).split('\n').slice(1).join('\n'),
    '',
    '*Coverage*',
    cov && cov.ok_n != null
      ? 'OK ' + cov.ok_n + ' · WARN ' + cov.warn_n + ' · FAIL ' + cov.fail_n
      : String(cov?.error || cov || ''),
    '',
    '_No code was pushed. Safe autonomy only._',
    '_' + (Date.now() - t0) + 'ms_',
  ];
  const body = lines.join('\n');
  if (notify) await tgSend(body);
  return { ok: true, body, heal, pred, cov, ms: Date.now() - t0 };
}

export async function omniStatus() {
  return {
    phase: '20A',
    core: true,
    snap_auto: String(process.env.OMNI_SNAP_AUTO || '0') === '1',
    rules: 'safe-only',
  };
}

export default {
  omniHelp,
  omniStatus,
  runPredict,
  formatPredict,
  runOmniHeal,
  formatHeal,
  runOmniShadow,
  runOmniPulse,
};
