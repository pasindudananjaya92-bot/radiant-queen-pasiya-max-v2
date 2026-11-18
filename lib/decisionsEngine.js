/**
 * Wave 27A — Queen Decisions Checker
 * Gemini Decisions API (gemini-decision-1) via REST — FREE TIER ONLY.
 *
 * Safety:
 * - Uses existing GEMINI_API_KEY only (no separate paid key path)
 * - DECISIONS_ENABLED=0 forces off
 * - On 429 / RESOURCE_EXHAUSTED / permission paid-only → circuit OPEN (auto-OFF cooldown)
 * - Never moves money, never auto-publishes, never auto-sends
 * - Fallback: structured text via aiRouter (still free providers)
 */
export const VERSION = '27A';

const DECISIONS_URL = 'https://generativelanguage.googleapis.com/v1beta/decisions';
const MODEL = process.env.DECISIONS_MODEL || 'gemini-decision-1';

/** Circuit breaker (process memory — resets on cold start, which is OK on Hobby) */
let circuitOpenUntil = 0;
let lastError = null;
let lastOkAt = 0;
let callCount = 0;

function geminiKey() {
  return process.env.GEMINI_API_KEY || process.env.GEMINI_KEY || '';
}

export function decisionsEnabled() {
  if (String(process.env.DECISIONS_ENABLED || '1') === '0') return false;
  if (!geminiKey()) return false;
  if (Date.now() < circuitOpenUntil) return false;
  return true;
}

export function decisionsStatus() {
  const open = Date.now() < circuitOpenUntil;
  return {
    version: VERSION,
    enabled_flag: String(process.env.DECISIONS_ENABLED || '1') !== '0',
    has_key: Boolean(geminiKey()),
    circuit_open: open,
    circuit_open_until: open ? new Date(circuitOpenUntil).toISOString() : null,
    last_error: lastError ? String(lastError).slice(0, 200) : null,
    last_ok_at: lastOkAt || null,
    calls_this_instance: callCount,
    model: MODEL,
  };
}

function openCircuit(ms, reason) {
  const wait = Math.max(60_000, Number(ms) || 300_000);
  circuitOpenUntil = Date.now() + wait;
  lastError = reason || 'circuit open';
}

function isQuotaError(status, body) {
  const s = String(body || '').toLowerCase();
  if (status === 429) return true;
  if (/resource_exhausted|quota|rate limit|too many requests/.test(s)) return true;
  if (/billing|payment|enable billing|paid tier only/.test(s)) return true;
  return false;
}

/**
 * Core REST call. questions = { id: { type, instructions, criteria? } }
 */
export async function runDecisions({ input, questions }) {
  if (!decisionsEnabled()) {
    return {
      ok: false,
      offline: true,
      error: circuitOpenUntil > Date.now()
        ? 'Decisions auto-OFF (quota/circuit). Wait or use fallback.'
        : 'Decisions OFF — set GEMINI_API_KEY and DECISIONS_ENABLED=1',
      status: decisionsStatus(),
    };
  }
  const key = geminiKey();
  const body = {
    model: MODEL,
    input: String(input || '').slice(0, 12000),
    questions: questions || {},
  };
  callCount += 1;
  try {
    const r = await fetch(DECISIONS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': key,
      },
      body: JSON.stringify(body),
    });
    const text = await r.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text.slice(0, 400) };
    }
    if (!r.ok) {
      const errMsg = data?.error?.message || data?.raw || text.slice(0, 200);
      if (isQuotaError(r.status, errMsg)) {
        openCircuit(15 * 60 * 1000, `HTTP ${r.status}: ${errMsg}`);
      } else {
        lastError = `HTTP ${r.status}: ${errMsg}`;
      }
      return { ok: false, status: r.status, error: errMsg, data, circuit: decisionsStatus() };
    }
    lastOkAt = Date.now();
    lastError = null;
    return { ok: true, answers: data.answers || data, usage: data.usage || null, raw: data };
  } catch (e) {
    lastError = e.message || String(e);
    if (/fetch failed|network/i.test(lastError)) {
      openCircuit(120_000, lastError);
    }
    return { ok: false, error: lastError, circuit: decisionsStatus() };
  }
}

