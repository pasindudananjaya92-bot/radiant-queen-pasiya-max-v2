/**
 * lib/funPack.js — Pack I group/fun tools
 */
const TRIVIA_BANK = [
  {
    q: 'What is the capital of Sri Lanka?',
    options: ['Colombo', 'Kandy', 'Sri Jayawardenepura Kotte', 'Galle'],
    answer: 2,
  },
  {
    q: 'How many meters in a standard track lap?',
    options: ['200m', '400m', '800m', '1000m'],
    answer: 1,
  },
  {
    q: 'Easy running intensity is often described as what % of effort?',
    options: ['95%', '80%', '50%', '30%'],
    answer: 1,
  },
  {
    q: 'Which is longer?',
    options: ['5K', '10K', 'Half marathon', 'Mile'],
    answer: 2,
  },
  {
    q: 'Primary energy system for easy long runs?',
    options: ['Anaerobic', 'Aerobic', 'ATP-only', 'Creatine only'],
    answer: 1,
  },
  {
    q: 'Telegram bot API updates are delivered via?',
    options: ['SMTP', 'Webhooks or long-polling', 'FTP', 'SSH'],
    answer: 1,
  },
  {
    q: 'SQL database used by this project?',
    options: ['MongoDB', 'PostgreSQL (Supabase)', 'Redis only', 'SQLite only'],
    answer: 1,
  },
  {
    q: 'Best recovery habit after hard intervals?',
    options: ['Skip sleep', 'Easy miles + sleep + fuel', 'Only caffeine', 'Zero carbs forever'],
    answer: 1,
  },
];

export function pickTrivia(seed) {
  const i =
    typeof seed === 'number'
      ? Math.abs(seed) % TRIVIA_BANK.length
      : Math.floor(Math.random() * TRIVIA_BANK.length);
  const t = TRIVIA_BANK[i];
  return { index: i, ...t };
}

export function formatTrivia(t) {
  const lines = [
    '🧠 TRIVIA',
    t.q,
    '',
  ];
  t.options.forEach((o, i) => {
    lines.push(String.fromCharCode(65 + i) + ') ' + o);
  });
  lines.push('', 'Reply with /answer A  (or B/C/D)');
  lines.push('Or: /answer ' + (t.index + 1) + ' A');
  return lines.join('\n');
}

export function checkTriviaAnswer(t, letter) {
  const L = String(letter || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-D]/g, '')
    .charAt(0);
  if (!L) return { ok: false, error: 'Use A B C or D' };
  const idx = L.charCodeAt(0) - 65;
  const correct = idx === t.answer;
  return {
    ok: true,
    correct,
    letter: L,
    correctLetter: String.fromCharCode(65 + t.answer),
    correctText: t.options[t.answer],
  };
}

export function memePrompt(text) {
  const idea = String(text || 'funny running motivation').slice(0, 200);
  return (
    'Funny meme style image, bold caption energy, clean composition, high contrast, ' +
    'internet meme aesthetic, no watermark, about: ' +
    idea
  );
}

export default {
  pickTrivia,
  formatTrivia,
  checkTriviaAnswer,
  memePrompt,
  TRIVIA_BANK,
};
