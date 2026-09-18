import React from "react";
import {
  Send,
  Pause,
  Play,
  Sparkles,
  Crown,
  ShieldCheck,
  ExternalLink,
  Cpu,
  Archive,
  Download
} from "lucide-react";
import { PASIYA_MAIN_SITE } from "../data/socialLinks";

interface TopBarProps {
  isPaused: boolean;
  onTogglePause: () => void;
  onOpenUpgrade: () => void;
  onOpenNexus: () => void;
  onOpenAdmin: () => void;
  onOpenTools: () => void;
  onOpenZipExport: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  isPaused,
  onTogglePause,
  onOpenUpgrade,
  onOpenNexus,
  onOpenAdmin,
  onOpenTools,
  onOpenZipExport,
}) => {
  return (
    <header className="relative z-20 w-full bg-[#07080D]/95 border-b border-[#FFD700]/30 backdrop-blur-md px-3 sm:px-5 py-2.5 flex flex-wrap items-center justify-between gap-3 shadow-[0_4px_25px_rgba(255,215,0,0.12)]">
      {/* Left: Brand Identity & Status */}
      <div className="flex items-center gap-3">
        {/* Telegram icon link */}
        <button
          onClick={onOpenNexus}
          title="Open Telegram & Social Nexus"
          className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#00B4D8]/15 border border-[#00B4D8]/40 hover:bg-[#00B4D8]/30 text-[#00B4D8] text-xs font-mono transition cursor-pointer"
        >
          <Send className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Telegram</span>
        </button>

        <div className="h-4 w-px bg-white/15 hidden sm:block" />

        {/* Title */}
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-[#FFD700] animate-ping" />
          <h1 className="text-sm sm:text-base font-extrabold tracking-wider font-['Orbitron'] flex items-center gap-1.5">
            <span className="text-gold-gradient drop-shadow-[0_0_8px_rgba(255,215,0,0.6)]">
              RADIANT QUEEN
            </span>
            <span className="text-gray-400 font-light">•</span>
            <span className="text-[#00B4D8] font-bold text-xs sm:text-sm tracking-wide">
              SUPER BOT
            </span>
          </h1>
        </div>

        {/* Online Badge */}
        <div className="hidden md:flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-emerald-950/60 border border-emerald-500/40 text-emerald-400 text-[11px] font-mono">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span>{isPaused ? "PAUSED" : "ONLINE"}</span>
          <span className="text-white/40">|</span>
          <span className="text-amber-300 flex items-center gap-1">
            <Cpu className="w-3 h-3 text-[#FFD700]" />
            AI STUDIO BRAIN: AUTO-CONNECTED
          </span>
        </div>

        {/* Uptime */}
        <div className="hidden xl:flex items-center gap-1 text-[11px] font-mono text-gray-400">
          <span className="text-gray-500">Uptime:</span>
          <span className="text-amber-200">14d 03:12:27</span>
        </div>
      </div>

      {/* Center/Hero: MANDATORY StrideClub Main Site Glowing Button */}
      <div className="flex items-center order-last lg:order-none w-full lg:w-auto justify-center">
        <a
          href={PASIYA_MAIN_SITE}
          target="_blank"
          rel="noopener noreferrer"
          className="pulse-gold group relative inline-flex items-center gap-2.5 px-4 sm:px-6 py-2 rounded-xl bg-gradient-to-r from-[#FFD700] via-[#FACC15] to-[#FFAA00] text-black font-extrabold text-xs sm:text-sm uppercase tracking-wider transition-all duration-300 hover:brightness-110 shadow-[0_0_25px_rgba(255,215,0,0.65)]"
        >
          <span className="text-base animate-bounce">🚀</span>
          <span>OPEN MY MAIN SITE - StrideClub</span>
          <ExternalLink className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
        </a>
      </div>

      {/* Right: Quick Action Controls */}
      <div className="flex items-center gap-2">
        {/* Pause / Resume button */}
        <button
          onClick={onTogglePause}
          className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-mono transition cursor-pointer border ${
            isPaused
              ? "bg-amber-500/20 text-amber-300 border-amber-400/50 hover:bg-amber-500/30"
              : "bg-white/5 text-gray-300 border-white/10 hover:bg-white/10"
          }`}
          title={isPaused ? "Resume Super Bot" : "Pause Super Bot Core"}
        >
          {isPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
          <span>{isPaused ? "RESUME" : "PAUSE"}</span>
        </button>

        {/* Upgrade button */}
        <button
          onClick={onOpenUpgrade}
          className="flex items-center gap-1 px-2.5 py-1 rounded text-xs font-mono bg-[#FFD700]/10 border border-[#FFD700]/40 text-[#FFD700] hover:bg-[#FFD700]/25 transition cursor-pointer"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>UPGRADE</span>
        </button>

        {/* Premium badge button */}
        <button
          onClick={onOpenUpgrade}
          className="flex items-center gap-1 px-2.5 py-1 rounded text-xs font-mono font-bold bg-gradient-to-r from-amber-500 to-yellow-600 text-black hover:brightness-110 transition shadow-[0_0_10px_rgba(255,215,0,0.4)] cursor-pointer"
        >
          <Crown className="w-3.5 h-3.5" />
          <span>PREMIUM</span>
        </button>

        {/* Download ZIP Package button */}
        <button
          onClick={onOpenZipExport}
          className="flex items-center gap-1 px-2.5 py-1 rounded text-xs font-mono font-bold bg-emerald-500/20 border border-emerald-400/60 text-emerald-300 hover:bg-emerald-500/30 transition shadow-[0_0_10px_rgba(16,185,129,0.3)] cursor-pointer"
          title="Download Project ZIP File (සිප් එක බාගන්න)"
        >
          <Archive className="w-3.5 h-3.5 text-emerald-400" />
          <span>ZIP</span>
          <Download className="w-3 h-3 text-emerald-300" />
        </button>

        {/* 20 Tools Quick Launch */}
        <button
          onClick={onOpenTools}
          className="hidden sm:flex items-center gap-1 px-2.5 py-1 rounded text-xs font-mono bg-cyan-950/60 border border-cyan-500/50 text-[#00B4D8] hover:bg-cyan-900/40 transition cursor-pointer"
        >
          <span>20 TOOLS</span>
        </button>

        {/* Admin Command Panel */}
        <button
          onClick={onOpenAdmin}
          title="Queen Command Panel"
          className="p-1.5 rounded text-amber-400 hover:text-amber-300 hover:bg-[#FFD700]/10 border border-[#FFD700]/20 transition cursor-pointer"
        >
          <ShieldCheck className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
