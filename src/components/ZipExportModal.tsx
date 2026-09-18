import React, { useState } from "react";
import {
  Download,
  Archive,
  CheckCircle2,
  Copy,
  Terminal,
  FileCode,
  Sparkles,
  X,
  ExternalLink,
  ShieldCheck,
  FolderArchive
} from "lucide-react";
import confetti from "canvas-confetti";
import { SOCIAL_LINKS, PASIYA_MAIN_SITE } from "../data/socialLinks";

interface ZipExportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ZipExportModal: React.FC<ZipExportModalProps> = ({ isOpen, onClose }) => {
  const [downloading, setDownloading] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState(false);
  const [copiedCmd, setCopiedCmd] = useState(false);

  if (!isOpen) return null;

  const handleDownloadZip = () => {
    setDownloading(true);
    setDownloadSuccess(false);

    confetti({
      particleCount: 50,
      spread: 80,
      origin: { y: 0.6 }
    });

    // Direct browser download
    const link = document.createElement("a");
    link.href = "/api/download-zip";
    link.setAttribute("download", `pasiya-max-radiant-queen-project-${Date.now()}.zip`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setTimeout(() => {
      setDownloading(false);
      setDownloadSuccess(true);
    }, 1500);
  };

  const copyRunInstructions = () => {
    navigator.clipboard.writeText("npm install\nnpm run dev");
    setCopiedCmd(true);
    setTimeout(() => setCopiedCmd(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-[#08090E] border-2 border-[#FFD700]/50 rounded-2xl p-5 sm:p-6 shadow-[0_0_50px_rgba(255,215,0,0.25)] flex flex-col gap-4 text-gray-100 max-h-[92vh] overflow-y-auto">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 border-b border-white/10 pb-3.5">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#FFD700]/20 to-amber-500/30 border border-[#FFD700]/60 flex items-center justify-center text-[#FFD700] shadow-[0_0_15px_rgba(255,215,0,0.4)]">
            <Archive className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg sm:text-xl font-extrabold font-['Orbitron'] text-gold-gradient">
                PROJECT ZIP EXPORT
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                READY
              </span>
            </div>
            <p className="text-xs text-gray-400 font-mono">
              RADIANT QUEEN • PASIYA MAX v2.0 Source Code Package (.ZIP)
            </p>
          </div>
        </div>

        {/* Sinhala Message Banner */}
        <div className="p-3.5 rounded-xl bg-[#FFD700]/10 border border-[#FFD700]/30 text-amber-200 text-xs sm:text-sm leading-relaxed">
          <div className="flex items-center gap-2 font-bold text-[#FFD700] mb-1">
            <Sparkles className="w-4 h-4" />
            <span>සිප් ෆයිල් එක (ZIP File) කෙලින්ම බාගත කරගන්න</span>
          </div>
          <p className="text-gray-300 text-xs">
            මෙම බොත්තම ක්ලික් කිරීමෙන් ඔබගේ පරිගණකයට හෝ දුරකථනයට සම්පූර්ණ Source Code එක සහිත <strong>.ZIP</strong> ගොනුව ක්ෂණිකව බාගත වේ.
          </p>
        </div>

        {/* Primary Download Action Button */}
        <div className="flex flex-col gap-2">
          <button
            onClick={handleDownloadZip}
            disabled={downloading}
            className="group relative w-full py-3.5 px-6 rounded-xl bg-gradient-to-r from-[#FFD700] via-[#FACC15] to-[#FFAA00] text-black font-extrabold text-sm sm:text-base tracking-wider uppercase flex items-center justify-center gap-3 transition-all duration-300 hover:brightness-110 shadow-[0_0_30px_rgba(255,215,0,0.5)] cursor-pointer active:scale-[0.99]"
          >
            {downloading ? (
              <>
                <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin" />
                <span>Creating & Downloading ZIP...</span>
              </>
            ) : (
              <>
                <FolderArchive className="w-5 h-5 transition-transform group-hover:scale-110" />
                <span>DOWNLOAD PROJECT ZIP (සිප් එක ඩවුන්ලෝඩ් කරන්න)</span>
                <Download className="w-5 h-5 animate-bounce" />
              </>
            )}
          </button>

          {downloadSuccess && (
            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 text-xs font-mono animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>සිප් ගොනුව සාර්ථකව බාගත කිරීම ආරම්භ විය! (Download Started!)</span>
            </div>
          )}
        </div>

        {/* What's included in this ZIP */}
        <div className="p-3.5 rounded-xl bg-black/50 border border-white/10 space-y-2 text-xs font-mono">
          <div className="flex items-center justify-between text-gray-300 font-bold">
            <span className="flex items-center gap-1.5 text-cyan-400">
              <FileCode className="w-3.5 h-3.5" />
              INCLUDED IN ZIP PACKAGE:
            </span>
            <span className="text-amber-400">Full Stack Project</span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-[11px] text-gray-400 pt-1">
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span>React 19 + TypeScript</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span>Tailwind CSS v4</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span>Express + Vite Server</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span>20 Super Computer Tools</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span>AI Studio Brain: AUTO-CONNECTED</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
              <span>Other Services: Empty .env Placeholders</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span>Pasiya Max Social Nexus</span>
            </div>
          </div>
        </div>

        {/* How to run locally */}
        <div className="p-3.5 rounded-xl bg-black/70 border border-[#00B4D8]/30 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[#00B4D8] flex items-center gap-1.5 font-mono">
              <Terminal className="w-3.5 h-3.5" />
              HOW TO RUN LOCALLY (බාගත් පසු Run කරන ආකාරය):
            </span>
            <button
              onClick={copyRunInstructions}
              className="flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-gray-300 transition cursor-pointer"
            >
              {copiedCmd ? (
                <>
                  <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                  <span>Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3" />
                  <span>Copy Commands</span>
                </>
              )}
            </button>
          </div>
          <pre className="p-2.5 rounded-lg bg-black text-amber-300 font-mono text-xs overflow-x-auto border border-white/10">
{`# 1. Unzip the downloaded file
# 2. Open terminal in the folder
npm install
npm run dev`}
          </pre>
        </div>

        {/* AI Studio Alternative Export Method */}
        <div className="p-3 rounded-xl bg-white/5 border border-white/10 text-xs text-gray-300 space-y-1">
          <span className="font-bold text-[#FFD700] block">
            💡 AI Studio මෙනුවෙන් Export කරගන්නා ආකාරය:
          </span>
          <p className="text-gray-400 text-[11px] leading-relaxed">
            AI Studio මුදුනේ ඇති <strong>Settings / Menu</strong> අයිකනය ක්ලික් කර <strong>"Export to ZIP"</strong> හෝ <strong>"Export to GitHub"</strong> තේරීමෙන්ද මුළු Project එකම සෘජුවම බාගත කරගත හැක.
          </p>
        </div>

        {/* Footer with Pasiya Max Social Links */}
        <div className="pt-2 border-t border-white/10 flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="text-gray-400 font-mono">Pasiya Max Official Assistant</span>
          <div className="flex items-center gap-3">
            <a
              href="https://t.me/goldenbotmdchannel"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#00B4D8] hover:underline flex items-center gap-1 font-mono text-[11px]"
            >
              <span>Telegram Channel</span>
              <ExternalLink className="w-3 h-3" />
            </a>
            <a
              href="https://youtube.com/@pasya"
              target="_blank"
              rel="noopener noreferrer"
              className="text-red-400 hover:underline flex items-center gap-1 font-mono text-[11px]"
            >
              <span>YouTube</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};
