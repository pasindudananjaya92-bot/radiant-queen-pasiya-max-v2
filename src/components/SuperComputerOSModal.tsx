import React, { useState } from "react";
import {
  X,
  Terminal,
  Code,
  FolderGit2,
  Film,
  Sparkles,
  TableProperties,
  Share2,
  Mic,
  Bot,
  Coins,
  SearchCode,
  ShieldAlert,
  LineChart,
  LayoutTemplate,
  Video,
  Lock,
  Briefcase,
  CloudUpload,
  MonitorPlay,
  Cpu,
  Play,
  Copy,
  Check,
  Download,
  Send,
  ExternalLink,
  Plus,
  RefreshCw
} from "lucide-react";
import { SUPER_TOOLS_LIST } from "../data/superTools";
import { SuperTool } from "../types";
import { PASIYA_GITHUB } from "../data/socialLinks";
import confetti from "canvas-confetti";

interface SuperComputerOSModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialToolId?: number;
}

export const SuperComputerOSModal: React.FC<SuperComputerOSModalProps> = ({
  isOpen,
  onClose,
  initialToolId = 1,
}) => {
  const [selectedToolId, setSelectedToolId] = useState<number>(initialToolId);

  // Terminal State
  const [termCommands, setTermCommands] = useState<Array<{ cmd: string; out: string }>>([
    {
      cmd: "quantum --version",
      out: "✨ RADIANT QUEEN • QUANTUM KERNEL v2.9.4 [x86_64-quantum-linux-gnu]\nHost: NEO-ORBIT NODE-07 | Status: ARMORED 100%",
    },
    {
      cmd: "pasiya --info",
      out: "Author: Pasindu Dananjaya (Pasiya Max)\nAssistant: Pasiya AI\nPlatform: https://strideclub-platform-6b71a.containers.snapdeploy.app/",
    },
  ]);
  const [termInput, setTermInput] = useState("");

  // Code Editor State
  const [codeContent, setCodeContent] = useState(
`// ✨ RADIANT QUEEN • PASIYA MAX v2.0
// Quantum Supercomputer Script
import { QuantumCore } from "@pasiya/radiant-queen";

const queen = new QuantumCore({
  model: "RADIANT-Ω",
  armor: "Mk-VII",
  security: "Bulletproof",
});

async function bootSystem() {
  await queen.initializeNeuralSynapses();
  console.log("🚀 Quantum Core Online. 14d Uptime sustained.");
}

bootSystem();`
  );
  const [codeOutput, setCodeOutput] = useState<string | null>(null);

  // Content Factory State
  const [contentTopic, setContentTopic] = useState("AI Supercomputer and Pasiya Max Innovation");
  const [generatedPosts, setGeneratedPosts] = useState<Array<{ platform: string; content: string }>>([
    {
      platform: "Instagram",
      content: "🔥 The Future is NOW! Meet RADIANT QUEEN • PASIYA MAX v2.0 Quantum Bullet Robot! 🤖✨ Powered by next-gen neural architecture. Follow @pasindu5598 for updates! #PasiyaMax #QuantumAI",
    },
    {
      platform: "TikTok",
      content: "POV: You just unlocked the most powerful Super Computer OS on the planet 🚀⚡ Link in bio to test! #PasiyaMax #AI #Quantum",
    },
    {
      platform: "LinkedIn",
      content: "Excited to showcase our milestone in sovereign quantum computing and autonomous agent workflows: RADIANT QUEEN v2.0. Connecting tech with limitless possibilities.",
    },
    {
      platform: "Twitter / X",
      content: "✨ RADIANT QUEEN • PASIYA MAX v2.0 is live! 20 OS tools, instant neural processing, bulletproof security. Check it out now!",
    },
  ]);
  const [isGeneratingContent, setIsGeneratingContent] = useState(false);

  // SEO State
  const [seoUrl, setSeoUrl] = useState("pasiyamax.vercel.app");
  const [seoResult, setSeoResult] = useState<any>({
    score: 98,
    speed: "0.7s",
    mobileFriendly: "Grade A+",
    keywords: ["Pasiya Max", "Radiant Queen", "Quantum OS", "Sinhala AI Bot", "StrideClub"],
  });

  // Invoice State
  const [invoiceClient, setInvoiceClient] = useState("Global Quantum Client");
  const [invoiceItems, setInvoiceItems] = useState([
    { desc: "Quantum OS Architecture Consultation", amount: 2500 },
    { desc: "Pasiya AI Neural Model Deployment", amount: 4800 },
  ]);

  // Crypto State
  const [cryptoBalances, setCryptoBalances] = useState({
    btc: 1.42,
    eth: 18.5,
    sol: 140,
    pasiya: 50000,
  });

  if (!isOpen) return null;

  const currentTool =
    SUPER_TOOLS_LIST.find((t) => t.id === selectedToolId) || SUPER_TOOLS_LIST[0];

  const handleTerminalSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const raw = termInput.trim();
    if (!raw) return;

    let output = "";
    const lower = raw.toLowerCase();

    if (lower === "help") {
      output =
        "Available commands:\n• help - show this menu\n• clear - reset terminal screen\n• stats - view live CPU, RAM, GPU\n• pasiya - official links & brand\n• ls - list quantum storage\n• cat <file> - inspect file\n• ping - test node latency\n• strideclub - launch main platform";
    } else if (lower === "clear") {
      setTermCommands([]);
      setTermInput("");
      return;
    } else if (lower === "stats") {
      output = "CPU: 38% | RAM: 16.2/32GB | GPU: 22% | Armor: Mk-VII 100% | Latency: 21ms";
    } else if (lower === "pasiya" || lower === "social") {
      output = "Pasiya Max Official Links:\n• Instagram: @pasindu5598\n• YouTube: @pasya\n• Main Site: https://strideclub-platform-6b71a.containers.snapdeploy.app/";
    } else if (lower === "ls") {
      output = "drwxr-xr-x  projects/   (12.4 TB)\n-rw-r--r--  blueprint.pdf\n-rw-r--r--  quantum_weights.bin\n-rwxr-xr-x  bot.js";
    } else if (lower.startsWith("cat")) {
      output = "File content [Armored Mk-VII Core]: Secure Quantum Neural Architecture v2.0.";
    } else if (lower === "ping") {
      output = "PING neo-orbit.quantum.pasiya: 64 bytes, icmp_seq=1 ttl=64 time=18.4 ms";
    } else if (lower === "strideclub") {
      output = "Launching StrideClub Platform: https://strideclub-platform-6b71a.containers.snapdeploy.app/";
      window.open("https://strideclub-platform-6b71a.containers.snapdeploy.app/", "_blank");
    } else {
      output = `command executed: "${raw}" -> [STATUS: SUCCESS 200 OK]`;
    }

    setTermCommands((prev) => [...prev, { cmd: raw, out: output }]);
    setTermInput("");
  };

  const handleRunCode = () => {
    setCodeOutput("Compiling Quantum TypeScript...\n✔ Architecture verified.\n✔ Armor Mk-VII linked.\n✔ RADIANT-Ω Synapses active at 4.8 GHz.\nExecution completed with exit code 0.");
  };

  const handleGeneratePosts = async () => {
    setIsGeneratingContent(true);
    try {
      const res = await fetch("/api/content-factory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: contentTopic }),
      });
      const data = await res.json();
      if (Array.isArray(data.posts) && data.posts.length > 0) {
        setGeneratedPosts(data.posts);
      }
      confetti({ particleCount: 30, spread: 60 });
    } catch {
      // client fallback
    } finally {
      setIsGeneratingContent(false);
    }
  };

  const handleCopyAllPosts = () => {
    const text = generatedPosts.map((p) => `[${p.platform}]\n${p.content}\n`).join("\n---\n");
    navigator.clipboard.writeText(text);
    alert("Copied all generated viral posts to clipboard!");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/90 backdrop-blur-xl animate-in fade-in duration-200">
      <div className="relative w-full max-w-6xl h-[92vh] bg-[#0A0B12] border-2 border-[#FFD700]/50 rounded-3xl flex flex-col shadow-[0_0_60px_rgba(255,215,0,0.3)] overflow-hidden">
        {/* Modal Topbar */}
        <div className="p-3 sm:p-4 border-b border-white/10 flex items-center justify-between bg-black/60">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-[#FFD700]/15 border border-[#FFD700]/30 text-[#FFD700]">
              <Cpu className="w-5 h-5 drop-shadow-[0_0_8px_rgba(255,215,0,0.7)]" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-extrabold font-['Orbitron'] text-gold-gradient flex items-center gap-2">
                SUPER COMPUTER OS • 20 TOOLS ECOSYSTEM
              </h3>
              <span className="text-[11px] font-mono text-gray-400">
                Quantum Bullet Robot Integrated Subsystems
              </span>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-gray-400 hover:text-white transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body: Left Tool Selector & Right Tool Workspace */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          {/* Left List of 20 Tools */}
          <div className="w-full md:w-72 border-r border-white/10 bg-black/40 overflow-y-auto p-2 space-y-1">
            <span className="text-[10px] font-mono text-gray-500 uppercase tracking-wider px-2 py-1 block">
              SELECT OS SUBSYSTEM (20/20)
            </span>
            {SUPER_TOOLS_LIST.map((tool: SuperTool) => {
              const isSelected = tool.id === selectedToolId;
              return (
                <button
                  key={tool.id}
                  onClick={() => setSelectedToolId(tool.id)}
                  className={`w-full text-left p-2.5 rounded-xl border transition flex items-center justify-between gap-2 cursor-pointer ${
                    isSelected
                      ? "bg-[#FFD700]/15 border-[#FFD700]/60 text-[#FFD700] shadow-[0_0_12px_rgba(255,215,0,0.25)]"
                      : "bg-white/5 border-white/5 hover:bg-white/10 text-gray-300"
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    <span className="text-[11px] font-mono opacity-60">
                      {String(tool.id).padStart(2, "0")}.
                    </span>
                    <span className="text-xs font-bold truncate">{tool.title}</span>
                  </div>
                  <span
                    className={`text-[9px] font-mono px-1.5 py-0.5 rounded border ${
                      tool.status === "Active"
                        ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
                        : tool.status === "Ready"
                        ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/30"
                        : "bg-amber-500/20 text-amber-300 border-amber-500/30"
                    }`}
                  >
                    {tool.status}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Right Active Tool Stage */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-[#07080E] flex flex-col gap-4">
            {/* Tool Header */}
            <div className="border-b border-white/10 pb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="text-[10px] font-mono text-[#00B4D8] uppercase tracking-wider">
                  {currentTool.category}
                </span>
                <h4 className="text-lg sm:text-xl font-bold text-gray-100 font-['Orbitron']">
                  {currentTool.title}
                </h4>
                <p className="text-xs text-gray-400 mt-0.5">{currentTool.description}</p>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-mono px-3 py-1 rounded-full bg-[#FFD700]/15 border border-[#FFD700]/40 text-[#FFD700]">
                  INTEGRITY 100%
                </span>
              </div>
            </div>

            {/* Dynamic Tool Interface Content */}
            {/* 1. Cloud Terminal */}
            {selectedToolId === 1 && (
              <div className="flex-1 flex flex-col rounded-2xl bg-black border border-emerald-500/30 p-4 font-mono text-xs text-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.1)] min-h-[350px]">
                <div className="flex-1 overflow-y-auto space-y-2 mb-3">
                  {termCommands.map((item, idx) => (
                    <div key={idx} className="space-y-1">
                      <div className="text-gray-400 flex items-center gap-1.5">
                        <span className="text-[#FFD700]">root@radiant-queen:~$</span>
                        <span className="text-white">{item.cmd}</span>
                      </div>
                      <div className="whitespace-pre-wrap text-emerald-300 pl-4 border-l border-emerald-500/30">
                        {item.out}
                      </div>
                    </div>
                  ))}
                </div>

                <form onSubmit={handleTerminalSubmit} className="flex items-center gap-2 pt-2 border-t border-emerald-500/20">
                  <span className="text-[#FFD700]">root@radiant-queen:~$</span>
                  <input
                    type="text"
                    value={termInput}
                    onChange={(e) => setTermInput(e.target.value)}
                    placeholder="Type command ('help', 'stats', 'pasiya', 'strideclub', 'ls')..."
                    className="flex-1 bg-transparent text-white focus:outline-none"
                    autoFocus
                  />
                  <button type="submit" className="px-3 py-1 rounded bg-emerald-500 text-black font-bold text-[11px]">
                    EXEC
                  </button>
                </form>
              </div>
            )}

            {/* 2. VS Code Editor */}
            {selectedToolId === 2 && (
              <div className="flex-1 flex flex-col gap-3">
                <div className="flex items-center justify-between border-b border-white/10 pb-2">
                  <span className="text-xs font-mono text-gray-300">quantum_core.ts</span>
                  <div className="flex items-center gap-2">
                    <a
                      href={PASIYA_GITHUB}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1 rounded-lg bg-white/5 border border-white/15 hover:border-white text-xs font-mono text-gray-200 flex items-center gap-1.5 transition"
                    >
                      <span>Push to GitHub</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                    <button
                      onClick={handleRunCode}
                      className="px-3 py-1 rounded-lg bg-[#FFD700] text-black font-bold text-xs flex items-center gap-1 hover:brightness-110 cursor-pointer"
                    >
                      <Play className="w-3.5 h-3.5" />
                      <span>RUN CODE</span>
                    </button>
                  </div>
                </div>

                <textarea
                  value={codeContent}
                  onChange={(e) => setCodeContent(e.target.value)}
                  className="w-full h-56 rounded-xl bg-black/80 border border-white/15 p-3 text-xs font-mono text-cyan-200 focus:outline-none focus:border-[#FFD700] leading-relaxed resize-none"
                />

                {codeOutput && (
                  <div className="p-3 rounded-xl bg-black border border-emerald-500/30 text-emerald-300 font-mono text-xs whitespace-pre-wrap">
                    {codeOutput}
                  </div>
                )}
              </div>
            )}

            {/* 3. File Manager Pro (50TB) */}
            {selectedToolId === 3 && (
              <div className="space-y-3 font-mono text-xs">
                <div className="flex items-center justify-between p-3 rounded-xl bg-black/60 border border-white/10">
                  <span className="text-gray-400">Current Directory: /cloud/quantum/projects/</span>
                  <label className="px-3 py-1.5 rounded-lg bg-[#FFD700] text-black font-bold text-xs cursor-pointer hover:brightness-110">
                    <span>UPLOAD TO 50TB CLOUD</span>
                    <input
                      type="file"
                      className="hidden"
                      onChange={(e) => {
                        if (e.target.files?.[0]) {
                          alert(`Uploaded ${e.target.files[0].name} to Quantum Drive!`);
                        }
                      }}
                    />
                  </label>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {[
                    { name: "neural_checkpoints.bin", size: "18.2 GB", type: "Model Weights" },
                    { name: "strideclub_build_v2.apk", size: "45.0 MB", type: "Mobile App" },
                    { name: "pasiya_max_manifest.json", size: "12 KB", type: "Config" },
                    { name: "dataset_train_v9.zip", size: "4.8 GB", type: "Dataset Archive" },
                    { name: "robot_armor_blueprint.pdf", size: "24.8 MB", type: "CAD Blueprint" },
                    { name: "bot_telemetry_2026.log", size: "1.2 MB", type: "Audit Log" },
                  ].map((f, i) => (
                    <div key={i} className="p-3 rounded-xl bg-black/60 border border-white/10 flex flex-col justify-between gap-2">
                      <div>
                        <span className="font-bold text-gray-200 block truncate">{f.name}</span>
                        <span className="text-[10px] text-amber-300">{f.type}</span>
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-gray-500 pt-2 border-t border-white/10">
                        <span>{f.size}</span>
                        <span className="text-emerald-400">SECURE</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 4. Video Studio (FFmpeg simulator) */}
            {selectedToolId === 4 && (
              <div className="space-y-3 font-sans text-xs">
                <div className="p-4 rounded-2xl bg-black/60 border border-white/10 flex flex-col gap-3">
                  <span className="font-bold text-sm text-gray-100 font-['Orbitron']">
                    FFmpeg Media Transcoder & Video Studio
                  </span>
                  <p className="text-gray-400 text-xs">
                    Convert high-res streams to MP4, MP3, WebM, GIF with quantum GPU acceleration.
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="text-[10px] font-mono text-gray-400 block mb-1">Target Format</label>
                      <select className="w-full bg-black border border-white/20 rounded-xl p-2 text-white">
                        <option>MP4 (H.265 Ultra)</option>
                        <option>MP3 (320kbps Audio)</option>
                        <option>WebM (HDR)</option>
                        <option>Animated GIF (60fps)</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-[10px] font-mono text-gray-400 block mb-1">Resolution</label>
                      <select className="w-full bg-black border border-white/20 rounded-xl p-2 text-white">
                        <option>4K Ultra HD (3840x2160)</option>
                        <option>1080p Full HD (1920x1080)</option>
                        <option>720p Mobile (1280x720)</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-[10px] font-mono text-gray-400 block mb-1">GPU Profile</label>
                      <select className="w-full bg-black border border-white/20 rounded-xl p-2 text-white">
                        <option>Quantum Tensor Cores (22% Load)</option>
                        <option>Lossless Cinema Mode</option>
                      </select>
                    </div>
                  </div>

                  <button
                    onClick={() => alert("FFmpeg Transcode Job Queued in Background!")}
                    className="w-full py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-[#FFD700] text-black font-bold text-xs hover:brightness-110 cursor-pointer"
                  >
                    START FAST TRANSCODE
                  </button>
                </div>
              </div>
            )}

            {/* 7. AI Content Factory */}
            {selectedToolId === 7 && (
              <div className="space-y-3 font-sans text-xs">
                <div className="p-4 rounded-2xl bg-black/60 border border-[#FFD700]/30 flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold font-['Orbitron'] text-gold-gradient">
                      AI CONTENT FACTORY (100 POSTS GENERATOR)
                    </span>
                    <button
                      onClick={handleCopyAllPosts}
                      className="px-3 py-1 rounded-lg bg-[#FFD700] text-black font-bold text-xs flex items-center gap-1 hover:brightness-110 cursor-pointer"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      <span>COPY ALL POSTS</span>
                    </button>
                  </div>

                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={contentTopic}
                      onChange={(e) => setContentTopic(e.target.value)}
                      placeholder="Enter topic or launch campaign..."
                      className="flex-1 bg-black border border-white/20 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-[#FFD700]"
                    />
                    <button
                      onClick={handleGeneratePosts}
                      disabled={isGeneratingContent}
                      className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#FFD700] to-yellow-500 text-black font-bold text-xs hover:brightness-110 cursor-pointer"
                    >
                      {isGeneratingContent ? "GENERATING..." : "GENERATE ALL"}
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
                    {generatedPosts.map((p, idx) => (
                      <div key={idx} className="p-3 rounded-xl bg-black/80 border border-white/10 flex flex-col justify-between gap-2">
                        <div className="flex items-center justify-between text-[11px] font-mono text-[#FFD700]">
                          <span>{p.platform}</span>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(p.content);
                              alert(`Copied ${p.platform} post!`);
                            }}
                            className="text-gray-400 hover:text-white"
                          >
                            <Copy className="w-3 h-3" />
                          </button>
                        </div>
                        <p className="text-gray-200 text-xs leading-relaxed">{p.content}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* 10. Crypto Wallet & Auto Trading Bot */}
            {selectedToolId === 10 && (
              <div className="space-y-3 font-mono text-xs">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3 rounded-xl bg-black/60 border border-amber-500/30">
                    <span className="text-[10px] text-gray-400 block">BTC / USD</span>
                    <span className="text-base font-bold text-amber-300">$94,820.00</span>
                    <span className="text-[10px] text-emerald-400">+4.2%</span>
                  </div>

                  <div className="p-3 rounded-xl bg-black/60 border border-cyan-500/30">
                    <span className="text-[10px] text-gray-400 block">ETH / USD</span>
                    <span className="text-base font-bold text-cyan-300">$3,485.50</span>
                    <span className="text-[10px] text-emerald-400">+2.8%</span>
                  </div>

                  <div className="p-3 rounded-xl bg-black/60 border border-purple-500/30">
                    <span className="text-[10px] text-gray-400 block">SOL / USD</span>
                    <span className="text-base font-bold text-purple-300">$214.20</span>
                    <span className="text-[10px] text-emerald-400">+8.5%</span>
                  </div>

                  <div className="p-3 rounded-xl bg-black/60 border border-[#FFD700]/30">
                    <span className="text-[10px] text-gray-400 block">PASIYA TOKEN</span>
                    <span className="text-base font-bold text-[#FFD700]">$12.50</span>
                    <span className="text-[10px] text-emerald-400">+24.0%</span>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-black/60 border border-white/10 flex flex-col gap-2">
                  <span className="font-bold text-gray-200">QUANTUM AUTO-TRADING ALGORITHM: ACTIVE</span>
                  <p className="text-gray-400 text-xs">
                    Automated scalping strategy running on Binance & Bybit sub-accounts. Zero loss stop-guard enabled.
                  </p>
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={() => alert("Simulation Order Placed: Buy 0.1 BTC")}
                      className="px-4 py-2 rounded-xl bg-emerald-500 text-black font-bold text-xs"
                    >
                      SIMULATE BUY ORDER
                    </button>
                    <button
                      onClick={() => alert("Simulation Order Placed: Take Profit 50%")}
                      className="px-4 py-2 rounded-xl bg-red-500 text-white font-bold text-xs"
                    >
                      TAKE PROFIT (TP)
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* 13. SEO & Web Rank Checker */}
            {selectedToolId === 13 && (
              <div className="space-y-3 font-sans text-xs">
                <div className="p-4 rounded-2xl bg-black/60 border border-white/10 flex flex-col gap-3">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={seoUrl}
                      onChange={(e) => setSeoUrl(e.target.value)}
                      placeholder="Enter domain (e.g. pasiyamax.vercel.app)"
                      className="flex-1 bg-black border border-white/20 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-[#FFD700]"
                    />
                    <button
                      onClick={() => alert("Domain audit completed! Score: 98/100 Grade A+")}
                      className="px-4 py-2 rounded-xl bg-[#FFD700] text-black font-bold text-xs hover:brightness-110 cursor-pointer"
                    >
                      AUDIT DOMAIN
                    </button>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-2 font-mono">
                    <div className="p-3 rounded-xl bg-black/70 border border-emerald-500/30">
                      <span className="text-[10px] text-gray-400 block">SEO SCORE</span>
                      <span className="text-lg font-bold text-emerald-400">{seoResult.score} / 100</span>
                    </div>

                    <div className="p-3 rounded-xl bg-black/70 border border-cyan-500/30">
                      <span className="text-[10px] text-gray-400 block">SPEED INDEX</span>
                      <span className="text-lg font-bold text-cyan-300">{seoResult.speed}</span>
                    </div>

                    <div className="p-3 rounded-xl bg-black/70 border border-amber-500/30">
                      <span className="text-[10px] text-gray-400 block">MOBILE READINESS</span>
                      <span className="text-lg font-bold text-amber-300">{seoResult.mobileFriendly}</span>
                    </div>

                    <div className="p-3 rounded-xl bg-black/70 border border-purple-500/30">
                      <span className="text-[10px] text-gray-400 block">SSL RATING</span>
                      <span className="text-lg font-bold text-purple-300">Grade A+</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 17. Business Suite (Invoice & CRM) */}
            {selectedToolId === 17 && (
              <div className="space-y-3 font-sans text-xs">
                <div className="p-4 rounded-2xl bg-black/60 border border-white/10 flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold font-['Orbitron'] text-gold-gradient">
                      QUANTUM INVOICE GENERATOR
                    </span>
                    <button
                      onClick={() => window.print()}
                      className="px-3 py-1 rounded-lg bg-[#FFD700] text-black font-bold text-xs hover:brightness-110 cursor-pointer"
                    >
                      PRINT / PDF
                    </button>
                  </div>

                  <div className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-2">
                    <div className="flex justify-between border-b border-white/10 pb-2">
                      <span className="font-bold text-gray-200">Billed To: {invoiceClient}</span>
                      <span className="font-mono text-[#FFD700]">INV-2026-0042</span>
                    </div>

                    <div className="space-y-1 py-1">
                      {invoiceItems.map((item, i) => (
                        <div key={i} className="flex justify-between text-gray-300 font-mono">
                          <span>{item.desc}</span>
                          <span>${item.amount.toLocaleString()}</span>
                        </div>
                      ))}
                    </div>

                    <div className="pt-2 border-t border-white/10 flex justify-between font-bold text-sm text-[#FFD700]">
                      <span>TOTAL DUE:</span>
                      <span>$7,300.00 USD</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Default fallback for other tools in the 20 tools list */}
            {![1, 2, 3, 4, 7, 10, 13, 17].includes(selectedToolId) && (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center rounded-2xl bg-black/60 border border-white/10 gap-3">
                <div className="w-14 h-14 rounded-2xl bg-[#FFD700]/15 border border-[#FFD700]/30 flex items-center justify-center text-[#FFD700]">
                  <Sparkles className="w-7 h-7" />
                </div>
                <h5 className="text-base font-bold text-gray-100 font-['Orbitron']">
                  {currentTool.title} Active in Quantum Space
                </h5>
                <p className="text-xs text-gray-400 max-w-md">
                  {currentTool.description} Subsystem is synchronized with Neo-Orbit Node 07.
                </p>
                <button
                  onClick={() => alert(`Executed action for ${currentTool.title}!`)}
                  className="px-5 py-2 rounded-xl bg-[#FFD700] text-black font-bold text-xs hover:brightness-110 transition cursor-pointer"
                >
                  EXECUTE SUBSYSTEM NOW
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
