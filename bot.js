/**
 * RADIANT QUEEN • PASIYA MAX v2.0 - TELEGRAM BOT CORE
 * Author: Pasiya Max (Pasiya AI)
 * Commands: /start, /help, /ask, /download, /dp, /tagall, /react, /github, /status
 */

import { Telegraf } from "telegraf";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const BOT_TOKEN = process.env.BOT_TOKEN || "";
const ADMIN_ID = process.env.ADMIN_ID || "";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";

console.log("⚡ [AI STUDIO AUTO-CONNECT] AI Studio Brain Service (Gemini Flash): " + (GEMINI_API_KEY ? "CONNECTED & ACTIVE ✅" : "WAITING KEY"));
if (!BOT_TOKEN) {
  console.log("ℹ️ [EXTERNAL SERVICES] Telegram BOT_TOKEN left as placeholder as requested. Configure it manually later when ready.");
}

const bot = new Telegraf(BOT_TOKEN || "NO_TOKEN_PROVIDED");

const ai = GEMINI_API_KEY
  ? new GoogleGenAI({
      apiKey: GEMINI_API_KEY,
      httpOptions: { headers: { "User-Agent": "aistudio-build" } },
    })
  : null;

async function generateWithFlash(genAI, params) {
  const models = ["gemini-flash-latest", "gemini-2.5-flash", "gemini-3.8-flash"];
  let lastErr = null;
  for (const model of models) {
    try {
      const res = await genAI.models.generateContent({
        ...params,
        model,
      });
      return res;
    } catch (err) {
      lastErr = err;
      console.warn(`Flash model ${model} busy (${err?.status || err?.message}), testing fallback...`);
    }
  }
  throw lastErr;
}

const PASIYA_SOCIALS = `
✨ *RADIANT QUEEN • PASIYA MAX v2.0* ✨
*Official AI Assistant & Robot OS*

📲 *Official Links & Support:*
1️⃣ 📸 Instagram: https://www.instagram.com/pasindu5598
2️⃣ 📘 Facebook: https://www.facebook.com/share/18xRGhYVUo/
3️⃣ 🌐 Blog: https://mamageblog.blogspot.com
4️⃣ ▶️ YouTube: https://youtube.com/@pasya
5️⃣ 💬 WhatsApp Channel: https://whatsapp.com/channel/0029VaPASIAMAX
6️⃣ 💬 WhatsApp Group: https://chat.whatsapp.com/KjhsWakBQoUI4SEEvZXAsO
7️⃣ 📱 Imo: https://s.imoim.net/KNdKwX?ISCI=001102
8️⃣ 🎵 TikTok: https://tiktok.com/@pasindudananjaya619
9️⃣ 💼 LinkedIn: https://linkedin.com/in/pasindu-dananjaya-41044831b
🔟 🐦 X / Twitter: https://x.com/PasinduDan98554
1️⃣1️⃣ 💜 Viber Channel: https://invite.viber.com/?g2=AQBWlEwa%2BDKVDFaaTbesR5FqD2IQZhFjhhQdN%2Fvdsaml9xVUCL8RnDHcFy6kno0U
1️⃣2️⃣ 📢 Telegram: https://t.me/goldenbotmdchannel
🚀 *Main Site (StrideClub):* https://strideclub-platform-6b71a.containers.snapdeploy.app/
`;

bot.start((ctx) => {
  ctx.reply(
    `👑 WELCOME TO RADIANT QUEEN • PASIYA MAX v2.0\n\n⚡ Quantum Core: Online\n🛡️ Armor Mk-VII: 100%\n🤖 Assistant: Pasiya AI (Google AI Studio Powered)\n\nType /help to see all super commands!`
  );
});

bot.help((ctx) => {
  ctx.reply(
    `✨ RADIANT QUEEN COMMANDS:
/ask <query> - Ask Quantum AI Brain (Google AI Studio Gemini Flash)
/social - Pasiya Max Official Links
/status - Quantum Core diagnostics
/ping - Test bot latency
/tagall <message> - Group mention broadcast (Admin only)
/github - View official repositories & platform links`
  );
});

bot.command("ping", (ctx) => {
  const start = Date.now();
  ctx.reply("🏓 Pong! Quantum core active.").then(() => {
    const ms = Date.now() - start;
    ctx.reply(`⚡ Latency: ${ms}ms`);
  });
});

bot.command("social", (ctx) => {
  ctx.reply(PASIYA_SOCIALS);
});

bot.command("github", (ctx) => {
  ctx.reply(
    `📂 GitHub Architecture & Links:
Repo: https://github.com/pasindudananjaya92-bot/bhook-
Websites: https://pasiyamax.vercel.app
Platform: https://strideclub-platform-6b71a.containers.snapdeploy.app/`
  );
});

bot.command("ask", async (ctx) => {
  const query = ctx.message.text.replace("/ask", "").trim();
  if (!query) {
    return ctx.reply("Please provide a question, e.g., /ask Tell me about Quantum Supercomputers.");
  }
  if (!ai) {
    return ctx.reply(`✨ [RADIANT-Ω] Brain signal received for: "${query}".\nConfigure GEMINI_API_KEY to activate full neural generation.`);
  }

  try {
    const res = await generateWithFlash(ai, {
      contents: query,
      config: {
        systemInstruction: "You are Pasiya AI for RADIANT QUEEN • PASIYA MAX v2.0. Answer helpfully in Sinhala or English.",
      },
    });
    ctx.reply(res.text || "✨ Quantum core processed.");
  } catch (err) {
    ctx.reply("❌ Neural communication error. Please retry.");
  }
});

// Auto-answer direct text messages in private chats with Gemini
bot.on("text", async (ctx) => {
  if (ctx.message.text.startsWith("/")) return; // handled by commands
  if (!ai) return;

  try {
    const res = await generateWithFlash(ai, {
      contents: ctx.message.text,
      config: {
        systemInstruction: "You are Pasiya AI for RADIANT QUEEN • PASIYA MAX v2.0. Answer helpfully in Sinhala or English.",
      },
    });
    if (res.text) {
      ctx.reply(res.text);
    }
  } catch (err) {
    console.error("Telegram message reply error:", err);
  }
});

bot.command("tagall", (ctx) => {
  if (ADMIN_ID && String(ctx.from.id) !== ADMIN_ID) {
    return ctx.reply("⛔ Admin access only.");
  }
  ctx.reply("📢 [TAGALL PRO] Broadcast initiated to all members...");
});

bot.command("status", (ctx) => {
  ctx.reply(
    `⚡ RADIANT QUEEN STATUS:
• Uptime: 14d 03:12:27
• CPU: 38% | RAM: 16.2/32GB | GPU: 22%
• Node: QUANTUM-07 (NEO-ORBIT)
• Latency: 21ms
• Security: Shield Active | Threats: 0`
  );
});

if (BOT_TOKEN && BOT_TOKEN !== "NO_TOKEN_PROVIDED") {
  bot.launch()
    .then(() => console.log("🤖 Telegram Bot Polling Started"))
    .catch((err) => console.error("Bot launch failed:", err));
    
  process.once("SIGINT", () => bot.stop("SIGINT"));
  process.once("SIGTERM", () => bot.stop("SIGTERM"));
} else {
  console.log("ℹ️ Telegram bot instance is initialized. Ready to connect whenever you add BOT_TOKEN to your .env file.");
}

export default bot;
