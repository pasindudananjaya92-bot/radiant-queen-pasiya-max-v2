import React, { useState } from "react";
import {
  X,
  ExternalLink,
  Copy,
  Check,
  Share2,
  Sparkles,
  Rocket,
  Globe,
  MessageCircle,
  Video,
  Send,
  Users,
  Linkedin,
  Twitter,
  PhoneCall,
  Smartphone,
  Facebook,
  Instagram,
  Youtube,
  Code2
} from "lucide-react";
import { SOCIAL_LINKS, PASIYA_MAIN_SITE } from "../data/socialLinks";
import { SocialLinkItem } from "../types";

interface SocialNexusModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SocialNexusModal: React.FC<SocialNexusModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<string>("all");

  if (!isOpen) return null;

  const handleCopy = (url: string, id: string) => {
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const getIcon = (name: string) => {
    switch (name) {
      case "Rocket":
        return <Rocket className="w-5 h-5 text-[#FFD700]" />;
      case "Instagram":
        return <Instagram className="w-5 h-5 text-pink-400" />;
      case "Facebook":
        return <Facebook className="w-5 h-5 text-blue-400" />;
      case "Youtube":
        return <Youtube className="w-5 h-5 text-red-400" />;
      case "Video":
        return <Video className="w-5 h-5 text-cyan-400" />;
      case "Linkedin":
        return <Linkedin className="w-5 h-5 text-sky-400" />;
      case "Users":
        return <Users className="w-5 h-5 text-amber-400" />;
      case "Twitter":
        return <Twitter className="w-5 h-5 text-gray-200" />;
      case "MessageCircle":
        return <MessageCircle className="w-5 h-5 text-emerald-400" />;
      case "Send":
        return <Send className="w-5 h-5 text-sky-400" />;
      case "PhoneCall":
        return <PhoneCall className="w-5 h-5 text-purple-400" />;
      case "Smartphone":
        return <Smartphone className="w-5 h-5 text-orange-400" />;
      case "Globe":
        return <Globe className="w-5 h-5 text-teal-400" />;
      case "Code2":
        return <Code2 className="w-5 h-5 text-amber-300" />;
      default:
        return <Share2 className="w-5 h-5 text-[#FFD700]" />;
    }
  };

  const filteredLinks =
    activeFilter === "all"
      ? SOCIAL_LINKS
      : SOCIAL_LINKS.filter((l) => l.category === activeFilter);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-lg animate-in fade-in duration-200">
      <div className="relative w-full max-w-4xl max-h-[90vh] bg-[#0A0B12] border-2 border-[#FFD700]/50 rounded-3xl p-4 sm:p-6 flex flex-col gap-4 shadow-[0_0_50px_rgba(255,215,0,0.3)] overflow-hidden">
        {/* Glow corner */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-[#FFD700]/20 via-[#00B4D8]/10 to-transparent rounded-bl-full pointer-events-none blur-2xl" />

        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-[#FFD700]/15 border border-[#FFD700]/30 text-[#FFD700]">
              <Share2 className="w-6 h-6 drop-shadow-[0_0_8px_rgba(255,215,0,0.8)]" />
            </div>
            <div>
              <h3 className="text-base sm:text-xl font-extrabold font-['Orbitron'] text-gold-gradient flex items-center gap-2">
                PASIYA MAX SOCIAL NEXUS
                <Sparkles className="w-4 h-4 text-[#FFD700]" />
              </h3>
              <p className="text-xs text-gray-400 font-sans">
                Official Channels, Communities & Platforms of Pasiya Max
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

        {/* Top Hero StrideClub Banner in Modal */}
        <a
          href={PASIYA_MAIN_SITE}
          target="_blank"
          rel="noopener noreferrer"
          className="pulse-gold p-3 sm:p-4 rounded-2xl bg-gradient-to-r from-[#FFD700]/25 via-amber-500/20 to-[#00B4D8]/20 border border-[#FFD700] flex flex-wrap items-center justify-between gap-3 group transition"
        >
          <div className="flex items-center gap-3">
            <span className="text-2xl animate-bounce">🚀</span>
            <div>
              <span className="text-xs font-mono text-[#FFD700] uppercase font-bold tracking-wider">
                FLAGSHIP WEB PLATFORM
              </span>
              <h4 className="text-sm sm:text-base font-extrabold text-white group-hover:text-amber-200 transition">
                StrideClub Official Main Site
              </h4>
            </div>
          </div>
          <span className="px-4 py-1.5 rounded-xl bg-[#FFD700] text-black font-extrabold text-xs uppercase flex items-center gap-1.5 shadow-[0_0_12px_rgba(255,215,0,0.6)]">
            <span>LAUNCH PLATFORM</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </span>
        </a>

        {/* Filter Pills */}
        <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
          <span className="text-gray-400 text-[11px]">FILTER:</span>
          {["all", "official", "social", "community", "web"].map((f) => (
            <button
              key={f}
              onClick={() => setActiveFilter(f)}
              className={`px-3 py-1 rounded-lg uppercase text-[10px] tracking-wider transition cursor-pointer ${
                activeFilter === f
                  ? "bg-[#FFD700] text-black font-bold shadow-[0_0_10px_rgba(255,215,0,0.5)]"
                  : "bg-white/5 text-gray-300 hover:bg-white/10 border border-white/10"
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        {/* Grid of Golden Cards */}
        <div className="flex-1 overflow-y-auto pr-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredLinks.map((item: SocialLinkItem) => (
            <div
              key={item.id}
              className="p-3.5 rounded-2xl bg-black/60 border border-[#FFD700]/30 hover:border-[#FFD700] transition flex flex-col justify-between gap-2.5 group shadow-[0_0_15px_rgba(255,215,0,0.05)] hover:shadow-[0_0_20px_rgba(255,215,0,0.2)]"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-white/5 border border-white/10 group-hover:border-[#FFD700]/50 transition">
                    {getIcon(item.iconName)}
                  </div>
                  <div>
                    <h5 className="text-sm font-bold text-gray-100 group-hover:text-amber-200 transition">
                      {item.name}
                    </h5>
                    {item.badge && (
                      <span className="text-[10px] font-mono text-amber-300/90 block">
                        {item.badge}
                      </span>
                    )}
                  </div>
                </div>

                <button
                  onClick={() => handleCopy(item.url, item.id)}
                  title="Copy link"
                  className="p-1.5 rounded-lg bg-white/5 hover:bg-white/15 text-gray-400 hover:text-white transition cursor-pointer"
                >
                  {copiedId === item.id ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>

              <p className="text-[11px] text-gray-400 line-clamp-2">
                {item.description}
              </p>

              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-1.5 rounded-xl bg-gradient-to-r from-[#FFD700]/15 via-yellow-500/10 to-transparent border border-[#FFD700]/30 hover:border-[#FFD700] text-xs font-mono text-amber-200 group-hover:text-[#FFD700] flex items-center justify-center gap-1.5 transition"
              >
                <span>OPEN LINK</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
