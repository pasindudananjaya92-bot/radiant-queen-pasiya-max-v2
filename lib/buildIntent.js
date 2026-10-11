/**
 * Pasiya Builder Robot — intent parser Phase 2
 * Sinhala + English, chains, payload extraction
 */

const RULES = [
  { intent: 'weather', re: /(weather|වෙදර්|කාලගුණ|temperature|උෂ්ණත්ව)/i, target: 'desk:weather' },
  { intent: 'note', re: /(note|නෝට්|ලියන්න|write\s+note|memo)/i, target: 'native:notes' },
  { intent: 'reminder', re: /(remind|ටාස්ක්|task|reminder|මතක්|කාර්ය)/i, target: 'native:reminders' },
  { intent: 'calendar', re: /(calendar|කැලෙන්ඩර්|event|සිද්ධි|planner|schedule)/i, target: 'native:calendar' },
  { intent: 'photo', re: /(photo|ෆෝටෝ|camera|කැමරා|රූප|picture)/i, target: 'native:camera' },
  { intent: 'photos', re: /(photos|ගැලරි|gallery|album)/i, target: 'native:photos' },
  { intent: 'calc', re: /(calc|ගණන්|calculate|කැල්කියුලේටර්|\d+\s*[\+\-\*x×\/÷])/i, target: 'native:calc' },
  { intent: 'translate', re: /(translate|පරිවර්තන)/i, target: 'desk:translate' },
  { intent: 'files', re: /(file|ෆයිල්|documents|explorer|folder)/i, target: 'desk:explorer' },
  { intent: 'health', re: /(health|සෞඛ්‍ය|fitness|rings)/i, target: 'native:health' },
  { intent: 'mail', re: /(mail|ඊමේල්|email|draft)/i, target: 'native:mail' },
  { intent: 'drop', re: /(drop|airdrop|share\s+code)/i, target: 'native:drop' },
  { intent: 'vault', re: /(vault|රහස්|password)/i, target: 'desk:vault' },
  { intent: 'coins', re: /(bitcoin|crypto|coins|price)/i, target: 'desk:coins' },
  { intent: 'wiki', re: /(wiki|wikipedia)/i, target: 'desk:wiki' },
  { intent: 'settings', re: /(settings|සැකසුම්|wallpaper)/i, target: 'native:settings' },
  { intent: 'desktop', re: /(desktop|ඩෙස්ක්ටොප්)/i, target: 'native:desktop' },
  { intent: 'search', re: /(search|සොයන්න|find\s+file)/i, target: 'desk:findfs' },
  { intent: 'diag', re: /(diag|syscheck)/i, target: 'desk:diag' },
];

function stripIntentWord(part, patterns) {
  let t = String(part || '').trim();
  for (const p of patterns) t = t.replace(p, '').trim();
  // remove leading filler
  t = t.replace(/^(a|an|the|to|for|කරන්න|එකක්|එක)\s+/i, '').trim();
  return t;
}

export function parseIntent(text) {
  const raw = String(text || '').trim();
  if (!raw) return { ok: false, error: 'empty', steps: [] };

  const parts = raw.split(/\s+(?:and|සහ|\+)\s+/i).map((s) => s.trim()).filter(Boolean);
  const steps = [];

  for (const part of parts) {
    let hit = null;

    // Explicit payload forms first
    let m = part.match(/^(?:note|නෝට්)\s+(.+)/i);
    if (m) {
      hit = { intent: 'note_write', target: 'native:notes', text: part, payload: m[1].trim() };
    }
    if (!hit) {
      m = part.match(/^(?:remind(?:er)?|task|ටාස්ක්|මතක්)\s+(.+)/i);
      if (m) hit = { intent: 'reminder_add', target: 'native:reminders', text: part, payload: m[1].trim() };
    }
    if (!hit) {
      m = part.match(/^(?:calendar|event|planner|කැලෙන්ඩර්|සිද්ධි)\s+(.+)/i);
      if (m) hit = { intent: 'calendar_add', target: 'native:calendar', text: part, payload: m[1].trim() };
    }

    if (!hit) {
      for (const r of RULES) {
        if (r.re.test(part)) {
          // If matched calendar/note/reminder with trailing words, treat as add
          if (r.intent === 'calendar') {
            const payload = stripIntentWord(part, [/^calendar\s*/i, /^event\s*/i, /^planner\s*/i, /^කැලෙන්ඩර්\s*/i, /^සිද්ධි\s*/i]);
            if (payload && payload.toLowerCase() !== 'calendar' && !/^(open|app|බලන්න)$/i.test(payload)) {
              hit = { intent: 'calendar_add', target: r.target, text: part, payload };
            } else {
              hit = { intent: 'calendar', target: r.target, text: part };
            }
          } else if (r.intent === 'note') {
            const payload = stripIntentWord(part, [/^note\s*/i, /^නෝට්\s*/i, /^memo\s*/i, /^ලියන්න\s*/i]);
            if (payload && !/^(open|app|බලන්න)$/i.test(payload)) {
              hit = { intent: 'note_write', target: r.target, text: part, payload };
            } else {
              hit = { intent: 'note', target: r.target, text: part };
            }
          } else if (r.intent === 'reminder') {
            const payload = stripIntentWord(part, [/^remind(?:er)?\s*/i, /^task\s*/i, /^ටාස්ක්\s*/i, /^මතක්\s*/i]);
            if (payload && !/^(open|app|බලන්න)$/i.test(payload)) {
              hit = { intent: 'reminder_add', target: r.target, text: part, payload };
            } else {
              hit = { intent: 'reminder', target: r.target, text: part };
            }
          } else {
            hit = { intent: r.intent, target: r.target, text: part };
          }
          break;
        }
      }
    }

    // Chain fragment that is ONLY a payload after "calendar and Meeting"
    // e.g. second part "Meeting" with no keyword — attach as calendar if previous was calendar? 
    // handled at chain level in UI by carrying context; here mark unknown with payload guess
    if (!hit) {
      hit = { intent: 'unknown', text: part, suggestion: 'Try: calendar Meeting · note Buy milk · remind Call Amma · weather' };
    }
    steps.push(hit);
  }

  // Second pass: unknown short payloads after calendar/note/remind in chain
  for (let i = 1; i < steps.length; i++) {
    if (steps[i].intent !== 'unknown') continue;
    const prev = steps[i - 1];
    const t = steps[i].text;
    if (!t || t.length > 80) continue;
    if (prev.intent === 'calendar' || prev.intent === 'calendar_add') {
      steps[i] = { intent: 'calendar_add', target: 'native:calendar', text: t, payload: t };
    } else if (prev.intent === 'note' || prev.intent === 'note_write') {
      steps[i] = { intent: 'note_write', target: 'native:notes', text: t, payload: t };
    } else if (prev.intent === 'reminder' || prev.intent === 'reminder_add') {
      steps[i] = { intent: 'reminder_add', target: 'native:reminders', text: t, payload: t };
    }
  }

  return { ok: true, steps, raw };
}

export function listManualActions() {
  return RULES.map((r) => ({ intent: r.intent, target: r.target }));
}
