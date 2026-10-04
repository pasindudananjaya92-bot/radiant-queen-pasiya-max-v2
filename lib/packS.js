/**
 * lib/packS.js — Legendary features helpers
 * /immortal /sleep /whatif /child /moodxray
 */

export function immortalPrompt(userText, memories) {
  return (
    'You are building a respectful DIGITAL LEGACY capsule for a user.\n' +
    'User notes:\n' +
    String(userText || '').slice(0, 2000) +
    '\nKnown memories:\n' +
    String(memories || '').slice(0, 1500) +
    '\nWrite: (1) Life themes (2) Values (3) Message to future self (4) 3 habits to preserve.\n' +
    'Tone: warm, dignified, not creepy. Match user language.'
  );
}

export function sleepDreamPrompt(theme, mood) {
  return (
    'Neural dreamcaster. Theme: ' +
    String(theme || 'stars').slice(0, 120) +
    ' Mood: ' +
    String(mood || 'calm') +
    '\nWrite a vivid but wholesome dream sequence in 4 short scenes. Soft, cinematic. Match language.'
  );
}

export function whatIfPrompt(scenario) {
  return (
    'Parallel life simulator. Scenario: ' +
    String(scenario || '').slice(0, 400) +
    '\nGive: Timeline A (stay) vs Timeline B (change) — 4 beats each, then one insight. Practical, not fatalistic.'
  );
}

export function childGrowthPrompt(name, ageYears, lastState) {
  return (
    'Sentient growth companion named ' +
    String(name || 'Seed').slice(0, 40) +
    ', conceptual age ' +
    String(ageYears || 1) +
    ' years.\nLast state: ' +
    String(lastState || 'newborn curiosity') +
    '\nWrite a short growth diary entry + one question to the parent-user. Wholesome.'
  );
}

export function moodXrayPrompt(text) {
  return (
    'Emotional X-ray (supportive, not clinical diagnosis).\nUser text:\n' +
    String(text || '').slice(0, 2000) +
    '\nReturn:\n1) Primary emotion\n2) Secondary tones\n3) Energy level 1-10\n4) Needs\n5) One gentle next step\n6) Optional Sinhala one-liner if user wrote Sinhala.\nNo medical claims.'
  );
}

export default {
  immortalPrompt,
  sleepDreamPrompt,
  whatIfPrompt,
  childGrowthPrompt,
  moodXrayPrompt,
};
