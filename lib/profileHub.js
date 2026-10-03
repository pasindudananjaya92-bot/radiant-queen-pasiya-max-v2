/**
 * lib/profileHub.js — Pack I
 * Unified profile + achievements + level bar
 */
export function levelFromXp(xp) {
  const x = Number(xp) || 0;
  // soft curve: every ~40 XP ≈ 1 level early, slows later
  let level = 1;
  let need = 40;
  let left = x;
  while (left >= need && level < 99) {
    left -= need;
    level += 1;
    need = Math.min(200, 30 + level * 12);
  }
  return { level, intoLevel: left, needForNext: need, totalXp: x };
}

export function progressBar(into, need, width = 10) {
  const n = Math.max(1, Number(need) || 1);
  const i = Math.max(0, Math.min(n, Number(into) || 0));
  const filled = Math.round((i / n) * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

export function computeAchievements(ctx) {
  const a = [];
  const xp = Number(ctx.xp || 0);
  const runs = Number(ctx.runs || 0);
  const streak = Number(ctx.streak || 0);
  const gold = Number(ctx.gold || 0);
  const premium = !!ctx.premium;
  const vault = Number(ctx.vaultFiles || 0);
  const memory = Number(ctx.memoryRows || 0);
  const persona = ctx.persona || 'default';
  const isFounder = !!ctx.isFounder;

  if (runs >= 1) a.push({ id: 'first_run', title: 'First Steps', emoji: '👣' });
  if (runs >= 10) a.push({ id: 'ten_runs', title: 'Consistent Runner', emoji: '🏃' });
  if (runs >= 50) a.push({ id: 'fifty_runs', title: 'Road Warrior', emoji: '🛡️' });
  if (streak >= 3) a.push({ id: 'streak3', title: 'Spark', emoji: '✨' });
  if (streak >= 7) a.push({ id: 'streak7', title: 'Week Flame', emoji: '🔥' });
  if (streak >= 30) a.push({ id: 'streak30', title: 'Iron Month', emoji: '🏆' });
  if (xp >= 50) a.push({ id: 'xp50', title: 'XP 50', emoji: '⭐' });
  if (xp >= 200) a.push({ id: 'xp200', title: 'XP 200', emoji: '🌟' });
  if (xp >= 500) a.push({ id: 'xp500', title: 'XP Elite', emoji: '💎' });
  if (gold >= 400) a.push({ id: 'gold400', title: 'Gold Starter', emoji: '🪙' });
  if (gold >= 1000) a.push({ id: 'gold1k', title: 'Gold Hoarder', emoji: '💰' });
  if (premium) a.push({ id: 'premium', title: 'Premium', emoji: '👑' });
  if (vault >= 1) a.push({ id: 'vault', title: 'Vault Keeper', emoji: '🗄️' });
  if (memory >= 5) a.push({ id: 'memory', title: 'Memory Mind', emoji: '🧠' });
  if (persona && persona !== 'default') a.push({ id: 'persona', title: 'Persona Set', emoji: '🎭' });
  if (ctx.strideName) a.push({ id: 'stride', title: 'Stride Linked', emoji: '🔗' });
  if (isFounder) a.push({ id: 'founder', title: 'Founder', emoji: '🚀' });
  return a;
}

export function formatProfileCard(p) {
  const lv = levelFromXp(p.xp);
  const bar = progressBar(lv.intoLevel, lv.needForNext, 12);
  const ach = computeAchievements(p);
  const lines = [
    '👤 PROFILE · Radiant Queen',
    p.name ? 'Name: ' + p.name : null,
    'ID: ' + p.userId,
    p.isFounder ? 'Role: Founder 👑' : p.premium ? 'Role: Premium' : 'Role: Member',
    '',
    '🏃 Runner',
    'Level ' + lv.level + '  [' + bar + ']  ' + lv.intoLevel + '/' + lv.needForNext + ' XP',
    'Total XP: ' + lv.totalXp + ' · Runs: ' + (p.runs || 0) + ' · Streak: ' + (p.streak || 0) + 'd',
    p.strideName ? 'Stride: ' + p.strideName : 'Stride: not linked (/linkstride)',
    '',
    '🪙 Gold: ' + (p.gold ?? 0) + (p.premium ? ' · Premium YES' : ' · Premium no'),
    '🎭 Persona: ' + (p.persona || 'default'),
    '🗄️ Vault files: ' + (p.vaultFiles || 0),
    '🧠 Memory rows: ' + (p.memoryRows || 0),
    '',
    '🏅 Achievements (' + ach.length + '):',
    ach.length ? ach.map((x) => x.emoji + ' ' + x.title).join(' · ') : 'None yet — /logrun to start',
    '',
    'Cmds: /achievements · /level · /badges · /balance · /me',
  ];
  return lines.filter((x) => x !== null).join('\n');
}

export function formatAchievementsBoard(p) {
  const ach = computeAchievements(p);
  const lines = [
    '🏅 ACHIEVEMENTS · Radiant Queen',
    'Unlocked: ' + ach.length,
    '',
  ];
  if (!ach.length) {
    lines.push('No achievements yet.');
    lines.push('Try: /logrun · /daily · /vault save · /persona coach');
  } else {
    for (const a of ach) {
      lines.push(a.emoji + '  ' + a.title + '  (`' + a.id + '`)');
    }
  }
  lines.push('', 'Profile: /profile · Level: /level');
  return lines.join('\n');
}

export function formatLevelCard(p) {
  const lv = levelFromXp(p.xp);
  const bar = progressBar(lv.intoLevel, lv.needForNext, 14);
  return [
    '📊 LEVEL · Radiant Queen',
    'Level ' + lv.level,
    '[' + bar + ']',
    lv.intoLevel + ' / ' + lv.needForNext + ' XP to next level',
    'Lifetime XP: ' + lv.totalXp,
    'Runs: ' + (p.runs || 0) + ' · Streak: ' + (p.streak || 0) + 'd',
    '',
    'Tip: /logrun adds XP · /challenge for club goal',
  ].join('\n');
}

export default {
  levelFromXp,
  progressBar,
  computeAchievements,
  formatProfileCard,
  formatAchievementsBoard,
  formatLevelCard,
};
