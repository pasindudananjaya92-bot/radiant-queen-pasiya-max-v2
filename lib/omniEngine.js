
/**
 * Wave 20B/C/D — OMNI-CORE (foundation)
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
    '*OMNI-MIND · Wave 20B/C/D*\n' +
    'Core online — *safe autonomy only*\n\n' +
    '• `omni help` — menu\n' +
    '• `omni status` — core status\n' +
    '• `omni pulse` — full cycle (heal + predict + coverage)\n' +
    '• `omni heal` — Auto-Healer v2 (safe whitelist)\n' +
    '• `omni predict` — limit / risk warnings\n' +
    '• `omni shadow` — night shadow pulse (manual)\n• `omni voice on|off` — TTS reply preference for OMNI\n• `omni evolve` — auto-seed + stage queue (safe)\n• `omni diagnose` — explain last fail / 429 guidance\n\n' +
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
    const immuneDetail = r.report ? String(r.report).slice(0, 400) : r.error || 'done';
    const immuneOk = r.ok !== false || /deferred|429|skipped/i.test(immuneDetail);
    actions.push({
      id: 'immune',
      ok: immuneOk,
      detail: immuneDetail.slice(0, 220),
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


/** Wave 20C — stronger predictive meters */
export async function runPredictStrong() {
  const base = await runPredict();
  const meters = [];

  // AI fallback depth
  const providers = [
    ['GROQ', process.env.GROQ_API_KEY],
    ['GEMINI', process.env.GEMINI_API_KEY],
    ['OPENROUTER', process.env.OPENROUTER_API_KEY],
  ];
  const present = providers.filter(([, v]) => v).map(([n]) => n);
  meters.push({
    key: 'ai_providers',
    value: present.length,
    max: 3,
    pct: Math.round((present.length / 3) * 100),
    label: present.join('+') || 'none',
  });
  if (present.length < 2) {
    base.warnings.push({
      level: present.length === 0 ? 'red' : 'yellow',
      key: 'ai_depth',
      msg: 'AI fallback depth ' + present.length + '/3 — add another provider key',
    });
  }

  // Search army
  const searchKeys = [process.env.TAVILY_API_KEY, process.env.EXA_API_KEY, process.env.BRAVE_API_KEY].filter(Boolean);
  meters.push({ key: 'search_keys', value: searchKeys.length, max: 3, pct: Math.round((searchKeys.length / 3) * 100), label: searchKeys.length + ' keys' });

  // Snap auto posture
  const snapAuto = String(process.env.OMNI_SNAP_AUTO || '0') === '1';
  meters.push({ key: 'snap_auto', value: snapAuto ? 1 : 0, max: 1, pct: snapAuto ? 100 : 0, label: snapAuto ? 'ON' : 'OFF' });

  // Open QA pressure
  try {
    const qa = await import('./qaEngine.js');
    const open = await qa.listTickets({ status: 'open', limit: 50 });
    const n = (open || []).length;
    meters.push({ key: 'qa_open', value: n, max: 20, pct: Math.min(100, Math.round((n / 20) * 100)), label: n + ' open' });
    if (n >= 10) {
      base.warnings.push({ level: 'yellow', key: 'qa_backlog', msg: n + ' open QA tickets — run qa clear / omni heal' });
    }
  } catch (_) {}

  base.meters = meters;
  return base;
}

export function formatPredictStrong(p) {
  const lines = [formatPredict(p), '', '*Meters*'];
  for (const m of p.meters || []) {
    const bar = '█'.repeat(Math.max(0, Math.round((m.pct || 0) / 10))) + '░'.repeat(Math.max(0, 10 - Math.round((m.pct || 0) / 10)));
    lines.push('· ' + m.key + ' ' + bar + ' ' + (m.pct || 0) + '% (' + (m.label || '') + ')');
  }
  return lines.join('\n');
}

/** Wave 20B — OMNI voice preference (reuses night voice prefs table if present) */
export async function setOmniVoice(on) {
  process.env.OMNI_VOICE = on ? '1' : '0';
  try {
    const client = sb();
    if (client) {
      await client.from('rq_voice_prefs').upsert({
        chat_id: founderChatId() || 'founder',
        omni_voice: !!on,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'chat_id' });
    }
  } catch (_) {}
  return { ok: true, omni_voice: !!on };
}

