// lib/commandCatalog.js — Full Radiant Queen OS command catalog (Day-1 → now)

export const COMMAND_SECTIONS = [
  {
    id: 'core',
    si: 'මූලික',
    en: 'Core',
    items: [
      { cmd: '/menu · 10', si: 'ප්‍රධාන මෙනුව', en: 'Main menu' },
      { cmd: '/ping', si: 'බොට් ජීවමානද', en: 'Alive check' },
      { cmd: '/help', si: 'උදව්', en: 'Help' },
      { cmd: '/status', si: 'තත්ත්වය', en: 'Status' },
      { cmd: 'health', si: 'පද්ධති සෞඛ්‍ය', en: 'God health monitor' },
    ],
  },
  {
    id: 'ai',
    si: 'AI / චැට්',
    en: 'AI',
    items: [
      { cmd: 'normal chat', si: 'සාමාන්‍ය කතාබස්', en: 'AI chat (self-aware)' },
      { cmd: '/ask …', si: 'ප්‍රශ්නයක් අහන්න', en: 'Ask AI' },
      { cmd: 'voice note', si: 'හඬ පණිවිඩය → විධාන', en: 'Voice Brain STT' },
      { cmd: 'think …', si: 'සාක්ෂි-පාදක සිතීම', en: 'Evidence Engine' },
      { cmd: 'think bg …', si: 'පසුබිම් සිතීම (Hull B)', en: 'Background think' },
      { cmd: 'think sync …', si: 'ක්ෂණික think', en: 'Force sync think' },
      { cmd: 'think worker', si: 'queue දැන් run', en: 'Process Hull B queue' },
      { cmd: 'think jobs · think last · think diag', si: 'think තත්ත්ව', en: 'Jobs / last / diag' },
    ],
  },
  {
    id: 'god',
    si: 'God Pack (ගබඩා/මතක)',
    en: 'God Pack',
    items: [
      { cmd: 'vault help · list · get · delete', si: 'ගොනු vault', en: 'Supabase Storage vault' },
      { cmd: 'caption: vault upload', si: 'ගොනුව upload', en: 'Upload file to vault' },
      { cmd: 'mem remember · search · list · forget', si: 'දිගුකාලීන මතක', en: 'Memory brain' },
      { cmd: 'doc analyze · ask · list · use · summary', si: 'ලේඛන AI', en: 'Document analyst' },
      { cmd: 'caption: doc analyze', si: 'PDF/DOCX/TXT විශ්ලේෂණ', en: 'Analyze attached doc' },
    ],
  },
  {
    id: 'ops',
    si: 'මෙහෙයුම් (Ops)',
    en: 'Ops Agents',
    items: [
      { cmd: 'make help · list · run', si: 'Make.com webhook', en: 'Make automations' },
      { cmd: 'snap help · list · status · wake · restart', si: 'SnapDeploy', en: 'Containers' },
      { cmd: 'cron help · list · create · heal', si: 'cron-job.org', en: 'Cron manager' },
      { cmd: 'night help · scan · report · run', si: 'රාත්‍රී මුරකරු', en: 'Night Operator' },
      { cmd: 'voice on · off · status', si: 'හඬ පිළිතුරු', en: 'TTS preference' },
      { cmd: 'cache …', si: 'Upstash cache', en: 'Redis cache (if configured)' },
    ],
  },
  {
    id: 'sentry',
    si: 'Sentry දෝෂ',
    en: 'Sentry',
    items: [
      { cmd: 'sentry help', si: 'Sentry උදව්', en: 'Sentry help' },
      { cmd: 'sentry issues', si: 'නව දෝෂ ලැයිස්තු', en: 'List unresolved issues' },
      { cmd: 'sentry issue <id>', si: 'දෝෂ විස්තර', en: 'Issue detail' },
      { cmd: 'sentry resolve <id>', si: 'විසඳු ලෙස සලකුණු', en: 'Resolve issue' },
      { cmd: 'sentry status', si: 'Sentry සබඳතාව', en: 'Connection status' },
    ],
  },
  {
    id: 'public',
    si: 'පොදු මෙවලම්',
    en: 'Public tools',
    items: [
      { cmd: 'gold · weather · calc', si: 'රන් / කාලගුණ / ගණන්', en: 'Gold, weather, calc' },
      { cmd: '/tools · translate · summarize', si: 'මෙවලම්', en: 'Creator tools' },
      { cmd: 'group admin tools', si: 'සමූහ පාලන', en: 'Group moderation' },
      { cmd: 'gh <path> + file', si: 'GitHub upload', en: 'Repo file upload' },
    ],
  },
];

export function formatCommandCatalog({ sinhala = true, founder = true } = {}) {
  const lines = [
    sinhala ? '📋 *සම්පූර්ණ විධාන ලැයිස්තුව*' : '📋 *Full command catalog*',
    sinhala ? '_Radiant Queen OS — Day 1 → now_' : '_Radiant Queen OS — Day 1 → now_',
    '',
  ];
  for (const sec of COMMAND_SECTIONS) {
    if (sec.id === 'sentry' && !founder) continue;
    if (sec.id === 'ops' && !founder) continue;
    if (sec.id === 'god' && !founder) continue;
    lines.push(`*${sinhala ? sec.si : sec.en}*`);
    for (const it of sec.items) {
      lines.push(`• \`${it.cmd}\` — ${sinhala ? it.si : it.en}`);
    }
    lines.push('');
  }
  lines.push(sinhala ? '_Founder විධාන private chat එකේ_' : '_Founder commands: private chat_');
  return lines.join('\n').slice(0, 3900);
}

export default { COMMAND_SECTIONS, formatCommandCatalog };
