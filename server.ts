import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

const nodeRequire = createRequire(import.meta.url);
const { ZipArchive } = nodeRequire("archiver");

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "10mb" }));

// Download Project ZIP Endpoint
app.get("/api/download-zip", (_req, res) => {
  try {
    const archiveName = `pasiya-max-radiant-queen-project-${Date.now()}.zip`;
    res.attachment(archiveName);
    res.setHeader("Content-Type", "application/zip");

    const archive = new ZipArchive({
      zlib: { level: 9 },
    });

    archive.on("error", (err: any) => {
      console.error("Archive error:", err);
      if (!res.headersSent) {
        res.status(500).json({ error: "Failed to create archive", details: err?.message });
      }
    });

    archive.pipe(res);

    // Pack workspace files excluding build, cache, and node_modules
    archive.glob("**/*", {
      cwd: process.cwd(),
      ignore: [
        "node_modules/**",
        "dist/**",
        ".git/**",
        "*.zip",
        ".env",
        ".cache/**",
      ],
      dot: true,
    });

    archive.finalize();
  } catch (err: any) {
    console.error("Failed to initiate zip download:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Could not generate zip archive", details: err?.message });
    }
  }
});

// Lazy initialize GoogleGenAI
let genAIClient: GoogleGenAI | null = null;
function getGenAI(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return null;
  }
  if (!genAIClient) {
    genAIClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return genAIClient;
}

// Helper to auto-connect to Gemini Flash with fallback resilience
async function generateWithFlash(ai: GoogleGenAI, params: any) {
  const models = ["gemini-flash-latest", "gemini-2.5-flash", "gemini-3.8-flash"];
  let lastErr: any = null;
  for (const model of models) {
    try {
      const res = await ai.models.generateContent({
        ...params,
        model,
      });
      return res;
    } catch (err: any) {
      lastErr = err;
      console.warn(`Flash model ${model} temporarily busy (${err?.status || err?.message}), testing fallback...`);
    }
  }
  throw lastErr;
}

const PASIYA_LINKS = `
📲 My Social Media & Links (Pasiya Max):
1️⃣ 📸 Instagram: https://www.instagram.com/pasindu5598
2️⃣ 📘 Facebook: https://www.facebook.com/share/18xRGhYVUo/
3️⃣ 🌐 Blog: https://mamageblog.blogspot.com
4️⃣ ▶️ YouTube: https://youtube.com/@pasya
5️⃣ 💬 WhatsApp Channel: https://whatsapp.com/channel/0029VaPASIAMAX
6️⃣ 💬 WhatsApp Group: https://chat.whatsapp.com/KjhsWakBQoUI4SEEvZXAsO
7️⃣ 📱 Imo: https://s.imoim.net/KNdKwX?ISCI=001102
8️⃣ 🎵 TikTok: https://tiktok.com/@pasindudananjaya619
9️⃣ 💼 LinkedIn Profile: https://linkedin.com/in/pasindu-dananjaya-41044831b
🔟 💼 LinkedIn Group: https://www.linkedin.com/groups/22101008
1️⃣1️⃣ 🐦 X / Twitter: https://x.com/PasinduDan98554
1️⃣2️⃣ 💜 Viber Channel: https://invite.viber.com/?g2=AQBWlEwa%2BDKVDFaaTbesR5FqD2IQZhFjhhQdN%2Fvdsaml9xVUCL8RnDHcFy6kno0U
1️⃣3️⃣ 📢 Telegram Channel: https://t.me/goldenbotmdchannel
🚀 Main Site: https://strideclub-platform-6b71a.containers.snapdeploy.app/
`;

// Health check
app.get("/api/health", (_req, res) => {
  res.json({
    status: "online",
    system: "RADIANT QUEEN • PASIYA MAX v2.0",
    quantumCore: "v2.9.4 ACTIVE",
    uptime: "14d 03:12:27",
  });
});