/** Fallback using existing free text router — structured YES/NO lines */
async function fallbackTextDecide(input, mode) {
  try {
    const ai = await import('./aiRouter.js');
    const system =
      'You are a strict classifier. Reply ONLY with lines key=value. No markdown.';
    let user = '';
    if (mode === 'route') {
      user =
        `Classify this message into one department.\n` +
        `Reply exactly:\n` +
        `department=billing|technical|qa|site|deal|other\nconfidence=0.0-1.0\n` +
        `TEXT:\n${String(input).slice(0, 3000)}`;
    } else if (mode === 'score') {
      user =
        `Score severity 0-2 (0=cosmetic,1=workaround,2=blocked).\n` +
        `Reply exactly:\nscore=0|1|2\nconfidence=0.0-1.0\n` +
        `TEXT:\n${String(input).slice(0, 3000)}`;
    } else {
      user =
        `Answer yes/no checks.\n` +
        `Reply exactly:\n` +
        `money_risk=yes|no\nurgent=yes|no\nspam=yes|no\nneeds_founder=yes|no\nconfidence=0.0-1.0\n` +
        `TEXT:\n${String(input).slice(0, 3000)}`;
    }
    const r = await ai.routeTextAI({ system, user });
    return { ok: true, fallback: true, provider: r.provider, text: r.text };
  } catch (e) {
    return { ok: false, fallback: true, error: e.message || String(e) };
  }
}

export async function checkText(input) {
  const questions = {
    money_risk: {
      type: 'noul',
      instructions: 'Does this involve money movement, payment, refund, or invoice send risk?',
      criteria: {
        true_description: 'Asks to charge, refund, send invoice live, or move funds.',
        false_description: 'General chat, pricing talk without executing payment.',
      },
    },
    urgent: {
      type: 'noul',
      instructions: 'Is this time-urgent (outage, down system, blocked founder)?',
    },
    spam: {
      type: 'noul',
      instructions: 'Is this spam, scam, or irrelevant noise?',
    },
    needs_founder: {
      type: 'noul',
      instructions: 'Should only the Founder approve the next action (money/code/publish)?',
    },
  };
  const r = await runDecisions({ input, questions });
  if (r.ok) return { ...r, mode: 'check' };
  const fb = await fallbackTextDecide(input, 'check');
  return { ...fb, mode: 'check', primary_error: r.error };
}

export async function routeText(input) {
  const questions = {
    department: {
      type: 'choice',
      instructions: 'Which Queen OS department should handle this?',
      criteria: {
        billing: 'Payments, invoices, bank, refunds.',
        technical: 'Bot bugs, deploy, Vercel, errors.',
        qa: 'QA tickets, probes, test failures.',
        site: 'Website content, pricing page, Web Master.',
        deal: 'Client deals, proposals, twin drafts.',
        other: 'Anything else.',
      },
    },
  };
  const r = await runDecisions({ input, questions });
  if (r.ok) return { ...r, mode: 'route' };
  const fb = await fallbackTextDecide(input, 'route');
  return { ...fb, mode: 'route', primary_error: r.error };
}

export async function scoreText(input) {
  const questions = {
    severity: {
      type: 'score',
      instructions: 'How severe is this issue for the Founder mobile OS?',
      criteria: [
        'Cosmetic: no lost functionality.',
        'Workaround available: task fails but another path works.',
        'Fully blocked: critical path down with no workaround.',
      ],
    },
  };
  const r = await runDecisions({ input, questions });
  if (r.ok) return { ...r, mode: 'score' };
  const fb = await fallbackTextDecide(input, 'score');
  return { ...fb, mode: 'score', primary_error: r.error };
}

function fmtNoul(a) {
  if (!a) return '—';
  const p = Number(a.noul);
  const yes = p >= 0.5;
  return `${yes ? 'YES' : 'NO'} (p=${p.toFixed(2)} · conf=${Number(a.confidence || 0).toFixed(2)})`;
}

