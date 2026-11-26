import * as g from './memoryGraph.js';

export async function tryHandle(text, ctx) {
  const raw = String(text || '').trim().replace(/^\//, '');
  if (!/^(graph|memgraph)\b/i.test(raw)) return null;

  const rest = raw.replace(/^(graph|memgraph)\s*/i, '').trim();
  const parts = rest.split('|').map((s) => s.trim());
  const head = (parts[0] || '').toLowerCase();
  const cmd = (head.split(/\s+/)[0] || '').toLowerCase();

  if (!rest || cmd === 'help' || cmd === '?') return g.helpText();

  if (cmd === 'add') {
    // graph add person | Name | note  OR graph add | person | Name | note
    let kind, name, note;
    const tokens = head.split(/\s+/);
    if (tokens.length >= 2 && ['person', 'project', 'link', 'note'].includes(tokens[1])) {
      kind = tokens[1];
      name = parts[1] || tokens.slice(2).join(' ');
      note = parts[2] || parts[1] || name;
    } else {
      kind = parts[1] || 'note';
      name = parts[2] || parts[1] || 'node';
      note = parts[3] || parts[2] || name;
    }
    const r = await g.graphAdd(kind, name, note);
    if (!r.ok) return '❌ Graph add: ' + (r.error || 'fail');
    return '✅ Graph node saved\n' + r.key_display;
  }

  if (cmd === 'list') {
    const kind = head.split(/\s+/)[1] || parts[1] || '';
    const r = await g.graphList(kind);
    if (!r.ok) return '❌ Graph list: ' + (r.error || 'fail');
    return '🗂 *Graph list*\n' + g.formatList(r.rows);
  }

  if (cmd === 'ask' || cmd === 'find' || cmd === 'search') {
    const q = parts[1] || head.replace(/^(ask|find|search)\s*/i, '').trim();
    const r = await g.graphAsk(q);
    return g.formatAsk(r, q);
  }

  // graph wifi password
  const r = await g.graphAsk(rest);
  return g.formatAsk(r, rest);
}

export default { tryHandle };
