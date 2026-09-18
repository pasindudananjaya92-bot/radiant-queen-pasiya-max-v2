import React, { useState, useEffect } from "react";
import {
  Download,
  HardDrive,
  FolderTree,
  RefreshCw,
  ShieldCheck,
  Cpu,
  Zap,
  Globe,
  Lock,
  Pause,
  Play,
  FileText,
  Archive,
  Database
} from "lucide-react";
import { DownloadItem } from "../types";

interface BottomSystemDeckProps {
  onOpenFileExplore: () => void;
  onOpenConverter: () => void;
  onOpenZipExport?: () => void;
}

export const BottomSystemDeck: React.FC<BottomSystemDeckProps> = ({
  onOpenFileExplore,
  onOpenConverter,
  onOpenZipExport,
}) => {
  // Download Queue with exactly the 3 items requested by user
  const [downloads, setDownloads] = useState<DownloadItem[]>([
    {
      id: "dl-1",
      name: "project_blueprint.pdf",
      progress: 82,
      speed: "14.2 MB/s",
      size: "24.8 MB",
      status: "downloading",
    },
    {
      id: "dl-2",
      name: "dataest_train_v9.zip",
      progress: 45,
      speed: "48.6 MB/s",
      size: "4.8 GB",
      status: "downloading",
    },
    {
      id: "dl-3",
      name: "model_weights.ckpt",
      progress: 12,
      speed: "72.1 MB/s",
      size: "18.2 GB",
      status: "downloading",
    },
  ]);

  // Dynamic system telemetry
  const [sysStats, setSysStats] = useState({
    cpu: "38%",
    ram: "16.2/32GB",
    gpu: "22%",
    latency: "21ms",
  });

  useEffect(() => {
    const timer = setInterval(() => {
      // Simulate subtle hardware load fluctuation
      const cpuVal = 36 + Math.floor(Math.random() * 5);
      const ramVal = (16.1 + Math.random() * 0.2).toFixed(1);
      const gpuVal = 20 + Math.floor(Math.random() * 5);
      const latVal = 19 + Math.floor(Math.random() * 4);

      setSysStats({
        cpu: `${cpuVal}%`,
        ram: `${ramVal}/32GB`,
        gpu: `${gpuVal}%`,
        latency: `${latVal}ms`,
      });

      // Advance download bars slightly
      setDownloads((prev) =>
        prev.map((item) => {
          if (item.progress < 100) {
            return {
              ...item,
              progress: Math.min(100, item.progress + 1),
            };
          }
          return item;
        })
      );
    }, 3000);

    return () => clearInterval(timer);
  }, []);

  const toggleDownloadState = (id: string) => {
    setDownloads((prev) =>
      prev.map((item) =>
        item.id === id
          ? {
              ...item,
              status: item.status === "downloading" ? "paused" : "downloading",
            }
          : item
      )
    );
  };

  return (
    <section className="w-full mt-3 space-y-3">
      {/* Primary Deck: Download Queue + Cloud Ring + File Manager + Converter + Bulletproof Robot */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
        {/* 1. Download Queue (3 ACTIVE) */}
        <div className="xl:col-span-2 rounded-2xl bg-[#08090E]/90 border border-[#FFD700]/30 p-3.5 flex flex-col gap-2.5 shadow-[0_0_15px_rgba(255,215,0,0.07)] backdrop-blur-md">
          <div className="flex items-center justify-between border-b border-white/10 pb-2">
            <div className="flex items-center gap-2">
              <Download className="w-4 h-4 text-[#FFD700]" />
              <h4 className="text-xs font-extrabold tracking-wider font-['Orbitron'] text-gold-gradient">
                DOWNLOAD QUEUE
              </h4>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
              3 ACTIVE
            </span>
          </div>

          <div className="space-y-2">
            {downloads.map((dl) => (
              <div
                key={dl.id}
                className="p-2 rounded-xl bg-black/60 border border-white/10 flex flex-col gap-1 text-xs"
              >
                <div className="flex items-center justify-between font-mono">
                  <div className="flex items-center gap-1.5 truncate max-w-[180px] sm:max-w-none">
                    {dl.name.endsWith(".pdf") && <FileText className="w-3.5 h-3.5 text-red-400" />}
                    {dl.name.endsWith(".zip") && <Archive className="w-3.5 h-3.5 text-amber-400" />}
                    {dl.name.endsWith(".ckpt") && <Database className="w-3.5 h-3.5 text-cyan-400" />}
                    <span className="text-gray-200 truncate">{dl.name}</span>
                  </div>
                  <div className="flex items-center gap-2 text-[11px]">
                    <span className="text-amber-300 font-bold">{dl.progress}%</span>
                    <button
                      onClick={() => toggleDownloadState(dl.id)}
                      className="text-gray-400 hover:text-white p-0.5 transition cursor-pointer"
                    >
                      {dl.status === "downloading" ? (
                        <Pause className="w-3 h-3" />
                      ) : (
                        <Play className="w-3 h-3 text-emerald-400" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-[#FFD700] via-[#FACC15] to-[#00B4D8] transition-all duration-500 rounded-full"
                    style={{ width: `${dl.progress}%` }}
                  />
                </div>

                <div className="flex items-center justify-between text-[10px] font-mono text-gray-500">
                  <span>{dl.size}</span>
                  <span className="text-cyan-400">{dl.speed}</span>
                </div>
              </div>
            ))}

            {/* Download Project Source ZIP Button */}
            {onOpenZipExport && (
              <button
                onClick={onOpenZipExport}
                className="w-full mt-1.5 py-2 px-3 rounded-xl bg-gradient-to-r from-emerald-500/20 via-emerald-500/30 to-teal-500/20 hover:from-emerald-500/30 hover:to-teal-500/30 border border-emerald-400/50 text-emerald-300 text-xs font-mono font-bold flex items-center justify-center gap-2 transition shadow-[0_0_15px_rgba(16,185,129,0.2)] cursor-pointer"
              >
                <Archive className="w-3.5 h-3.5 text-emerald-400" />
                <span>DOWNLOAD FULL PROJECT (.ZIP බාගන්න)</span>
                <Download className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* 2. Cloud Storage 24.8% Ring */}
        <div className="rounded-2xl bg-[#08090E]/90 border border-cyan-500/30 p-3.5 flex flex-col items-center justify-between text-center shadow-[0_0_15px_rgba(0,180,216,0.08)] backdrop-blur-md">
          <div className="w-full flex items-center justify-between border-b border-white/10 pb-2">
            <span className="text-xs font-bold font-['Orbitron'] text-cyan-400 flex items-center gap-1.5">
              <HardDrive className="w-3.5 h-3.5" />
              CLOUD STORAGE
            </span>
            <span className="text-[10px] font-mono text-gray-400">NVMe Array</span>
          </div>

          {/* Circular Progress Ring */}
          <div className="relative my-2 w-24 h-24 flex items-center justify-center">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
              <circle
                cx="50"
                cy="50"
                r="40"
                stroke="rgba(255,255,255,0.08)"
                strokeWidth="8"
                fill="none"
              />
              <circle
                cx="50"
                cy="50"
                r="40"
                stroke="#00B4D8"
                strokeWidth="8"
                strokeDasharray="251.2"
                strokeDashoffset={251.2 * (1 - 0.248)}
                strokeLinecap="round"
                fill="none"
                className="drop-shadow-[0_0_8px_rgba(0,180,216,0.8)]"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center font-mono">
              <span className="text-lg font-extrabold text-[#00B4D8]">24.8%</span>
              <span className="text-[9px] text-gray-400">USED</span>
            </div>
          </div>

          <div className="w-full pt-1 text-[11px] font-mono flex items-center justify-between text-gray-400 border-t border-white/10">
            <span>12.4 TB Used</span>
            <span className="text-amber-300 font-bold">50 TB Total</span>
          </div>
        </div>

        {/* 3. File Manager & Converter */}
        <div className="rounded-2xl bg-[#08090E]/90 border border-[#FFD700]/30 p-3.5 flex flex-col justify-between gap-2 shadow-[0_0_15px_rgba(255,215,0,0.08)] backdrop-blur-md">
          <div className="border-b border-white/10 pb-2 flex items-center justify-between">
            <span className="text-xs font-bold font-['Orbitron'] text-[#FFD700] flex items-center gap-1.5">
              <FolderTree className="w-3.5 h-3.5" />
              FILE MANAGER
            </span>
            <span className="text-[10px] font-mono text-emerald-400">SYNCED</span>
          </div>

          <div className="p-2 rounded-xl bg-black/60 border border-white/10 text-left font-mono">
            <span className="text-[10px] text-gray-500 block">PATH DIRECTORY:</span>
            <span className="text-xs text-amber-200 truncate block">
              /cloud/quantum/projects/
            </span>
          </div>

          <button
            onClick={onOpenFileExplore}
            className="w-full py-1.5 rounded-xl bg-white/5 border border-white/15 hover:border-[#FFD700]/60 text-xs font-mono text-gray-200 hover:text-[#FFD700] transition cursor-pointer"
          >
            BROWSE 50TB CLOUD
          </button>

          <div className="pt-2 border-t border-white/10 flex items-center justify-between">
            <span className="text-xs font-mono text-gray-300 flex items-center gap-1.5">
              <RefreshCw className="w-3.5 h-3.5 text-[#00B4D8]" />
              CONVERTER
            </span>
            <button
              onClick={onOpenConverter}
              className="px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 text-[10px] font-mono border border-cyan-500/30 hover:bg-cyan-500/30 transition cursor-pointer"
            >
              LAUNCH
            </button>
          </div>
        </div>

        {/* 4. Bulletproof Robot Build Armor Mk-VII */}
        <div className="rounded-2xl bg-[#08090E]/90 border border-amber-500/40 p-3.5 flex flex-col justify-between gap-2.5 shadow-[0_0_18px_rgba(255,215,0,0.12)] backdrop-blur-md">
          <div className="border-b border-white/10 pb-2 flex items-center justify-between">
            <span className="text-xs font-bold font-['Orbitron'] text-gold-gradient flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-[#FFD700]" />
              ROBOT BUILD
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              100%
            </span>
          </div>

          <div className="space-y-1 text-xs font-mono">
            <div className="flex justify-between text-gray-400 text-[11px]">
              <span>ARMOR:</span>
              <span className="text-amber-300 font-bold">Mk-VII BULLETPROOF</span>
            </div>
            <div className="flex justify-between text-gray-400 text-[11px]">
              <span>INTEGRITY:</span>
              <span className="text-emerald-400 font-bold">100% SECURE</span>
            </div>
            <div className="flex justify-between text-gray-400 text-[11px]">
              <span>SHIELDING:</span>
              <span className="text-cyan-300">QUANTUM PLATED</span>
            </div>
          </div>

          {/* Armor Bar */}
          <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden">
            <div className="w-full h-full bg-gradient-to-r from-[#FFD700] via-yellow-400 to-amber-500 shadow-[0_0_10px_rgba(255,215,0,0.8)]" />
          </div>

          <span className="text-[10px] font-mono text-center text-gray-500 block">
            DEFENSIVE MATRIX OVERDRIVE
          </span>
        </div>
      </div>

      {/* Footer System: CPU, RAM, GPU, Security Shield Active, Firewall ON, Threats 0, Node, Region, Latency */}
      <footer className="w-full rounded-2xl bg-[#06070B]/95 border border-[#FFD700]/25 px-3 sm:px-5 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs font-mono text-gray-300 shadow-[0_0_20px_rgba(0,0,0,0.8)] backdrop-blur-md">
        {/* Core Hardware metrics */}
        <div className="flex flex-wrap items-center gap-3 sm:gap-4">
          <div className="flex items-center gap-1.5">
            <Cpu className="w-3.5 h-3.5 text-[#FFD700]" />
            <span className="text-gray-500">CPU:</span>
            <span className="text-amber-200 font-bold">{sysStats.cpu}</span>
          </div>

          <div className="h-3 w-px bg-white/15" />

          <div className="flex items-center gap-1.5">
            <span className="text-gray-500">RAM:</span>
            <span className="text-cyan-200 font-bold">{sysStats.ram}</span>
          </div>

          <div className="h-3 w-px bg-white/15" />

          <div className="flex items-center gap-1.5">
            <span className="text-gray-500">GPU:</span>
            <span className="text-emerald-300 font-bold">{sysStats.gpu}</span>
          </div>
        </div>

        {/* Security Matrix */}
        <div className="flex flex-wrap items-center gap-3 sm:gap-4">
          <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[11px]">
            <ShieldCheck className="w-3 h-3" />
            <span>Security Shield Active</span>
          </div>

          <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 text-[11px]">
            <Lock className="w-3 h-3" />
            <span>Firewall ON</span>
          </div>

          <div className="flex items-center gap-1 text-[11px]">
            <span className="text-gray-500">Threats:</span>
            <span className="text-emerald-400 font-bold">0</span>
          </div>
        </div>

        {/* Node, Region, Latency */}
        <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-[11px]">
          <div className="flex items-center gap-1">
            <Globe className="w-3 h-3 text-[#FFD700]" />
            <span className="text-gray-500">Node:</span>
            <span className="text-amber-200">QUANTUM-07</span>
          </div>

          <div className="h-3 w-px bg-white/15 hidden sm:block" />

          <div className="flex items-center gap-1">
            <span className="text-gray-500">Region:</span>
            <span className="text-[#00B4D8]">NEO-ORBIT</span>
          </div>

          <div className="h-3 w-px bg-white/15 hidden sm:block" />

          <div className="flex items-center gap-1">
            <Zap className="w-3 h-3 text-emerald-400" />
            <span className="text-gray-500">latency:</span>
            <span className="text-emerald-300 font-bold">{sysStats.latency}</span>
          </div>
        </div>
      </footer>
    </section>
  );
};