export async function maybeSpeakOmni(text) {
  if (String(process.env.OMNI_VOICE || process.env.NIGHT_VOICE || '0') !== '1') {
    return { ok: false, skipped: true };
  }
  try {
    const tts = await import('./ttsManager.js');
    const speak = tts.speak || tts.synthesize || tts.tts;
    if (typeof speak !== 'function') return { ok: false, error: 'no speak fn' };
    const audio = await speak(String(text).replace(/[*_`]/g, '').slice(0, 400), 'female');
    if (!audio?.ok || !audio.buffer) return { ok: false, error: audio?.error || 'tts fail' };
    const token = process.env.BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
    const chatId = founderChatId();
    if (!token || !chatId) return { ok: false, error: 'no chat' };
    const form = new FormData();
    form.append('chat_id', chatId);
    form.append('caption', '🎙 OMNI');
    form.append('voice', new Blob([audio.buffer], { type: 'audio/ogg' }), 'omni.ogg');
    const res = await fetch(`https://api.telegram.org/bot${token}/sendVoice`, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(15000),
    });
    const j = await res.json().catch(() => ({}));
    return { ok: !!j.ok, error: j.description };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

/** Wave 20D — evolution: seed + stage queue (NO code push) */
export async function runOmniEvolve() {
  const out = { seeded: 0, staged: [], notes: [] };
  try {
    const lab = await import('./labEngine.js');
    if (typeof lab.seedSupabaseIdeas === 'function') {
      const s = await lab.seedSupabaseIdeas({ force: false });
      out.seeded = s.created || 0;
    }
    if (typeof lab.pruneDuplicateProposals === 'function') {
      const p = await lab.pruneDuplicateProposals();
      out.notes.push('pruned ' + (p.closed || 0));
    }
    const props = await lab.listProposals({ status: 'proposed', limit: 5 });
    for (const p of (props || []).slice(0, 3)) {
      if (typeof lab.buildSafeStagePack === 'function') {
        const pack = lab.buildSafeStagePack(p);
        out.staged.push({ id: String(p.id).slice(0, 8), title: p.title, handoff: pack.handoff_text });
      }
    }
  } catch (e) {
    out.error = e.message || String(e);
  }
  return out;
}

export function formatEvolve(e) {
  const lines = [
    '🌱 *OMNI Evolve · 20D*',
    'Seeded: ' + (e.seeded || 0),
    ...(e.notes || []).map((n) => '· ' + n),
    '',
    '*Stage queue (safe — no push)*',
  ];
  if (!(e.staged || []).length) lines.push('· empty');
  for (const s of e.staged || []) {
    lines.push('· `' + s.id + '` ' + String(s.title || '').slice(0, 50));
  }
  lines.push('');
  lines.push('_Next: lab stage <id> → copy handoff to Grok → ZIP only_');
  if (e.error) lines.push('⚠️ ' + e.error);
  return lines.join('\n');
}

/** Diagnose heal failures (429 etc.) + open QA note */
export async function diagnoseOmniFail(healResult) {
  const fails = (healResult?.actions || []).filter((a) => !a.ok);
  const immuneDetail = (healResult?.actions || []).find((a) => a.id === 'immune')?.detail || '';
  const tips = [];
  if (/429|rate.?limit/i.test(JSON.stringify(healResult))) {
    tips.push('cron-job.org HTTP 429: too many API calls. OMNI now backs off. Wait 1–2 min; do not spam omni heal.');
    tips.push('Fix applied: cronManager retries + delay between enableJob; healer treats 429 as deferred skip.');
  }
  if (!fails.length && /429/.test(immuneDetail)) {
    tips.push('Immune reported 429 but marked deferred — system healthy; cron API cool-down only.');
  }
  if (!tips.length) {
    tips.push('No known rate-limit signature. Run coverage scan + qa probe. Open QA ticket if FAIL.');
  }

  try {
    const qa = await import('./qaEngine.js');
    if (typeof qa.openTicket === 'function' && /429/.test(JSON.stringify(healResult))) {
      await qa.openTicket({
        title: 'OMNI: cron API 429 deferred',
        detail: tips.join(' | '),
        fingerprint: 'omni:cron:429',
        severity: 'yellow',
      });
    }
  } catch (_) {}

  return {
    ok: true,
    tips,
    text: '🔎 *OMNI Diagnose*\n' + tips.map((t) => '· ' + t).join('\n'),
  };
}

export default {
  omniHelp,
  omniStatus,
  runPredict,
  formatPredict,
  runPredictStrong,
  formatPredictStrong,
  runOmniHeal,
  formatHeal,
  runOmniShadow,
  runOmniPulse,
  setOmniVoice,
  maybeSpeakOmni,
  runOmniEvolve,
  formatEvolve,
  diagnoseOmniFail,
};
