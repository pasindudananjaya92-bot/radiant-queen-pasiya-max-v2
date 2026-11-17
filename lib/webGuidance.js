/**
 * Wave 22A — Modern Web Guidance (Bot brain / data only)
 * NO npx, NO Chrome, NO Playwright. Checklists for Founder + Deal Packs.
 */
export const VERSION = '22A';
export const BASELINE = 'Baseline 2024';

/** @type {Record<string, {id:string,title:string,checklist:string[],do:string,dont:string,fallback:string}>} */
export const GUIDES = {
  'long-task': {
    id: 'long-task',
    title: 'Long tasks & INP',
    checklist: [
      'Break JS work into chunks under ~50ms',
      'Use requestIdleCallback / scheduler.yield when available',
      'Keep input handlers light — defer heavy work',
      'Measure Interaction to Next Paint (INP)',
      'Avoid long tasks on low-end mobile CPUs',
    ],
    do: 'Yield often; split loops; defer non-critical work after paint',
    dont: 'One giant sync script blocking click/tap for hundreds of ms',
    fallback: 'setTimeout(0) chunking if scheduler.yield missing (progressive enhancement)',
  },
  dialog: {
    id: 'dialog',
    title: 'Dialogs & modals',
    checklist: [
      'Prefer <dialog> + showModal() when Baseline allows',
      'Trap focus inside open dialog',
      'Escape closes; restore focus to opener',
      'Backdrop click policy explicit',
      'Honor prefers-reduced-motion on open/close',
    ],
    do: 'Native dialog + inert background; accessible labels',
    dont: 'Custom div modal without focus trap or aria',
    fallback: 'ARIA role=dialog + focus trap polyfill pattern if needed',
  },
  forms: {
    id: 'forms',
    title: 'Forms & autofill',
    checklist: [
      'Use autocomplete tokens (name, email, tel, street-address)',
      'Label every control (visible or aria-label)',
      'type=email/tel/url for mobile keyboards',
      'Don't block paste',
      'Client validation helps; server validates always',
    ],
    do: 'Native inputs + correct autocomplete + labels',
    dont: 'contenteditable fake fields that break autofill',
    fallback: 'Plain text inputs with labels always work',
  },
  animations: {
    id: 'animations',
    title: 'Animations & motion',
    checklist: [
      'Respect prefers-reduced-motion',
      'Prefer transform/opacity over layout thrash',
      'Avoid animating large filters on mobile',
      ' entrances optional — content usable without them',
      'Scroll-driven effects progressive',
    ],
    do: 'CSS transform + reduced-motion media query',
    dont: 'Mandatory motion / layout-animated height spam',
    fallback: 'Static UI when reduced-motion: reduce',
  },
  'css-modern': {
    id: 'css-modern',
    title: 'Modern CSS layout',
    checklist: [
      'Flexbox/Grid for layout (not float soup)',
      'clamp() for fluid type where useful',
      'Logical properties when easy (margin-inline)',
      'container queries progressive',
      'System font stack for speed',
    ],
    do: 'Grid/flex + fluid type + mobile-first breakpoints',
    dont: 'Fixed pixel-only desktop layouts',
    fallback: 'Single column flex stack on small screens',
  },
  'tooltips-popover': {
    id: 'tooltips-popover',
    title: 'Tooltips & popovers',
    checklist: [
      'Prefer Popover API when widely available',
      'Keyboard reachable; not hover-only critical info',
      'Touch-friendly hit targets',
      'Dismissible',
      'No essential info hover-only on mobile',
    ],
    do: 'Popover/details for progressive disclosure',
    dont: 'Hover-only tooltips as only way to learn critical UI',
    fallback: 'Always-visible helper text on small screens',
  },
  accessibility: {
    id: 'accessibility',
    title: 'Accessibility',
    checklist: [
      'Semantic landmarks (main, nav, header)',
      'Buttons are <button>, links are <a href>',
      'Color contrast enough for body text',
      'Focus visible styles',
      'Images: meaningful alt or empty alt for decorative',
    ],
    do: 'Semantics first; test keyboard path',
    dont: 'Clickable divs without role/keyboard',
    fallback: 'Plain HTML semantics always',
  },
  memory: {
    id: 'memory',
    title: 'Memory & caching views',
    checklist: [
      'Drop large detached DOM when leaving views',
      'Limit retained caches on SPA-like dashboards',
      'Revoke object URLs after use',
      'Avoid unbounded event listener growth',
      'Profile if dashboard feels heavier over time',
    ],
    do: 'Bounded caches; cleanup on navigate',
    dont: 'Keep every chart dataset forever in memory',
    fallback: 'Full page reload path for heavy tools',
  },
  performance: {
    id: 'performance',
    title: 'Performance',
    checklist: [
      'Minimize main-thread JS on first paint',
      'Lazy-load below-fold heavy widgets',
      'Compress images; correct dimensions',
      'Avoid blocking third-party on critical path',
      'Target mobile network reality',
    ],
    do: 'Critical CSS/HTML first; defer the rest',
    dont: 'Ship entire charting lib before first paint unless needed',
    fallback: 'Server-rendered summary cards before charts',
  },
  passkeys: {
    id: 'passkeys',
    title: 'Passkeys (when auth needed)',
    checklist: [
      'Offer passkeys where account auth exists',
      'Keep password fallback during transition',
      'Clear recovery path',
      'Never store raw webauthn secrets in logs',
      'Only when product has real login — not DASH_SECRET pages',
    ],
    do: 'WebAuthn passkeys + fallback',
    dont: 'Force passkeys with no recovery',
    fallback: 'Existing DASH_SECRET / Telegram Founder gate is fine for private OS',
  },
  baseline: {
    id: 'baseline',
    title: 'Baseline strategy',
    checklist: [
      'Default target: Baseline 2024 (widely available)',
      'Newly available = progressive enhancement',
      'Limited availability = feature detect + fallback',
      'Avoid origin-trial-only by default',
      'Document required browsers for client work',
    ],
    do: 'Widely available first; enhance upward',
    dont: 'Require Chrome-only APIs with no fallback',
    fallback: 'Progressive enhancement always',
  },
  'builtin-ai': {
    id: 'builtin-ai',
    title: 'Built-in browser AI (optional)',
    checklist: [
      'Treat on-device AI as progressive enhancement',
      'Never require it for core Queen OS flows',
      'Privacy: say what leaves the device',
      'Server LLM (Groq/Gemini) remains primary',
      'Feature-detect before use',
    ],
    do: 'Optional enhancement only',
    dont: 'Block UI if browser AI missing',
    fallback: 'Vercel/Telegram AI routes already work',
  },
};

