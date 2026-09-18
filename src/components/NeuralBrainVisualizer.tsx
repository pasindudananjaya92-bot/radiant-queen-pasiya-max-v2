import React, { useEffect, useRef, useState } from "react";
import {
  Brain,
  Sparkles,
  Send,
  Volume2,
  VolumeX,
  Copy,
  Check,
  Cpu,
  Flame,
  Zap,
  Activity
} from "lucide-react";
import confetti from "canvas-confetti";

interface NeuralBrainVisualizerProps {
  onTriggerTool: (toolId: number) => void;
}

export const NeuralBrainVisualizer: React.FC<NeuralBrainVisualizerProps> = ({
  onTriggerTool,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // States
  const [toggle1, setToggle1] = useState(true); // Neural Synapse
  const [toggle2, setToggle2] = useState(true); // Quantum Core
  const [toggle3, setToggle3] = useState(true); // Auto Adaptive

  const [inputPrompt, setInputPrompt] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [chatLog, setChatLog] = useState<Array<{ role: string; content: string }>>([
    {
      role: "assistant",
      content:
        "👑 **RADIANT QUEEN • PASIYA AI:**\nආයුබෝවන්! මම Pasiya Max ගේ නිල AI සහායකයා වන Pasiya AI. Quantum Brain සූදානම්! Ask me anything in Sinhala or English, launch any of our 20 super tools, or explore our social nexus!",
    },
  ]);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);

  // Canvas Neural Brain animation
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    let width = (canvas.width = canvas.parentElement?.clientWidth || 400);
    let height = (canvas.height = 240);

    const handleResize = () => {
      if (!canvas || !canvas.parentElement) return;
      width = canvas.width = canvas.parentElement.clientWidth;
      height = canvas.height = 240;
    };
    window.addEventListener("resize", handleResize);

    // 3D Sphere nodes for glowing brain
    interface Node3D {
      x: number;
      y: number;
      z: number;
      baseX: number;
      baseY: number;
      baseZ: number;
      size: number;
      color: string;
    }

    const nodeCount = 55;
    const nodes: Node3D[] = [];
    const radius = 75;

    for (let i = 0; i < nodeCount; i++) {
      const theta = Math.acos(2 * Math.random() - 1);
      const phi = Math.sqrt(nodeCount * Math.PI) * theta;
      const x = radius * Math.sin(theta) * Math.cos(phi);
      const y = radius * Math.sin(theta) * Math.sin(phi) * 0.85; // slightly brain shaped
      const z = radius * Math.cos(theta);
      const isCyan = i % 7 === 0;
      nodes.push({
        x,
        y,
        z,
        baseX: x,
        baseY: y,
        baseZ: z,
        size: isCyan ? 2.5 : Math.random() * 2 + 1.2,
        color: isCyan ? "#00B4D8" : "#FFD700",
      });
    }

    let angleY = 0;
    let angleX = 0.15;

    const render = () => {
      ctx.clearRect(0, 0, width, height);

      const centerX = width / 2;
      const centerY = height / 2;

      // Glow center aura
      const radial = ctx.createRadialGradient(
        centerX,
        centerY,
        10,
        centerX,
        centerY,
        130
      );
      radial.addColorStop(0, "rgba(255, 215, 0, 0.25)");
      radial.addColorStop(0.5, "rgba(0, 180, 216, 0.1)");
      radial.addColorStop(1, "rgba(5, 5, 7, 0)");
      ctx.fillStyle = radial;
      ctx.fillRect(0, 0, width, height);

      angleY += 0.01;

      // Rotate nodes in 3D
      const cosY = Math.cos(angleY);
      const sinY = Math.sin(angleY);
      const cosX = Math.cos(angleX);
      const sinX = Math.sin(angleX);

      const projected: Array<{ px: number; py: number; pz: number; node: Node3D }> = [];

      nodes.forEach((n) => {
        // Rotate Y
        const x1 = n.baseX * cosY - n.baseZ * sinY;
        const z1 = n.baseZ * cosY + n.baseX * sinY;

        // Rotate X
        const y2 = n.baseY * cosX - z1 * sinX;
        const z2 = z1 * cosX + n.baseY * sinX;

        const fov = 260;
        const scale = fov / (fov + z2);
        const px = centerX + x1 * scale;
        const py = centerY + y2 * scale;

        projected.push({ px, py, pz: z2, node: n });
      });

      // Sort by depth
      projected.sort((a, b) => a.pz - b.pz);

      // Draw Synapses
      ctx.lineWidth = 0.75;
      for (let i = 0; i < projected.length; i++) {
        for (let j = i + 1; j < projected.length; j++) {
          const dx = projected[i].px - projected[j].px;
          const dy = projected[i].py - projected[j].py;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < 46) {
            const alpha = (1 - dist / 46) * 0.45;
            ctx.strokeStyle = `rgba(255, 215, 0, ${alpha})`;
            ctx.beginPath();
            ctx.moveTo(projected[i].px, projected[i].py);
            ctx.lineTo(projected[j].px, projected[j].py);
            ctx.stroke();
          }
        }
      }

      // Draw Nodes
      projected.forEach(({ px, py, node }) => {
        ctx.beginPath();
        ctx.arc(px, py, node.size, 0, Math.PI * 2);
        ctx.fillStyle = node.color;
        ctx.shadowBlur = 8;
        ctx.shadowColor = node.color;
        ctx.fill();
        ctx.shadowBlur = 0;
      });

      // Central core pulse
      ctx.beginPath();
      ctx.arc(centerX, centerY, 14 + Math.sin(Date.now() * 0.005) * 3, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255, 215, 0, 0.4)";
      ctx.shadowBlur = 18;
      ctx.shadowColor = "#FFD700";
      ctx.fill();
      ctx.shadowBlur = 0;

      animId = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener("resize", handleResize);
      cancelAnimationFrame(animId);
    };
  }, []);

  const handleSendPrompt = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputPrompt.trim() || isLoading) return;

    const userMsg = inputPrompt.trim();
    setInputPrompt("");
    setChatLog((prev) => [...prev, { role: "user", content: userMsg }]);
    setIsLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMsg,
          history: chatLog.slice(-6),
        }),
      });

      const data = await res.json();
      const replyText =
        data.reply || data.fallback || "✨ Neural response generated successfully.";
      setChatLog((prev) => [...prev, { role: "assistant", content: replyText }]);

      // subtle celebratory confetti if user praises or asks for something big
      if (userMsg.toLowerCase().includes("win") || userMsg.toLowerCase().includes("strideclub") || userMsg.toLowerCase().includes("pasiya")) {
        confetti({ particleCount: 40, spread: 60, origin: { y: 0.6 } });
      }
    } catch {
      setChatLog((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            "✨ [QUANTUM CORE LOCAL]: Signal received! Contact Pasiya Max via official links or try again.",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const handleSpeak = (text: string) => {
    if (!("speechSynthesis" in window)) return;
    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }

    const cleanText = text.replace(/[*_#`[\]()]/g, "");
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.pitch = 1.05;
    utterance.rate = 1.0;
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    window.speechSynthesis.speak(utterance);
    setIsSpeaking(true);
  };

  return (
    <div className="flex-1 bg-[#08090E]/90 border border-[#FFD700]/30 rounded-2xl p-3 sm:p-4 flex flex-col gap-3 shadow-[0_0_25px_rgba(255,215,0,0.1)] backdrop-blur-md">
      {/* Header Info Banner */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-2.5">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-[#FFD700]/15 border border-[#FFD700]/30 text-[#FFD700]">
            <Brain className="w-5 h-5 drop-shadow-[0_0_8px_rgba(255,215,0,0.7)]" />
          </div>
          <div>
            <h2 className="text-sm sm:text-base font-extrabold tracking-wider font-['Orbitron'] text-gold-gradient">
              AI BRAIN NEURAL CONTROL
            </h2>
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono text-gray-400">
              <span className="text-[#00B4D8] flex items-center gap-1 font-bold">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                AI STUDIO BRAIN: AUTO-CONNECTED (Gemini Flash)
              </span>
              <span className="px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold">
                LIVE
              </span>
            </div>
          </div>
        </div>

        {/* Learning Rate & Memory Metrics */}
        <div className="flex items-center gap-2 text-[11px] font-mono">
          <div className="px-2 py-1 rounded-lg bg-white/5 border border-white/10 flex items-center gap-1">
            <Activity className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-gray-400">LR:</span>
            <span className="text-amber-200 font-bold">0.00012</span>
          </div>

          <div className="px-2 py-1 rounded-lg bg-white/5 border border-white/10 flex items-center gap-1">
            <Cpu className="w-3.5 h-3.5 text-[#00B4D8]" />
            <span className="text-gray-400">Memory:</span>
            <span className="text-cyan-200 font-bold">128k Tokens</span>
          </div>
        </div>
      </div>

      {/* Center Brain 3D Canvas & Toggle Controls */}
      <div className="relative rounded-xl bg-black/70 border border-[#FFD700]/20 overflow-hidden flex flex-col items-center">
        {/* Holographic Watermark Badge */}
        <div className="absolute top-2 left-3 z-10 flex items-center gap-1.5 text-[10px] font-mono text-amber-300/80 bg-black/60 px-2 py-0.5 rounded border border-amber-500/30">
          <Zap className="w-3 h-3 text-[#FFD700]" />
          <span>SYNAPSE ACCELERATOR 4.8 GHz</span>
        </div>

        {/* 3D Neural Sphere Canvas */}
        <canvas ref={canvasRef} className="w-full h-44 sm:h-52 z-0" />

        {/* ON ON ON Required Switches */}
        <div className="absolute bottom-2.5 z-10 flex flex-wrap items-center justify-center gap-2 sm:gap-4 px-3 py-1.5 rounded-xl bg-black/85 border border-[#FFD700]/30 shadow-[0_0_15px_rgba(255,215,0,0.15)]">
          {/* Switch 1 */}
          <button
            onClick={() => setToggle1(!toggle1)}
            className="flex items-center gap-1.5 text-xs font-mono transition cursor-pointer"
          >
            <span className="text-gray-400 text-[11px]">NEURAL:</span>
            <span
              className={`px-2 py-0.5 rounded text-[10px] font-bold tracking-wider transition ${
                toggle1
                  ? "bg-gradient-to-r from-emerald-500 to-green-600 text-black shadow-[0_0_8px_rgba(16,185,129,0.5)]"
                  : "bg-gray-800 text-gray-500"
              }`}
            >
              {toggle1 ? "ON" : "OFF"}
            </span>
          </button>

          <div className="h-3 w-px bg-white/20" />

          {/* Switch 2 */}
          <button
            onClick={() => setToggle2(!toggle2)}
            className="flex items-center gap-1.5 text-xs font-mono transition cursor-pointer"
          >
            <span className="text-gray-400 text-[11px]">QUANTUM:</span>
            <span
              className={`px-2 py-0.5 rounded text-[10px] font-bold tracking-wider transition ${
                toggle2
                  ? "bg-gradient-to-r from-[#FFD700] to-yellow-500 text-black shadow-[0_0_8px_rgba(255,215,0,0.6)]"
                  : "bg-gray-800 text-gray-500"
              }`}
            >
              {toggle2 ? "ON" : "OFF"}
            </span>
          </button>

          <div className="h-3 w-px bg-white/20" />

          {/* Switch 3 */}
          <button
            onClick={() => setToggle3(!toggle3)}
            className="flex items-center gap-1.5 text-xs font-mono transition cursor-pointer"
          >
            <span className="text-gray-400 text-[11px]">ADAPTIVE:</span>
            <span
              className={`px-2 py-0.5 rounded text-[10px] font-bold tracking-wider transition ${
                toggle3
                  ? "bg-gradient-to-r from-[#00B4D8] to-cyan-500 text-black shadow-[0_0_8px_rgba(0,180,216,0.6)]"
                  : "bg-gray-800 text-gray-500"
              }`}
            >
              {toggle3 ? "ON" : "OFF"}
            </span>
          </button>
        </div>
      </div>

      {/* Interactive Conversation Console */}
      <div className="flex-1 min-h-[160px] max-h-[260px] overflow-y-auto rounded-xl bg-black/60 border border-white/10 p-3 space-y-2.5 font-sans text-xs sm:text-sm">
        {chatLog.map((msg, i) => (
          <div
            key={i}
            className={`flex flex-col gap-1 p-2.5 rounded-xl border ${
              msg.role === "assistant"
                ? "bg-[#FFD700]/5 border-[#FFD700]/25 text-gray-100"
                : "bg-[#00B4D8]/10 border-[#00B4D8]/30 text-white self-end max-w-[85%]"
            }`}
          >
            <div className="flex items-center justify-between text-[10px] font-mono text-gray-400 pb-1 border-b border-white/5">
              <span className="flex items-center gap-1 text-[#FFD700]">
                {msg.role === "assistant" ? (
                  <>
                    <Brain className="w-3 h-3 text-[#FFD700]" />
                    <span>RADIANT QUEEN • PASIYA AI</span>
                  </>
                ) : (
                  <span>YOU</span>
                )}
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => handleCopy(msg.content, i)}
                  className="hover:text-white p-0.5 transition cursor-pointer"
                  title="Copy response"
                >
                  {copiedIndex === i ? (
                    <Check className="w-3 h-3 text-green-400" />
                  ) : (
                    <Copy className="w-3 h-3" />
                  )}
                </button>
                {msg.role === "assistant" && (
                  <button
                    onClick={() => handleSpeak(msg.content)}
                    className="hover:text-amber-300 p-0.5 transition cursor-pointer"
                    title="Audio Readout"
                  >
                    {isSpeaking ? (
                      <VolumeX className="w-3 h-3 text-amber-400 animate-pulse" />
                    ) : (
                      <Volume2 className="w-3 h-3" />
                    )}
                  </button>
                )}
              </div>
            </div>

            <div className="whitespace-pre-wrap leading-relaxed">
              {msg.content}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex items-center gap-2 p-2 rounded-lg bg-[#FFD700]/10 border border-[#FFD700]/30 text-[#FFD700] text-xs font-mono">
            <Sparkles className="w-3.5 h-3.5 animate-spin" />
            <span>Quantum Synapse is processing your query...</span>
          </div>
        )}
      </div>

      {/* Input Prompt Field */}
      <form onSubmit={handleSendPrompt} className="relative flex items-center gap-2">
        <input
          type="text"
          value={inputPrompt}
          onChange={(e) => setInputPrompt(e.target.value)}
          placeholder="Ask Quantum Brain (Sinhala or English)... e.g., 'Hello Pasiya AI' or 'Generate code'"
          className="flex-1 bg-black/80 border border-[#FFD700]/40 rounded-xl px-3 py-2 text-xs sm:text-sm text-gray-100 placeholder:text-gray-500 focus:outline-none focus:border-[#FFD700] focus:shadow-[0_0_15px_rgba(255,215,0,0.3)] transition"
        />

        <button
          type="submit"
          disabled={isLoading || !inputPrompt.trim()}
          className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#FFD700] to-[#E6B800] text-black font-bold text-xs flex items-center gap-1.5 hover:brightness-110 active:scale-95 disabled:opacity-50 transition cursor-pointer shadow-[0_0_10px_rgba(255,215,0,0.4)]"
        >
          <span>SEND</span>
          <Send className="w-3.5 h-3.5" />
        </button>
      </form>
    </div>
  );
};
