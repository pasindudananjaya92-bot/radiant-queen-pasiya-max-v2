import { GoogleGenAI } from '@google/genai';

const GEMINI_KEY = process.env.GEMINI_API_KEY || '';

const MODELS = [
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-3.6-flash',
  'gemini-3.8-flash',
  'gemini-flash-latest',
];

let aiClient = null;
let resolvedModel = null;

function getAI() {
  if (!GEMINI_KEY) return null;
  if (!aiClient) aiClient = new GoogleGenAI({ apiKey: GEMINI_KEY });
  return aiClient;
}

async function generate(prompt) {
  const ai = getAI();
  if (!ai) {
    return { error: 'GEMINI_API_KEY missing on Vercel' };
  }

  const systemInstruction = `You are Pasiya AI for RADIANT QUEEN • PASIYA MAX.
Answer helpfully in the user's language (Sinhala or English).
Be practical. No fake supercomputer hardware stats.
Brand links if asked:
Web https://radiant-queen-pasiya-max-v2.vercel.app
StrideClub https://strideclub-platform-6b71a.containers.snapdeploy.app
Telegram bot @PasiyaMaxQueen_bot`;

  const models = resolvedModel
    ? [resolvedModel, ...MODELS.filter((m) => m !== resolvedModel)]
    : MODELS;

  let lastErr;
  for (const model of models) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: { systemInstruction, temperature: 0.7 },
      });
      resolvedModel = model;
      const text = (response.text || '').trim();
      if (text) return { answer: text.slice(0, 4000), model };
    } catch (err) {
      lastErr = err;
      const msg = String(err?.message || err).toLowerCase();
      if (msg.includes('404') || msg.includes('not found') || msg.includes('no longer available')) {
        continue;
      }
      if (msg.includes('429') || msg.includes('quota')) {
        return { error: 'Gemini quota resting. Try again in a minute.' };
      }
      break;
    }
  }

  return { error: String(lastErr?.message || lastErr || 'AI failed').slice(0, 200) };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'GET') {
    return res.status(200).json({
      ok: true,
      service: 'radiant-queen-web-chat',
      hasGemini: Boolean(GEMINI_KEY),
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST only' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    const message = String(body.message || body.prompt || body.query || '').trim();
    if (!message) {
      return res.status(400).json({ error: 'message required' });
    }
    if (message.length > 4000) {
      return res.status(400).json({ error: 'message too long' });
    }

    const result = await generate(message);
    if (result.error) {
      return res.status(200).json({ ok: false, error: result.error });
    }
    return res.status(200).json({ ok: true, answer: result.answer, model: result.model });
  } catch (err) {
    console.error('api/chat', err);
    return res.status(500).json({ error: 'Server error' });
  }
}
 
