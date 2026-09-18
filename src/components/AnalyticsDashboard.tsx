import React, { useState, useEffect } from "react";
import {
  TrendingUp,
  Activity,
  Zap,
  Cpu,
  Layers,
  CheckCircle2,
  ExternalLink,
  Flame,
  Globe2
} from "lucide-react";
import { PASIYA_MAIN_SITE, PASIYA_PORTAL, PASIYA_GITHUB } from "../data/socialLinks";

export const AnalyticsDashboard: React.FC = () => {
  const [pulseTick, setPulseTick] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setPulseTick((prev) => (prev + 1) % 100);
    }, 2000);
    return () => clearInterval(timer);
  }, []);

  // Golden smooth spline data points
  const points = [25, 42, 38, 65, 52, 78, 70, 92, 85, 105, 98, 120];
  const maxVal = 130;
  const height = 110;
  const width = 280;

  // Generate SVG path for golden line graph
  const pathD = points.reduce((acc, val, idx) => {
    const x = (idx / (points.length - 1)) * width;
    const y = height - (val / maxVal) * height + 10;
    return idx === 0 ? `M ${x} ${y}` : `${acc} L ${x} ${y}`;
  }, "");

  // Area under curve
  const areaD = `${pathD} L ${width} ${height + 20} L 0 ${height + 20} Z`;

  return (
    <div className="w-full lg:w-80 shrink-0 bg-[#08090E]/90 border border-[#FFD700]/30 rounded-2xl p-3 sm:p-4 flex flex-col gap-3.5 shadow-[0_0_20px_rgba(255,215,0,0.08)] backdrop-blur-md">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 pb-2">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-[#FFD700] animate-pulse" />
          <h3 className="text-xs sm:text-sm font-extrabold tracking-wider font-['Orbitron'] text-gold-gradient">
            ANALYTICS DASHBOARD
          </h3>
        </div>
        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
          REALTIME
        </span>
      </div>

      {/* 4 Core Metrics required by prompt */}
      <div className="grid grid-cols-2 gap-2 text-xs font-mono">
        {/* Requests */}
        <div className="p-2.5 rounded-xl bg-black/60 border border-[#FFD700]/25 flex flex-col gap-0.5 relative overflow-hidden group">
          <div className="flex items-center justify-between text-[10px] text-gray-400">
            <span>REQUESTS</span>
            <span className="text-emerald-400 flex items-center font-bold">
              <TrendingUp className="w-3 h-3 inline mr-0.5" />
              +22%
            </span>
          </div>
          <span className="text-base sm:text-lg font-extrabold text-[#FFD700] font-['Orbitron']">
            12,847
          </span>
          <span className="text-[9px] text-gray-500">24h Neural Volume</span>
        </div>

        {/* Success Rate */}
        <div className="p-2.5 rounded-xl bg-black/60 border border-emerald-500/30 flex flex-col gap-0.5 relative overflow-hidden group">
          <div className="flex items-center justify-between text-[10px] text-gray-400">
            <span>SUCCESS RATE</span>
            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
          </div>
          <span className="text-base sm:text-lg font-extrabold text-emerald-300 font-['Orbitron']">
            98.6%
          </span>
          <span className="text-[9px] text-gray-500">Zero Critical Faults</span>
        </div>

        {/* Avg Latency */}
        <div className="p-2.5 rounded-xl bg-black/60 border border-[#00B4D8]/30 flex flex-col gap-0.5 relative overflow-hidden group">
          <div className="flex items-center justify-between text-[10px] text-gray-400">
            <span>AVG LATENCY</span>
            <Zap className="w-3 h-3 text-[#00B4D8]" />
          </div>
          <span className="text-base sm:text-lg font-extrabold text-[#00B4D8] font-['Orbitron']">
            132ms
          </span>
          <span className="text-[9px] text-gray-500">Ultra Fast Edge</span>
        </div>

        {/* Tokens Processed */}
        <div className="p-2.5 rounded-xl bg-black/60 border border-amber-500/30 flex flex-col gap-0.5 relative overflow-hidden group">
          <div className="flex items-center justify-between text-[10px] text-gray-400">
            <span>TOKENS</span>
            <Flame className="w-3 h-3 text-amber-400" />
          </div>
          <span className="text-base sm:text-lg font-extrabold text-amber-300 font-['Orbitron']">
            4.2M
          </span>
          <span className="text-[9px] text-gray-500">Quantum Pipeline</span>
        </div>
      </div>

      {/* Live Golden Graph with gradient area */}
      <div className="rounded-xl bg-black/70 border border-[#FFD700]/25 p-2.5 flex flex-col gap-1.5">
        <div className="flex items-center justify-between text-[10px] font-mono text-gray-400">
          <span className="text-[#FFD700]">THROUGHPUT TREND (24H)</span>
          <span className="text-white/60">PEAK 142k tps</span>
        </div>

        <div className="w-full overflow-hidden flex items-center justify-center">
          <svg viewBox={`0 0 ${width} ${height + 15}`} className="w-full h-24 overflow-visible">
            <defs>
              <linearGradient id="goldGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#FFD700" stopOpacity="0.45" />
                <stop offset="100%" stopColor="#FFD700" stopOpacity="0.0" />
              </linearGradient>
            </defs>
            {/* Grid lines */}
            <line x1="0" y1="30" x2={width} y2="30" stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
            <line x1="0" y1="70" x2={width} y2="70" stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />

            {/* Area */}
            <path d={areaD} fill="url(#goldGradient)" />

            {/* Line */}
            <path
              d={pathD}
              fill="none"
              stroke="#FFD700"
              strokeWidth="2.5"
              strokeLinecap="round"
              className="drop-shadow-[0_0_8px_rgba(255,215,0,0.8)]"
            />

            {/* Pulsing point on latest */}
            <circle
              cx={width}
              cy={height - (points[points.length - 1] / maxVal) * height + 10}
              r="4"
              fill="#FFF"
              stroke="#FFD700"
              strokeWidth="2"
              className="animate-ping"
            />
            <circle
              cx={width}
              cy={height - (points[points.length - 1] / maxVal) * height + 10}
              r="4"
              fill="#FFD700"
            />
          </svg>
        </div>
      </div>

      {/* Web Architecture Quick Cards */}
      <div className="space-y-1.5 pt-1 border-t border-white/10">
        <span className="text-[10px] font-mono text-gray-400 uppercase tracking-wider block">
          WEB ARCHITECTURE & PORTALS
        </span>

        {/* StrideClub */}
        <a
          href={PASIYA_MAIN_SITE}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-between p-2 rounded-xl bg-gradient-to-r from-amber-500/15 via-yellow-500/10 to-transparent border border-[#FFD700]/40 hover:border-[#FFD700] transition group"
        >
          <div className="flex items-center gap-2">
            <span className="text-sm">🚀</span>
            <div>
              <span className="text-xs font-bold text-amber-200 group-hover:text-amber-100">
                StrideClub Main Platform
              </span>
              <span className="text-[10px] text-gray-500 block">snapdeploy.app</span>
            </div>
          </div>
          <ExternalLink className="w-3.5 h-3.5 text-[#FFD700] group-hover:translate-x-0.5 transition" />
        </a>

        {/* GitHub bhook- */}
        <a
          href={PASIYA_GITHUB}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-between p-2 rounded-xl bg-white/5 border border-white/10 hover:border-white/30 transition group"
        >
          <div className="flex items-center gap-2">
            <span className="text-sm">🐙</span>
            <div>
              <span className="text-xs font-bold text-gray-200 group-hover:text-white">
                bhook- Core Repository
              </span>
              <span className="text-[10px] text-gray-500 block">github.com/pasindudananjaya92-bot</span>
            </div>
          </div>
          <ExternalLink className="w-3.5 h-3.5 text-gray-400 group-hover:text-white transition" />
        </a>

        {/* Pasiya AI Apps */}
        <a
          href={PASIYA_PORTAL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-between p-2 rounded-xl bg-cyan-950/40 border border-cyan-500/30 hover:border-cyan-400 transition group"
        >
          <div className="flex items-center gap-2">
            <Globe2 className="w-4 h-4 text-[#00B4D8]" />
            <div>
              <span className="text-xs font-bold text-cyan-200 group-hover:text-cyan-100">
                Pasiya AI Portal (Vercel)
              </span>
              <span className="text-[10px] text-gray-500 block">pasiyamax.vercel.app</span>
            </div>
          </div>
          <ExternalLink className="w-3.5 h-3.5 text-[#00B4D8] group-hover:translate-x-0.5 transition" />
        </a>
      </div>
    </div>
  );
};
