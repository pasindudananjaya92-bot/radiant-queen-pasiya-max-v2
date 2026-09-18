import React, { useState } from "react";
import {
  X,
  ShieldCheck,
  Lock,
  Unlock,
  Radio,
  Smile,
  ShieldAlert,
  Image as ImageIcon,
  Send,
  Users,
  Brain,
  Palette,
  CheckCircle2,
  Sparkles,
  AlertTriangle,
  Play,
  Square
} from "lucide-react";
import { ThemeMode } from "../types";

interface AdminCommandPanelProps {
  isOpen: boolean;
  onClose: () => void;
  currentTheme: ThemeMode;
  onSelectTheme: (theme: ThemeMode) => void;
}

export const AdminCommandPanel: React.FC<AdminCommandPanelProps> = ({
  isOpen,
  onClose,
  currentTheme,
  onSelectTheme,
}) => {
  const [isAdminUnlocked, setIsAdminUnlocked] = useState(true);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState(false);

  // TagAll Pro State
  const [tagAllRunning, setTagAllRunning] = useState(false);
  const [tagAllCount, setTagAllCount] = useState(0);

  // Auto React State
  const [autoReactEmoji, setAutoReactEmoji] = useState("👑");
  const [autoReactActive, setAutoReactActive] = useState(true);

  // Anti-Link / Anti-Spam
  const [antiLink, setAntiLink] = useState(true);
  const [antiSpam, setAntiSpam] = useState(true);

  // Welcome / Goodbye image
  const [welcomeBanner, setWelcomeBanner] = useState(true);

  // Broadcast Message
  const [broadcastMsg, setBroadcastMsg] = useState("");
  const [broadcastSent, setBroadcastSent] = useState(false);

  // AI Brain Model selection
  const [selectedModel, setSelectedModel] = useState("gemini-3.8-flash");

  if (!isOpen) return null;

  const handleUnlock = (e: React.FormEvent) => {
    e.preventDefault();
    if (pinInput === "7777" || pinInput === "admin" || pinInput === "") {
      setIsAdminUnlocked(true);
      setPinError(false);
    } else {
      setPinError(true);
    }
  };

  const handleToggleTagAll = () => {
    if (tagAllRunning) {
      setTagAllRunning(false);
    } else {
      setTagAllRunning(true);
      setTagAllCount(0);
      const interval = setInterval(() => {
        setTagAllCount((prev) => {
          if (prev >= 42) {
            clearInterval(interval);
            setTagAllRunning(false);
            return 42;
          }
          return prev + 3;
        });
      }, 400);
    }
  };

  const handleBroadcast = (e: React.FormEvent) => {
    e.preventDefault();
    if (!broadcastMsg.trim()) return;
    setBroadcastSent(true);
    setTimeout(() => {
      setBroadcastSent(false);
      setBroadcastMsg("");
    }, 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-lg animate-in fade-in duration-200">
      <div className="relative w-full max-w-3xl max-h-[90vh] bg-[#090A11] border-2 border-[#FFD700]/50 rounded-3xl p-4 sm:p-6 flex flex-col gap-4 shadow-[0_0_50px_rgba(255,215,0,0.25)] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-500/15 border border-amber-500/30 text-[#FFD700]">
              <ShieldCheck className="w-6 h-6 drop-shadow-[0_0_8px_rgba(255,215,0,0.8)]" />
            </div>
            <div>
              <h3 className="text-base sm:text-xl font-extrabold font-['Orbitron'] text-gold-gradient flex items-center gap-2">
                QUEEN COMMAND PANEL (ADMIN ONLY)
              </h3>
              <p className="text-xs text-gray-400 font-mono">
                System Administration, Group Management & Bot Tuning
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-gray-400 hover:text-white transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* PIN Screen if locked */}
        {!isAdminUnlocked ? (
          <div className="p-8 text-center flex flex-col items-center justify-center gap-4">
            <div className="w-16 h-16 rounded-full bg-red-500/20 border border-red-500/40 flex items-center justify-center text-red-400">
              <Lock className="w-8 h-8" />
            </div>
            <div>
              <h4 className="text-base font-bold text-gray-100">
                Security Passcode Required
              </h4>
              <p className="text-xs text-gray-400 font-mono mt-1">
                Enter Admin PIN (Default: 7777 or leave blank)
              </p>
            </div>
            <form onSubmit={handleUnlock} className="flex gap-2 w-full max-w-xs">
              <input
                type="password"
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
                placeholder="PIN"
                className="flex-1 bg-black/70 border border-white/20 rounded-xl px-3 py-2 text-center text-sm text-white focus:border-[#FFD700] focus:outline-none font-mono"
              />
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-[#FFD700] text-black font-bold text-xs hover:brightness-110 cursor-pointer"
              >
                UNLOCK
              </button>
            </form>
            {pinError && (
              <span className="text-xs text-red-400">Invalid Admin PIN</span>
            )}
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto pr-1 space-y-4 font-sans text-xs sm:text-sm">
            {/* Theme Switcher */}
            <div className="p-3.5 rounded-2xl bg-black/60 border border-[#FFD700]/30 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold font-['Orbitron'] text-[#FFD700] flex items-center gap-1.5">
                  <Palette className="w-4 h-4" />
                  THEME MATRIX SWITCHER
                </span>
                <span className="text-[10px] font-mono text-gray-400 uppercase">
                  ACTIVE: {currentTheme}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { id: "gold", name: "Gold-Black Luxury", color: "from-amber-400 to-yellow-600" },
                  { id: "cyan-pink", name: "Cyan-Pink Cyber", color: "from-cyan-400 to-pink-500" },
                  { id: "matrix", name: "Matrix Green", color: "from-emerald-400 to-green-700" },
                  { id: "rainbow", name: "Rainbow Hyper", color: "from-indigo-400 via-pink-500 to-amber-400" },
                ].map((th) => (
                  <button
                    key={th.id}
                    onClick={() => onSelectTheme(th.id as ThemeMode)}
                    className={`p-2.5 rounded-xl border text-left flex flex-col gap-1 transition cursor-pointer ${
                      currentTheme === th.id
                        ? "bg-[#FFD700]/15 border-[#FFD700] shadow-[0_0_12px_rgba(255,215,0,0.4)]"
                        : "bg-white/5 border-white/10 hover:border-white/25"
                    }`}
                  >
                    <div
                      className={`w-full h-3 rounded-full bg-gradient-to-r ${th.color}`}
                    />
                    <span className="text-xs font-bold text-gray-200 mt-1">
                      {th.name}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* TagAll Pro & Auto React Controls */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* TagAll Pro */}
              <div className="p-3.5 rounded-2xl bg-black/60 border border-white/10 flex flex-col justify-between gap-2.5">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold font-['Orbitron'] text-amber-300 flex items-center gap-1.5">
                      <Radio className="w-4 h-4 text-[#FFD700]" />
                      TAGALL PRO
                    </span>
                    <span
                      className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${
                        tagAllRunning
                          ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 animate-pulse"
                          : "bg-gray-800 text-gray-400"
                      }`}
                    >
                      {tagAllRunning ? "RUNNING" : "STOPPED"}
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-400 mt-1">
                    Broadcast mention all group members with quantum queue bypass.
                  </p>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-white/10">
                  <span className="text-xs font-mono text-gray-300">
                    Tagged: <strong className="text-amber-300">{tagAllCount}</strong> / 42
                  </span>
                  <button
                    onClick={handleToggleTagAll}
                    className={`px-3 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1.5 transition cursor-pointer ${
                      tagAllRunning
                        ? "bg-red-500 text-white hover:bg-red-600"
                        : "bg-gradient-to-r from-[#FFD700] to-yellow-500 text-black hover:brightness-110"
                    }`}
                  >
                    {tagAllRunning ? (
                      <>
                        <Square className="w-3.5 h-3.5" />
                        <span>STOP</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-3.5 h-3.5" />
                        <span>TAG ALL</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Auto React */}
              <div className="p-3.5 rounded-2xl bg-black/60 border border-white/10 flex flex-col justify-between gap-2.5">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold font-['Orbitron'] text-[#00B4D8] flex items-center gap-1.5">
                      <Smile className="w-4 h-4 text-[#00B4D8]" />
                      AUTO REACT
                    </span>
                    <button
                      onClick={() => setAutoReactActive(!autoReactActive)}
                      className={`text-[10px] font-mono px-2 py-0.5 rounded-full cursor-pointer ${
                        autoReactActive
                          ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                          : "bg-gray-800 text-gray-400"
                      }`}
                    >
                      {autoReactActive ? "ACTIVE" : "OFF"}
                    </button>
                  </div>
                  <p className="text-[11px] text-gray-400 mt-1">
                    Auto react to new messages with chosen emoji.
                  </p>
                </div>

                <div className="flex items-center gap-2 pt-2 border-t border-white/10">
                  {["👑", "⚡", "🔥", "❤️", "💎"].map((em) => (
                    <button
                      key={em}
                      onClick={() => setAutoReactEmoji(em)}
                      className={`w-8 h-8 rounded-xl flex items-center justify-center text-sm border transition cursor-pointer ${
                        autoReactEmoji === em
                          ? "bg-[#FFD700]/25 border-[#FFD700] shadow-[0_0_8px_rgba(255,215,0,0.5)]"
                          : "bg-white/5 border-white/10 hover:bg-white/10"
                      }`}
                    >
                      {em}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Anti-Link, Anti-Spam, Welcome Banner */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-3 rounded-xl bg-black/60 border border-white/10 flex items-center justify-between">
                <div>
                  <span className="font-bold text-xs text-gray-200 block">Anti-Link</span>
                  <span className="text-[10px] text-gray-400">Block invite links</span>
                </div>
                <button
                  onClick={() => setAntiLink(!antiLink)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold font-mono transition cursor-pointer ${
                    antiLink ? "bg-emerald-500 text-black" : "bg-gray-800 text-gray-400"
                  }`}
                >
                  {antiLink ? "ON" : "OFF"}
                </button>
              </div>

              <div className="p-3 rounded-xl bg-black/60 border border-white/10 flex items-center justify-between">
                <div>
                  <span className="font-bold text-xs text-gray-200 block">Anti-Spam</span>
                  <span className="text-[10px] text-gray-400">Flood shield</span>
                </div>
                <button
                  onClick={() => setAntiSpam(!antiSpam)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold font-mono transition cursor-pointer ${
                    antiSpam ? "bg-emerald-500 text-black" : "bg-gray-800 text-gray-400"
                  }`}
                >
                  {antiSpam ? "ON" : "OFF"}
                </button>
              </div>

              <div className="p-3 rounded-xl bg-black/60 border border-white/10 flex items-center justify-between">
                <div>
                  <span className="font-bold text-xs text-gray-200 block">Welcome Card</span>
                  <span className="text-[10px] text-gray-400">Image banner</span>
                </div>
                <button
                  onClick={() => setWelcomeBanner(!welcomeBanner)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold font-mono transition cursor-pointer ${
                    welcomeBanner ? "bg-emerald-500 text-black" : "bg-gray-800 text-gray-400"
                  }`}
                >
                  {welcomeBanner ? "ON" : "OFF"}
                </button>
              </div>
            </div>

            {/* Broadcast to All Groups */}
            <form
              onSubmit={handleBroadcast}
              className="p-3.5 rounded-2xl bg-black/60 border border-white/10 space-y-2"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold font-['Orbitron'] text-amber-300 flex items-center gap-1.5">
                  <Send className="w-4 h-4" />
                  BROADCAST TO ALL GROUPS
                </span>
                <span className="text-[10px] font-mono text-gray-400">
                  Target: 14 Connected Groups
                </span>
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={broadcastMsg}
                  onChange={(e) => setBroadcastMsg(e.target.value)}
                  placeholder="Enter broadcast announcement... (e.g. New Update v2.9.4 Live)"
                  className="flex-1 bg-black/80 border border-white/15 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#FFD700]"
                />
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-[#FFD700] text-black font-bold text-xs hover:brightness-110 cursor-pointer"
                >
                  BROADCAST
                </button>
              </div>

              {broadcastSent && (
                <div className="p-2 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-mono flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Broadcast transmitted to 14 groups and 12,840 members!</span>
                </div>
              )}
            </form>

            {/* AI Brain Model Switcher */}
            <div className="p-3.5 rounded-2xl bg-black/60 border border-white/10 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Brain className="w-4 h-4 text-[#FFD700]" />
                <div>
                  <span className="text-xs font-bold text-gray-200 block font-['Orbitron']">
                    AI BRAIN MODEL SETTING
                  </span>
                  <span className="text-[10px] text-gray-400 font-mono">
                    High-speed Quantum LLM Core
                  </span>
                </div>
              </div>

              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="bg-black border border-white/20 rounded-xl px-3 py-1.5 text-xs text-amber-200 font-mono focus:border-[#FFD700] focus:outline-none cursor-pointer"
              >
                <option value="gemini-3.8-flash">gemini-3.8-flash (Ultra Fast Flash Core)</option>
                <option value="radiant-omega">RADIANT-Ω Quantum LLM (Proprietary)</option>
              </select>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
