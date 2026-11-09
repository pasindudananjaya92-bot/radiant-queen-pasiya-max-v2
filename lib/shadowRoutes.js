import * as sm from './shadowManager.js';

function clean(text) {
  return String(text || '').replace(/^\//, '').trim();
}

export async function tryHandle(raw) {
  const t = clean(raw);
  if (!t) return null;
  const low = t.toLowerCase();

  if (!/^(shadow\b|shadow:)/i.test(t) && low !== 'shadow') return null;

  if (/^shadow\s+help$/i.test(t) || low === 'shadow') return sm.helpText();

  // shadow: task  OR shadow task
  let m = t.match(/^shadow\s*:\s*(.+)$/i) || t.match(/^shadow\s+(?!list|done|delete|del|morning|help|run)(.+)$/i);
  if (m) {
    const task = m[1].trim();
    const row = await sm.addTask(task);
    return (
      '✅ Shadow task saved\n' +
      'id: `' + row.id + '`\n' +
      'tags: ' + (row.tags || []).join(', ') + '\n' +
      'due: ' + (row.due_at || 'morning')
    );
  }

  if (/^shadow\s+list\b/i.test(t)) {
    const pending = await sm.listTasks({ status: 'pending', limit: 20 });
    if (!pending.length) return 'Shadow: no pending tasks.';
    return (
      '👑 Shadow pending (' + pending.length + ')\n\n' +
      pending
        .map(
          (x, i) =>
            (i + 1) + '. `' + String(x.id).slice(0, 8) + '` · ' + x.raw_text.slice(0, 120)
        )
        .join('\n')
    );
  }

  m = t.match(/^shadow\s+(done|delete|del)\s+([0-9a-f-]{8,})$/i);
  if (m) {
    const op = m[1].toLowerCase();
    const id = m[2];
    // allow short uuid prefix match
    const all = await sm.listTasks({ status: 'all', limit: 50 });
    const hit = all.find((x) => x.id === id || String(x.id).startsWith(id));
    if (!hit) return 'Task not found: ' + id;
    await sm.setTaskStatus(hit.id, op === 'done' ? 'done' : 'cancelled');
    return (op === 'done' ? '✅ Marked done: ' : '🗑 Deleted: ') + hit.raw_text.slice(0, 100);
  }

  if (/^shadow\s+(morning|run)\b/i.test(t)) {
    const r = await sm.runMorningReport({ sendTelegram: true });
    if (r.empty) return r.body;
    return '✅ Morning report sent (' + r.task_count + ' tasks)\n\n' + r.body.slice(0, 3500);
  }

  return sm.helpText();
}

export { tryHandle as tryShadowHandle };
