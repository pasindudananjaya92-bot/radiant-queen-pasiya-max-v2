const VERSION = '37-S3.1';

async function safeImport(path) {
  try {
    return await import(path);
  } catch (_) {
    return null;
  }
}

async function safeCall(fn, fallback) {
  try {
    if (typeof fn !== 'function') return fallback;
    return await fn();
  } catch (_) {
    return fallback;
  }
}

export async function scanIncidents() {
  const started = Date.now();
  const findings = [];
  const playbooks = [];

  const healthM = await safeImport('./healthManager.js');
  if (healthM && typeof healthM.runFullCheck === 'function') {
    const h = await safeCall(() => healthM.runFullCheck(), null);
    if (h && typeof h === 'object') {
      const checks = [
        ['vercel', h.vercel],
        ['supabase', h.supabase],
        ['make', h.make],
        ['cron', h.cron],
        ['upstash', h.upstash],
        ['snap', h.snap],
      ];
      for (const [name, c] of checks) {
        if (c && c.ok === false) {
          findings.push({
            severity: 'red',
            source: 'health',
            title: name + ' down / weak',
            detail: c.error || c.message || 'failed',
          });
          playbooks.push('health · check ' + name + ' · retry once');
        }
      }
    }
  }

  const sigM = await safeImport('./signalManager.js');
  if (sigM && typeof sigM.listSignals === 'function') {
    const list = await safeCall(() => sigM.listSignals({ limit: 10, unseenOnly: true }), []);
    const arr = Array.isArray(list) ? list : list?.items || [];
    for (const s of arr.slice(0, 5)) {
      findings.push({
        severity: s.level === 'red' || s.severity === 'red' ? 'red' : 'yellow',
        source: 'signal',
        title: s.title || s.message || 'signal',
        detail: s.source || s.kind || '',
      });
    }
    if (arr.length) playbooks.push('`signal list` · `signal read` when reviewed');
  }

  const gops = await safeImport('./gopsManager.js');
  if (gops && typeof gops.listActions === 'function') {
    const runs = await safeCall(() => gops.listActions({ limit: 8 }), []);
    const arr = Array.isArray(runs) ? runs : runs?.items || runs?.workflow_runs || [];
    const failed = arr.filter((r) => {
      const c = String(r.conclusion || r.status || '').toLowerCase();
      return c === 'failure' || c === 'failed' || c === 'timed_out';
    });
    for (const r of failed.slice(0, 3)) {
      findings.push({
        severity: 'red',
        source: 'gops',
        title: 'CI fail: ' + (r.name || r.display_title || 'workflow'),
        detail: r.html_url || r.url || '',
      });
      playbooks.push('`gops actions` · fix syntax · re-upload single file');
    }
  }

  if (findings.length && sigM && typeof sigM.emitSignal === 'function') {
    await safeCall(
      () =>
        sigM.emitSignal({
          title: 'Incident scan: ' + findings.length + ' finding(s)',
          level: findings.some((f) => f.severity === 'red') ? 'yellow' : 'green',
          source: 'incident/scan',
          meta: { count: findings.length },
        }),
      null
    );
  }

  return {
    ok: true,
    findings,
    playbooks: [...new Set(playbooks)].slice(0, 6),
    ms: Date.now() - started,
  };
}

export function formatScan(result) {
  const { findings, playbooks, ms } = result;
  if (!findings.length) {
    return [
      '🛡 *Incident Commander · ' + VERSION + '*',
      '✅ Clear — no active incidents',
      playbooks.length ? playbooks.map((p) => '· ' + p).join('\n') : '',
      '_' + ms + 'ms · read-only_',
    ]
      .filter(Boolean)
      .join('\n');
  }
  const lines = findings.slice(0, 8).map((f, i) => {
    const icon = f.severity === 'red' ? '🔴' : '🟡';
    return (i + 1) + '. ' + icon + ' *' + f.title + '*\n   ' + f.source + (f.detail ? ' · ' + String(f.detail).slice(0, 80) : '');
  });
  return [
    '🛡 *Incident Commander · ' + VERSION + '*',
    'Findings: ' + findings.length,
    '',
    ...lines,
    '',
    '*Suggested*',
    ...(playbooks.length ? playbooks.map((p) => '· ' + p) : ['· `health` · `gops watch`']),
    '',
    '_No auto code push. Optional: `incident ticket` opens GitHub issue._',
    '_' + ms + 'ms_',
  ].join('\n');
}

export async function openTicket(title, body) {
  const gops = await safeImport('./gopsManager.js');
  if (!gops || typeof gops.openIssue !== 'function') {
    return { ok: false, error: 'gops_unavailable' };
  }
  const t = title || 'Queen OS incident ' + new Date().toISOString().slice(0, 10);
  const b =
    body ||
    [
      'Opened from Telegram · Incident Commander 37-S3.1',
      '',
      'Run `incident scan` for live state.',
      'No secrets in this issue.',
    ].join('\n');
  try {
    return await gops.openIssue(t, b);
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

export function helpText() {
  return [
    '🛡 *Incident Commander · ' + VERSION + '*',
    'Classify → signal → optional GOps issue',
    '',
    '• `incident` / `incident scan` — live scan',
    '• `incident ticket` — open GitHub issue (Founder)',
    '• `incident ticket | <title>` — custom title',
    '• `incident help`',
    '',
    'Sources: health · signals · gops actions',
    '_Never silent git push. Never money moves._',
  ].join('\n');
}

export default { VERSION, scanIncidents, formatScan, openTicket, helpText };