export function formatCheckResult(r) {
  const st = decisionsStatus();
  const lines = [`⚖ *Decisions · ${VERSION}*`, ''];
  if (r.fallback) {
    lines.push('_Fallback text classifier (Decisions API unavailable)_');
    lines.push(String(r.text || r.error || '').slice(0, 1500));
    if (r.primary_error) lines.push('', 'Primary: ' + String(r.primary_error).slice(0, 160));
    return lines.join('\n');
  }
  if (!r.ok) {
    lines.push('❌ ' + (r.error || 'fail'));
    if (st.circuit_open) lines.push('🔒 Auto-OFF until ' + st.circuit_open_until);
    lines.push('', '_No paid upgrade attempted. Free tier only._');
    return lines.join('\n');
  }
  const a = r.answers || {};
  lines.push('· money_risk: ' + fmtNoul(a.money_risk));
  lines.push('· urgent: ' + fmtNoul(a.urgent));
  lines.push('· spam: ' + fmtNoul(a.spam));
  lines.push('· needs_founder: ' + fmtNoul(a.needs_founder));
  if (r.usage?.total_input_tokens != null) {
    lines.push('', `Tokens in: ${r.usage.total_input_tokens} · out: 0`);
  }
  lines.push('', '_Draft advice only — no auto money/code actions._');
  return lines.join('\n');
}

export function formatRouteResult(r) {
  const lines = [`⚖ *Decisions route · ${VERSION}*`, ''];
  if (r.fallback) {
    lines.push('_Fallback_');
    lines.push(String(r.text || r.error || '').slice(0, 1200));
    return lines.join('\n');
  }
  if (!r.ok) return lines.concat(['❌ ' + (r.error || 'fail')]).join('\n');
  const a = r.answers?.department || r.answers?.department;
  if (a?.type === 'choice' || a?.choice) {
    lines.push(`Department: *${a.choice}*`);
    lines.push(`Confidence: ${Number(a.confidence || 0).toFixed(2)}`);
    if (a.probabilities) {
      const top = Object.entries(a.probabilities)
        .sort((x, y) => y[1] - x[1])
        .slice(0, 4)
        .map(([k, v]) => `${k}=${Number(v).toFixed(2)}`)
        .join(' · ');
      lines.push(top);
    }
  } else {
    lines.push(JSON.stringify(r.answers).slice(0, 500));
  }
  lines.push('', '_Suggestion only — Founder routes actions._');
  return lines.join('\n');
}

export function formatScoreResult(r) {
  const lines = [`⚖ *Decisions score · ${VERSION}*`, ''];
  if (r.fallback) {
    lines.push('_Fallback_');
    lines.push(String(r.text || r.error || '').slice(0, 1200));
    return lines.join('\n');
  }
  if (!r.ok) return lines.concat(['❌ ' + (r.error || 'fail')]).join('\n');
  const a = r.answers?.severity;
  if (a) {
    lines.push(`Score: *${Number(a.score).toFixed(2)}* (0=cosmetic … 2=blocked)`);
    lines.push(`Confidence: ${Number(a.confidence || 0).toFixed(2)}`);
    if (a.legend) lines.push('Legend: ' + JSON.stringify(a.legend).slice(0, 200));
  } else {
    lines.push(JSON.stringify(r.answers).slice(0, 500));
  }
  return lines.join('\n');
}

export function decisionsHelp() {
  return [
    `⚖ *Queen Decisions · ${VERSION}*`,
    'Gemini Decisions API · free tier only · 0 output tokens',
    '',
    '• `decide help` — this menu',
    '• `decide status` — key / circuit / auto-OFF',
    '• `decide check <text>` — money risk · urgent · spam · founder gate',
    '• `decide route <text>` — billing|technical|qa|site|deal|other',
    '• `decide score <text>` — severity 0–2',
    '',
    '_If free quota hits: auto-OFF (circuit). Never opens paid billing._',
    '_Fallback uses existing free Groq/OpenRouter/Gemini text router._',
  ].join('\n');
}

export default {
  VERSION,
  decisionsEnabled,
  decisionsStatus,
  runDecisions,
  checkText,
  routeText,
  scoreText,
  formatCheckResult,
  formatRouteResult,
  formatScoreResult,
  decisionsHelp,
};
