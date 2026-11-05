// lib/voiceBrain.js — Agent Voice Brain helpers
// Transcription: lib/stt.js (Groq Whisper)
// Execution: tryAgentExecute after transcript (wired in api/telegram.js)

export { transcribeVoiceGroq } from './stt.js';

export function voiceHelp() {
  return `🎙 *Voice Brain*

Send a *voice message* in private chat (Founder).

Examples (speak):
• health
• vault list
• make run
• mem remember buy milk
• cache ping

Flow: Voice → Groq Whisper → Agent router → reply
If not a command → normal AI chat reply.

Env: GROQ_API_KEY (required)`;
}