const ALIASES = {
  longtask: 'long-task',
  'long task': 'long-task',
  long_task: 'long-task',
  modal: 'dialog',
  form: 'forms',
  animation: 'animations',
  motion: 'animations',
  css: 'css-modern',
  tooltip: 'tooltips-popover',
  popover: 'tooltips-popover',
  a11y: 'accessibility',
  perf: 'performance',
  passkey: 'passkeys',
  ai: 'builtin-ai',
};

export function listGuideIds() {
  return Object.keys(GUIDES);
}

export function getGuide(topic) {
  const t = String(topic || '')
    .trim()
    .toLowerCase()
    .replace(/_/g, ' ');
  const id = ALIASES[t] || ALIASES[t.replace(/\s+/g, ' ')] || t.replace(/\s+/g, '-');
  return GUIDES[id] || null;
}

export function formatGuide(g) {
  if (!g) return '❓ Unknown guide. Try `web guide list`';
  const lines = [
    `🧭 *Web Guide · ${g.id}*`,
    `_${g.title}_ · ${BASELINE}`,
    '',
    '*Checklist*',
    ...g.checklist.map((c) => '· ' + c),
    '',
    `*Do:* ${g.do}`,
    `*Don't:* ${g.dont}`,
    `*Fallback:* ${g.fallback}`,
  ];
  return lines.join('\n');
}

