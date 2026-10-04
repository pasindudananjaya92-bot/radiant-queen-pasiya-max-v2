/**
 * lib/websiteBrain.js — Official website assistant (scoped)
 * Public for ALL visitors — not founder-only.
 */

const ALLOWED_TOPICS = [
  'bot', 'create', 'studio', 'template', 'gold', 'radiant', 'premium',
  'feature', 'price', 'free', 'telegram', 'factory', 'analytics', 'live',
  'menu', 'help', 'account', 'login', 'mini app', 'miniapp', 'webhook',
  'deploy', 'vercel', 'subscription', 'plan', 'how', 'what is', 'start',
  'queen', 'pasiya', 'service', 'support', 'guide', 'tutorial', 'setup',
];

const DECLINE_HINTS = [
  'weather', 'joke', 'president', 'crypto price', 'stock', 'medical',
  'legal advice', 'homework', 'exam', 'recipe', 'sports score',
];

export function isInScope(question) {
  const q = String(question || '').toLowerCase();
  if (!q.trim()) return false;
  // explicit decline patterns
  for (const d of DECLINE_HINTS) {
    if (q.includes(d) && !q.includes('bot') && !q.includes('radiant')) {
      return false;
    }
  }
  // allow if any service keyword
  for (const a of ALLOWED_TOPICS) {
    if (q.includes(a)) return true;
  }
  // short greetings → in scope (onboarding)
  if (/^(hi|hello|hey|ayubowan|hullo|good\s)/i.test(q.trim()) && q.length < 40) {
    return true;
  }
  // ambiguous → treat as in-scope lightly and let system prompt constrain
  if (q.length < 120) return true;
  return false;
}

export function websiteSystemPrompt() {
  return (
    'You are the OFFICIAL website assistant for Radiant Queen (Pasiya Max) — ' +
    'a free Telegram AI bot factory and studio.\n' +
    'SCOPE ONLY: bot creation, studio, templates, Radiant Gold, free features, ' +
    'pricing (free), analytics, live board, mini app, how to start.\n' +
    'If the user asks anything outside this scope, reply politely: ' +
    '"I\'m not programmed for that. I only help with Radiant Queen services. ' +
    'Try our Telegram bot for general AI, or ask me how to create your own bot."\n' +
    'Tone: professional, concise, warm, official SaaS assistant.\n' +
    'Never invent paid prices. Creation is free.\n' +
    'Suggest links when useful: /bot/studio , Telegram bot commands.\n' +
    'Reply in the user\'s language when possible (Sinhala or English).'
  );
}

export function declineMessage(langHint) {
  const si = /[\u0D80-\u0DFF]/.test(langHint || '');
  if (si) {
    return (
      'මම Radiant Queen සේවා ගැන පමණක් උදව් කරනවා. ' +
      'වෙනත් මාතෘකා සඳහා Telegram bot එක භාවිතා කරන්න. ' +
      'ඔබේම bot එකක් හදන්නද කැමතිද? → Studio'
    );
  }
  return (
    "I'm not programmed for that. I only help with Radiant Queen services. " +
    'For general AI try our Telegram bot — or ask me how to create your own bot.'
  );
}

export function welcomeMessage() {
  return (
    '👋 Welcome to Radiant Queen.\n' +
    "I'm your official assistant. How can I help you create your bot today?\n\n" +
    'Try: How do I create a bot? · What is free? · Radiant Gold? · Templates'
  );
}

export default {
  isInScope,
  websiteSystemPrompt,
  declineMessage,
  welcomeMessage,
};
