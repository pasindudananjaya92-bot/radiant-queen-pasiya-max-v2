/**
 * Radiant Queen · Competitor Watch (free tier)
 * GET/POST /api/competitor-watch
 * Auth: Authorization: Bearer <CRON_SECRET>  OR  ?secret=<CRON_SECRET>
 * Optional: GitHub Actions Mondays 03:30 UTC (~9:00 IST)
 * Brand: Radiant Queen / StrideClub — not a competitor name clone.
 */
import { GoogleGenAI } from '@google/genai';

const BOT_TOKEN = process.env.BOT_TOKEN || '';
const ADMIN_ID = String(process.env.ADMIN_ID || '').trim();
const GEMINI_KEY = process.env.GEMINI_API_KEY || '';
const CRON_SECRET = process.env.CRON_SECRET || '';

const MODELS = ['gemini-2.5-flash', 'gemini-flash-latest', 'gemini-2.0-flash'];

function authorized(req) {
  if (!CRON_SECRET) {
    // allow founder-only manual from known host without secret only if unset — require secret in prod
    return false;
  }
  const auth = req.headers.authorization || '';
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  const q = req.query?.secret || '';
  return bearer === CRON_SECRET || q === CRON_SECRET;
}

async function generateReport() {
  if (!GEMINI_KEY) throw new Error('GEMINI_API_KEY missing');
  const ai = new GoogleGenAI({ apiKey: GEMINI_KEY });
  const prompt = `You are a product strategist for STRIDECLUB (AI running club platform by Radiant Queen / Pasiya Max).

Write a concise weekly COMPETITOR POSITIONING brief (max 400 words) comparing:
1) Strava
2) Nike Run Club
3) Adidas Running

Focus on: community, free tier limits, AI coaching, events, Sri Lanka / emerging markets angle.
End with 5 concrete feature ideas StrideClub can ship on free infrastructure (Vercel/Supabase/Gemini free).

Plain text. No markdown tables. Brand name in output: StrideClub and Radiant Queen only — never invent another bot brand.`;

  let lastErr;
  for (const model of MODELS) {
    try {
      const result = await ai.models.generateContent({
        model,
        contents: prompt,
      });
      const text =
        result?.text ||
        result?.response?.text?.() ||
        result?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') ||
        '';
      if (text && String(text).trim()) return String(text).trim();
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('Gemini failed');
}

async function sendTelegram(text) {
  if (!BOT_TOKEN || !ADMIN_ID) throw new Error('BOT_TOKEN or ADMIN_ID missing');
  const chunks = [];
  let rest = `RADIANT QUEEN · COMPETITOR WATCH\nStrideClub weekly brief\n\n${text}`;
  while (rest.length > 0) {
    chunks.push(rest.slice(0, 3500));
    rest = rest.slice(3500);
  }
  for (const chunk of chunks) {
    const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: ADMIN_ID,
        text: chunk,
      }),
    });
    const j = await r.json();
    if (!j.ok) throw new Error(j.description || 'Telegram send failed');
  }
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET' && req.method !== 'POST') {
      return res.status(405).json({ ok: false, error: 'Method not allowed' });
    }
    if (!authorized(req)) {
      return res.status(401).json({ ok: false, error: 'Unauthorized — set CRON_SECRET' });
    }
    const report = await generateReport();
    await sendTelegram(report);
    return res.status(200).json({
      ok: true,
      service: 'radiant-queen-competitor-watch',
      sentTo: ADMIN_ID,
      chars: report.length,
    });
  } catch (err) {
    console.error('competitor-watch', err);
    return res.status(500).json({
      ok: false,
      error: String(err?.message || err).slice(0, 200),
    });
  }
}