export function formatGuideList() {
  const lines = ['🧭 *Web Guidance · 22A*', `Target: *${BASELINE}*`, '', '*Guides*'];
  for (const id of listGuideIds()) {
    lines.push(`· \`${id}\` — ${GUIDES[id].title}`);
  }
  lines.push('', 'Try: `web guide long-task` · `web check` · `web baseline`');
  return lines.join('\n');
}

export function formatBaseline() {
  return [
    `📐 *${BASELINE}*`,
    '· Default: *Widely available* features',
    '· Newly available → progressive enhancement',
    '· Limited / origin-trial → avoid as hard dependency',
    '· Fallbacks always for mobile + cross-browser (Chrome, Firefox, Edge, Safari)',
    '· Queen OS Dashboard: mobile-first, reduced-motion, semantic HTML',
  ].join('\n');
}

/** Static audit of known Dashboard practices — no browser automation */
export function webCheckDashboard() {
  const checks = [
    { id: 'mobile-first', status: 'OK', note: 'Dashboard designed mobile-first (PWA shell)' },
    { id: 'semantic', status: 'OK', note: 'Prefer buttons/links over div click traps in new UI' },
    { id: 'reduced-motion', status: 'WARN', note: 'Ensure CSS has prefers-reduced-motion for any motion' },
    { id: 'long-task', status: 'WARN', note: 'Heavy think/OMNI work must stay on Hull B / not block UI thread' },
    { id: 'focus', status: 'WARN', note: 'Verify focus visible on dashboard controls after tab switches' },
    { id: 'baseline', status: 'OK', note: `${BASELINE} target documented in Bot brain` },
    { id: 'secrets', status: 'OK', note: 'DASH_SECRET / Founder gates — no passkeys required' },
    { id: 'third-party', status: 'OK', note: 'No required browser built-in AI for core flows' },
  ];
  const lines = ['🔎 *Web Check · Dashboard (static)*', '_No browser automation — draft guidance only_', ''];
  for (const c of checks) {
    const icon = c.status === 'OK' ? '✅' : c.status === 'WARN' ? '⚠️' : '❌';
    lines.push(`${icon} *${c.id}* — ${c.note}`);
  }
  lines.push('', '_No auto-fix. Founder decides._');
  return lines.join('\n');
}

export function tipForText(text) {
  const t = String(text || '').toLowerCase();
  if (/dialog|modal|popup/.test(t)) return getGuide('dialog');
  if (/form|autofill|input/.test(t)) return getGuide('forms');
  if (/animat|motion|transition/.test(t)) return getGuide('animations');
  if (/a11y|accessib|aria|screen reader/.test(t)) return getGuide('accessibility');
  if (/perf|slow|inp|lag|long task/.test(t)) return getGuide('long-task');
  if (/css|layout|grid|responsive/.test(t)) return getGuide('css-modern');
  if (/dashboard|website|web|landing|page/.test(t)) return getGuide('baseline');
  return null;
}

export function formatTipLine(g) {
  if (!g) return '';
  return `💡 Web tip (*${g.id}*): ${g.do}`;
}

export function dealWebChecklist() {
  return [
    'Web checklist (draft):',
    '1. Mobile-first + Baseline 2024 defaults',
    '2. Accessibility: labels, focus, semantics',
    '3. No long-task jank — defer heavy JS / honor reduced-motion',
  ].join('\n');
}

export function webHelp() {
  return [
    '*Web Guidance · 22A*',
    'Modern Web brain (data only — no npx/Chrome)',
    '',
    '• `web help` — this menu',
    '• `web guide list` — all guides',
    '• `web guide <topic>` — e.g. long-task, dialog, forms',
    '• `web check` — static Dashboard audit',
    '• `web baseline` — Baseline 2024 policy',
  ].join('\n');
}

export default {
  VERSION,
  BASELINE,
  GUIDES,
  listGuideIds,
  getGuide,
  formatGuide,
  formatGuideList,
  formatBaseline,
  webCheckDashboard,
  tipForText,
  formatTipLine,
  dealWebChecklist,
  webHelp,
};
