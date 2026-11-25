/**
 * Setup-1 · Signal Nervous System
 * Runs health snapshot → emitSignal for failures → summary for Telegram / morning
 */
import { emitSignal, listSignals, status as signalStatus } from './signalManager.js';

export const VERSION = '37A-S1';

async function runHealth() {
  try {
    const hm = await import('./healthManager.js');
    if (typeof hm.runFullCheck === 'function') return hm.runFullCheck();
  } catch (_) {}
  // soft fallback — never throw
  return {
    allOk: true,
    checks: [],
    ts: new Date().toISOString(),
    soft: true,
  };
}

/**
 * Scan system, emit signals for DOWN checks (dedupe by kind+title within recent).
 */
export async function nerveScan({ emit = true } = {}) {
  const started = Date.now();
  const health = await runHealth();
  const checks = health.checks || [];
  const down = checks.filter((c) => c && c.ok === false && c.name !== 'Upstash');
  const emitted = [];

  if (emit && down.length) {
    for (const c of down.slice(0, 8)) {
      const r = await emitSignal({
        kind: 'health',
        source: 'nervous',
        title: `${c.name} DOWN`,
        body: String(c.detail || 'fail').slice(0, 500),
        level: 'error',
        meta: { name: c.name, detail: c.detail },
      });
      if (r.ok) emitted.push({ name: c.name, id: r.id });
    }
  } else if (emit && health.allOk && !health.soft) {
    // occasional heartbeat only when forced via signal pulse -- skip spam
  }

  const sig = await signalStatus();
  const unseen = await listSignals({ limit: 5, unseenOnly: true });

  return {
    ok: true,
    version: VERSION,
    ms: Date.now() - started,
    healthOk: Boolean(health.allOk),
    down: down.map((c) => `${c.name}: ${c.detail}`),
    emitted: emitted.length,
    signalLine: sig.line,
    unseen: (unseen.rows || []).length,
    checks,
  };
}

export function formatNerveReport(r) {
  const lines = [
    `🧬 *Nervous System · ${r.version}*`,
    r.healthOk ? '🩺 Health: GREEN' : '🩺 Health: YELLOW/RED',
    r.down?.length ? `Down:\n${r.down.map((d) => '· ' + d).join('\n')}` : '· No required services down',
    `Signals emitted this scan: ${r.emitted}`,
    r.signalLine || '',
    `Unseen signals: ${r.unseen}`,
    `_${r.ms}ms_`,
  ];
  return lines.filter(Boolean).join('\n');
}

/** Short block for morning pack */
export async function sectionNerveSignals() {
  try {
    const unseen = await listSignals({ limit: 5, unseenOnly: true });
    if (!unseen.ok) return '📡 *Signals*\n—';
    const n = (unseen.rows || []).length;
    if (!n) return '📡 *Signals*\nUnseen: 0 · desk quiet';
    const tops = (unseen.rows || [])
      .slice(0, 3)
      .map((x) => `· ${x.title}`)
      .join('\n');
    return `📡 *Signals*\nUnseen: ${n}\n${tops}`;
  } catch {
    return '📡 *Signals*\n—';
  }
}
