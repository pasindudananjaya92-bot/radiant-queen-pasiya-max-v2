/** Revenue Pipeline OS · 37-S5 · draft-safe stages */
const VERSION = '37-S5';

async function safeImport(p) {
  try {
    return await import(p);
  } catch (_) {
    return null;
  }
}

async function safeCall(fn, fb) {
  try {
    if (typeof fn !== 'function') return fb;
    return await fn();
  } catch (_) {
    return fb;
  }
}

const STAGES = ['new', 'warm', 'call', 'proposal', 'won', 'lost'];

export async function pipelineBoard() {
  const started = Date.now();
  const leadM = (await safeImport('./leadsManager.js')) || (await safeImport('./leadManager.js'));
  let arr = [];
  if (leadM) {
    const listFn = leadM.listLeads || leadM.list || leadM.getLeads;
    if (typeof listFn === 'function') {
      const list = await safeCall(() => listFn({ limit: 50 }), []);
      arr = Array.isArray(list) ? list : list?.items || [];
    }
  }
  const counts = Object.fromEntries(STAGES.map((s) => [s, 0]));
  for (const x of arr) {
    const st = String(x.status || x.stage || 'new').toLowerCase();
    if (counts[st] != null) counts[st]++;
    else counts.new++;
  }
  const warm = arr.filter((x) => String(x.status || '').toLowerCase() === 'warm').slice(0, 5);
  const lines = [
    '💰 *Revenue Pipeline · ' + VERSION + '*',
    'Leads total: ' + arr.length,
    '',
    ...STAGES.map((s) => '· ' + s + ': ' + counts[s]),
    '',
    '*Warm follow-ups*',
  ];
  if (!warm.length) lines.push('· none');
  else {
    for (const w of warm) {
      lines.push(
        '· ' +
          String(w.name || w.client || w.title || 'lead').slice(0, 40) +
          (w.id ? ' `' + String(w.id).slice(0, 8) + '`' : '')
      );
    }
  }
  lines.push(
    '',
    'Commands: `revenue` · `revenue board` · `lead list` · `lead status <id> | warm`',
    '_No auto messages to clients._',
    '_' + (Date.now() - started) + 'ms_'
  );
  return lines.join('\n');
}

export function helpText() {
  return [
    '💰 *Revenue Pipeline · ' + VERSION + '*',
    'Stages: new → warm → call → proposal → won/lost',
    '',
    '• `revenue` / `revenue board` — pipeline snapshot',
    '• `revenue help`',
    '',
    'Use existing: `lead add` · `lead list` · `lead status <id> | <stage>`',
    '_Draft-safe · no auto outreach._',
  ].join('\n');
}

export default { VERSION, pipelineBoard, helpText, STAGES };
