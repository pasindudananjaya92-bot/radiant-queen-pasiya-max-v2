import React from "react";
import { X, Crown, Check, Sparkles, Zap, ShieldCheck } from "lucide-react";
import { PASIYA_MAIN_SITE } from "../data/socialLinks";

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const UpgradeModal: React.FC<UpgradeModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-lg animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-[#0A0B12] border-2 border-[#FFD700]/60 rounded-3xl p-5 sm:p-7 flex flex-col gap-4 shadow-[0_0_50px_rgba(255,215,0,0.3)]">
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-gradient-to-r from-amber-500 to-[#FFD700] text-black">
              <Crown className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base sm:text-xl font-extrabold font-['Orbitron'] text-gold-gradient">
                PREMIUM QUANTUM UPGRADE
              </h3>
              <p className="text-xs text-gray-400 font-mono">
                RADIANT QUEEN • PASIYA MAX v2.0
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/15 text-gray-400 hover:text-white transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-3 font-sans text-xs sm:text-sm">
          <div className="p-4 rounded-2xl bg-gradient-to-b from-[#FFD700]/15 to-transparent border border-[#FFD700]/40 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-amber-200 uppercase tracking-wide">
                TIER: QUANTUM EMPEROR
              </span>
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-mono text-xs border border-emerald-500/40">
                ACTIVE
              </span>
            </div>
            <p className="text-gray-300 text-xs leading-relaxed">
              Unrestricted access to all 20 Super Computer OS tools, dedicated quantum server priority, unlimited Gemini Flash tokens, and direct VIP access to Pasiya Max.
            </p>
          </div>

          <div className="space-y-2">
            {[
              "50 TB Ultra-fast NVMe Cloud Storage with unlimited upload",
              "Sub-20ms latency across global Neo-Orbit quantum nodes",
              "Full Telegram bot commands (/ask, /tagall, /download, /react)",
              "Private encrypted VIP channel with Pasiya AI (Sinhala & English)",
              "Priority access to StrideClub platform & bhook- repository",
            ].map((feat, i) => (
              <div key={i} className="flex items-center gap-2 text-xs text-gray-200">
                <Check className="w-4 h-4 text-[#FFD700] shrink-0" />
                <span>{feat}</span>
              </div>
            ))}
          </div>

          <a
            href={PASIYA_MAIN_SITE}
            target="_blank"
            rel="noopener noreferrer"
            className="pulse-gold w-full mt-2 py-3 rounded-2xl bg-gradient-to-r from-[#FFD700] via-yellow-400 to-amber-500 text-black font-extrabold text-xs sm:text-sm uppercase flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(255,215,0,0.6)] hover:brightness-110 transition"
          >
            <Sparkles className="w-4 h-4" />
            <span>ACCESS STRIDECLUB VIP PLATFORM</span>
          </a>
        </div>
      </div>
    </div>
  );
};
