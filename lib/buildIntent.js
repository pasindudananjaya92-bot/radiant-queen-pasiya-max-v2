/** Builder intent rules — Phase 4 fix2 (memoji before note) */
const RULES = [
  { intent: 'summarize', re: /(summarize|summary|සාරාංශ)/i, target: 'native:summarize' },
  { intent: 'friends', re: /(friends|find\s*my\s*friends|යාළු)/i, target: 'native:friends' },
  { intent: 'memoji', re: /(memoji|emoji\s*face)/i, target: 'native:memoji' },
  { intent: 'pay', re: /(^|\s)(pay|wallet\s*pay|ගෙවීම)(\s|$)/i, target: 'native:wallet2' },
  { intent: 'live', re: /(^|\s)(live|liveact|live\s*activity)(\s|$)/i, target: 'native:liveact' },
  { intent: 'fold', re: /(fold|dual\s*screen|flagship)/i, target: 'native:flagship' },
  { intent: 'weather', re: /(weather|වෙදර්|කාලගුණ)/i, target: 'desk:weather' },
  { intent: 'reminder', re: /(remind|task|reminder|ටාස්ක්)/i, target: 'native:reminders' },
  { intent: 'calendar', re: /(calendar|event|planner|කැලෙන්ඩර්)/i, target: 'native:calendar' },
  { intent: 'note', re: /(^|\s)(note|නෝට්)(\s|$)|^note\s+/i, target: 'native:notes' },
];

export function parseIntent(text) {
  const raw = String(text || '').trim();
  if (!raw) return { ok: false, steps: [] };
  const parts = raw.split(/\s+(?:and|සහ|\+)\s+/i).map((s) => s.trim()).filter(Boolean);
  const steps = [];
  for (const part of parts) {
    let hit = null;
    if (/^(?:summarize|summary)$/i.test(part)) hit = { intent: 'summarize', target: 'native:summarize', text: part };
    if (!hit && /^memoji$/i.test(part)) hit = { intent: 'memoji', target: 'native:memoji', text: part };
    if (!hit && /^(?:pay|wallet\s*pay)$/i.test(part)) hit = { intent: 'pay', target: 'native:wallet2', text: part };
    if (!hit && /^(?:live|liveact)$/i.test(part)) hit = { intent: 'live', target: 'native:liveact', text: part };
    if (!hit && /^friends$/i.test(part)) hit = { intent: 'friends', target: 'native:friends', text: part };
    if (!hit && /^fold$/i.test(part)) hit = { intent: 'fold', target: 'native:flagship', text: part };
    const nm = part.match(/^(?:note|නෝට්)\s+(.+)/i);
    if (!hit && nm) hit = { intent: 'note_write', target: 'native:notes', text: part, payload: nm[1].trim() };
    if (!hit) {
      for (const r of RULES) {
        if (r.re.test(part)) {
          hit = { intent: r.intent, target: r.target, text: part };
          break;
        }
      }
    }
    if (!hit) hit = { intent: 'unknown', text: part };
    steps.push(hit);
  }
  return { ok: true, steps, raw };
}