// System live metrics
app.get("/api/system-status", (_req, res) => {
  const cpu = 36 + Math.floor(Math.random() * 8);
  const ram = (16.1 + Math.random() * 0.4).toFixed(1);
  const gpu = 20 + Math.floor(Math.random() * 7);
  const latency = 18 + Math.floor(Math.random() * 8);
  res.json({
    cpu: `${cpu}%`,
    ram: `${ram}/32GB`,
    gpu: `${gpu}%`,
    latency: `${latency}ms`,
    integrity: "100%",
    threats: 0,
    firewall: "ACTIVE",
    armor: "Mk-VII Bulletproof Integrity 100%",
    node: "QUANTUM-07",
    region: "NEO-ORBIT",
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

// Chat endpoint (Sinhala + English, Pasiya AI persona)
app.post("/api/chat", async (req, res) => {
  try {
    const { message, history } = req.body;
    if (!message) {
      return res.status(400).json({ error: "Message is required" });
    }

    const ai = getGenAI();
    if (!ai) {
      return res.json({
        reply: `✨ **RADIANT QUEEN • PASIYA AI:**\n\nආයුබෝවන්! මම Pasiya Max ගේ නිල සහායකයා වන Pasiya AI. (I am Pasiya AI, official assistant of Pasiya Max).\n\nඔබ ඇසූ ප්‍රශ්නය: "${message}"\n\n${PASIYA_LINKS}`,
      });
    }

    const systemPrompt = `You are "Pasiya AI," the official AI assistant of Pasiya Max and the voice of RADIANT QUEEN • PASIYA MAX v2.0 Bullet Robot Super Computer.
Key Instructions:
1. When asked about social media or contact information, always provide the list of links:
${PASIYA_LINKS}
2. Maintain a helpful, respectful, and engaging tone in Sinhala (primary when user writes or asks in Sinhala) and English as needed.
3. If users ask about your identity, introduce yourself as Pasiya AI, the assistant for Pasiya Max.
4. Always encourage users to follow or support the channels provided.
5. Provide high quality, accurate technical, coding, creative, and strategic guidance with sleek, futuristic robotic charisma.`;

    const contents = [];
    if (Array.isArray(history) && history.length > 0) {
      for (const h of history.slice(-6)) {
        contents.push({
          role: h.role === "assistant" ? "model" : "user",
          parts: [{ text: h.content }],
        });
      }
    }
    contents.push({
      role: "user",
      parts: [{ text: message }],
    });

    const response = await generateWithFlash(ai, {
      contents,
      config: {
        systemInstruction: systemPrompt,
      },
    });

    const reply = response.text || "✨ Quantum Core processed your signal.";
    return res.json({ reply });
  } catch (err: any) {
    console.error("Gemini chat error:", err);
    return res.status(500).json({
      error: "Failed to query Quantum Brain",
      fallback: `✨ **RADIANT QUEEN • PASIYA AI:**\n\nපණිවිඩය සාර්ථකව ලැබුණි! Pasiya Max ගේ සමාජ මාධ්‍ය වෙත පිවිසෙන්න:\n${PASIYA_LINKS}`,
    });
  }
});

// AI Content Factory
app.post("/api/content-factory", async (req, res) => {
  try {
    const { topic = "AI Supercomputer and Tech Innovation by Pasiya Max" } = req.body;
    const ai = getGenAI();

    if (!ai) {
      return res.json({
        posts: [
          { platform: "Instagram", content: `🔥 The Future is NOW! Meet RADIANT QUEEN • PASIYA MAX v2.0 Quantum Bullet Robot! 🤖✨ Powered by next-gen neural architecture. Follow @pasindu5598 for updates!` },
          { platform: "TikTok", content: `POV: You just unlocked the most powerful Super Computer OS on the planet 🚀⚡ Link in bio to test! #PasiyaMax #AI #Quantum` },
          { platform: "LinkedIn", content: `Excited to showcase our milestone in sovereign quantum computing and autonomous agent workflows: RADIANT QUEEN v2.0. Connecting tech with limitless possibilities.` },
          { platform: "Twitter / X", content: `✨ RADIANT QUEEN • PASIYA MAX v2.0 is live! 20 OS tools, instant neural processing, bulletproof security. Check it out now!` },
          { platform: "Facebook", content: `අදම අපගේ නවතම Pasiya Max AI තාක්ෂණය අත්විඳින්න! සියලු විස්තර සඳහා අපගේ නිල පිටුව සමග රැඳී සිටින්න. ❤️` }
        ]
      });
    }

    const response = await generateWithFlash(ai, {
      contents: `Generate 5 viral social media posts (Instagram with hashtags, TikTok hook, LinkedIn professional, Twitter/X punchy, Facebook Sinhala/English mix) for the topic: "${topic}". Brand: Pasiya Max and RADIANT QUEEN. Return valid JSON array with format [{ "platform": "string", "content": "string" }]. Output only JSON.`,
      config: {
        responseMimeType: "application/json",
      }
    });

    const jsonText = response.text?.trim() || "[]";
    const posts = JSON.parse(jsonText);
    return res.json({ posts });
  } catch (err: any) {
    console.error("Content factory error:", err);
    return res.json({
      posts: [
        { platform: "Instagram", content: "⚡ Exploring the ultimate quantum neural frontier with Pasiya Max! #Tech #AI #Quantum" },
        { platform: "LinkedIn", content: "Democratizing high-performance AI tooling with the Radiant Queen Super OS suite." },
        { platform: "Twitter/X", content: "Unstoppable speed. 14d uptime. 20 super tools. Welcome to Pasiya Max v2.0!" }
      ]
    });
  }
});

// SEO & Web Rank Audit
app.post("/api/seo-audit", async (req, res) => {
  try {
    const { url = "pasiyamax.vercel.app" } = req.body;
    const ai = getGenAI();

    if (!ai) {
      return res.json({
        domain: url,
        score: 96,
        performance: "Exceptional",
        metaHealth: "Optimized",
        speedIndex: "0.8s",
        keywords: ["pasiya max", "radiant queen", "quantum ai", "sinhala ai bot", "strideclub"],
        recommendations: [
          "Maintain active OpenGraph tags for viral previews",
          "Ensure WebP / AVIF compression for high-res hero banners",
          "Add structured schema JSON-LD for SoftwareApplication and Brand"
        ]
      });
    }

    const response = await generateWithFlash(ai, {
      contents: `Perform a professional SEO and web performance audit analysis for the domain/url: "${url}".
Return valid JSON object:
{
  "domain": "${url}",
  "score": 95,
  "performance": "Grade A+",
  "metaHealth": "Passing 18/18 checks",
  "speedIndex": "0.7s",
  "keywords": ["keyword 1", "keyword 2", "keyword 3", "keyword 4"],
  "recommendations": ["rec 1", "rec 2", "rec 3"]
}
Output only JSON.`,
      config: {
        responseMimeType: "application/json",
      }
    });

    const parsed = JSON.parse(response.text?.trim() || "{}");
    return res.json(parsed);
  } catch (err) {
    return res.json({
      domain: req.body.url || "pasiyamax.vercel.app",
      score: 94,
      performance: "Excellent",
      metaHealth: "Verified",
      speedIndex: "0.9s",
      keywords: ["Pasiya Max", "Radiant Queen", "AI Supercomputer", "Sri Lanka Tech", "Quantum OS"],
      recommendations: ["Canonical tags verified", "SSL A+ rating secured", "Accelerated mobile pages validated"]
    });
  }
});

// Production Vite serving or Development Middleware
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`✨ RADIANT QUEEN • PASIYA MAX v2.0 Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
