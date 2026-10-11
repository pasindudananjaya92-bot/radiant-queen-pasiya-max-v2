/**
 * Pasiya Builder Robot — intent parser (Sinhala + English)
 * Pure JS, no Node-only APIs. Safe for Mini App + optional server reuse.
 */

const RULES = [
  { intent: 'weather', re: /(weather|වෙදර්|කාලගුණ|temperature|උෂ්ණත්ව)/i, app: 'weather', target: 'desk:weather' },
  { intent: 'note', re: /(note|නෝට්|ලියන්න|write\s+note|memo)/i, app: 'notes', target: 'native:notes' },
  { intent: 'reminder', re: /(remind|ටාස්ක්|task|reminder|මතක්|කාර්ය)/i, app: 'reminders', target: 'native:reminders' },
  { intent: 'calendar', re: /(calendar|කැලෙන්ඩර්|event|සිද්ධි|planner)/i, app: 'calendar', target: 'native:calendar' },
  { intent: 'photo', re: /(photo|ෆෝටෝ|camera|කැමරා|රූප|picture)/i, app: 'camera', target: 'native:camera' },
  { intent: 'photos', re: /(photos|ගැලරි|gallery|album)/i, app: 'photos', target: 'native:photos' },
  { intent: 'calc', re: /(calc|ගණන්|calculate|කැල්කියුලේටර්|\d+\s*[\+\-\*x×\/÷])/i, app: 'calc', target: 'native:calc' },
  { intent: 'translate', re: /(translate|පරිවර්තන|සිංහල|english)/i, app: 'translate', target: 'desk:translate' },
  { intent: 'files', re: /(file|ෆයිල්|documents|explorer|folder)/i, app: 'files', target: 'desk:explorer' },
  { intent: 'terminal', re: /(terminal|ටර්මිනල්|shell|command line)/i, app: 'term', target: 'desk:term' },
  { intent: 'health', re: /(health|සෞඛ්‍ය|fitness|rings|ව්‍යායාම)/i, app: 'health', target: 'native:health' },
  { intent: 'mail', re: /(mail|ඊමේල්|email|draft)/i, app: 'mail', target: 'native:mail' },
  { intent: 'drop', re: /(drop|airdrop|පාසියාඩ්‍රොප්|share\s+code)/i, app: 'drop', target: 'native:drop' },
  { intent: 'vault', re: /(vault|රහස්|password|lock\s*box)/i, app: 'vault', target: 'desk:vault' },
  { intent: 'coins', re: /(bitcoin|crypto|coins|බිට්කොයින්|price)/i, app: 'coins', target: 'desk:coins' },
  { intent: 'wiki', re: /(wiki|wikipedia|විකි)/i, app: 'wiki', target: 'desk:wiki' },
  { intent: 'qr', re: /(qr|barcode)/i, app: 'qr', target: 'desk:qr' },
  { intent: 'compass', re: /(compass|මාලිමා)/i, app: 'compass', target: 'native:compass' },
  { intent: 'settings', re: /(settings|සැකසුම්|wallpaper|face\s*id)/i, app: 'settings', target: 'native:settings' },
  { intent: 'desktop', re: /(desktop|ඩෙස්ක්ටොප්|pc\s*mode)/i, app: 'desktop', target: 'native:desktop' },
  { intent: 'phone', re: /(phone\s*home|දුරකථන|home\s*screen)/i, app: 'phone', target: 'native:phonehome' },
  { intent: 'search', re: /(search|සොයන්න|find\s+file|findfs)/i, app: 'search', target: 'desk:findfs' },
  { intent: 'diag', re: /(diag|diagnose|syscheck|health\s*check)/i, app: 'diag', target: 'desk:diag' },
];

export function parseIntent(text) {
  const raw = String(text || '').trim();
  if (!raw) return { ok: false, error: 'empty' };

  // Chain split: " and " / " සහ " / " + "
  const parts = raw.split(/\s+(?:and|සහ|\+)\s+/i).map((s) => s.trim()).filter(Boolean);
  const steps = [];
  for (const part of parts) {
    let hit = null;
    for (const r of RULES) {
      if (r.re.test(part)) {
        hit = { intent: r.intent, app: r.app, target: r.target, text: part };
        break;
      }
    }
    if (!hit) {
      // extract note body: "note hello world"
      const nm = part.match(/^(?:note|නෝට්)\s+(.+)/i);
      if (nm) hit = { intent: 'note_write', app: 'notes', target: 'native:notes', text: part, payload: nm[1] };
    }
    if (!hit) {
      const rm = part.match(/^(?:remind(?:er)?|ටාස්ක්|task)\s+(.+)/i);
      if (rm) hit = { intent: 'reminder_add', app: 'reminders', target: 'native:reminders', text: part, payload: rm[1] };
    }
    if (!hit) hit = { intent: 'unknown', text: part, suggestion: 'Try: weather, note ..., remind ..., calendar, photo, calc' };
    steps.push(hit);
  }
  return { ok: true, steps, raw };
}

export function listManualActions() {
  return RULES.map((r) => ({ intent: r.intent, app: r.app, target: r.target }));
}
