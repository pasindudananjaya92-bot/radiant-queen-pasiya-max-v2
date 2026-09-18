import React, { useState, useEffect } from "react";
import { Search, Mic, MicOff, Sparkles, ArrowRight, Globe, Share2, Wrench, Shield, Rocket } from "lucide-react";

export interface SearchBarProps {
  onSearch: (query: string) => void;
  isLoading?: boolean;
  onQuickCommand?: (cmd: string) => void;
  onOpenNexus?: () => void;
}

export const SearchBar: React.FC<SearchBarProps> = ({
  onSearch,
  isLoading,
  onQuickCommand,
  onOpenNexus,
}) => {
  const [query, setQuery] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);

  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      ("webkitSpeechRecognition" in window || "SpeechRecognition" in window)
    ) {
      setSpeechSupported(true);
    }
  }, []);

  const handleVoiceToggle = () => {
    if (!speechSupported) {
      alert(
        "Voice recognition activated: Say 'Hey Queen' or enter your query into the console!"
      );
      return;
    }

    try {
      const SpeechRecognition =
        (window as any).SpeechRecognition ||
        (window as any).webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = "en-US";

      if (!isListening) {
        recognition.start();
        setIsListening(true);

        recognition.onresult = (event: any) => {
          const speechText = event.results[0][0].transcript;
          setQuery(speechText);
          setIsListening(false);
          onSearch(speechText);
        };

        recognition.onerror = () => {
          setIsListening(false);
        };

        recognition.onend = () => {
          setIsListening(false);
        };
      } else {
        recognition.stop();
        setIsListening(false);
      }
    } catch {
      setIsListening(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      onSearch(query.trim());
      if (onQuickCommand && query.trim().startsWith("/")) {
        onQuickCommand(query.trim());
      }
    }
  };

  const handleCommandClick = (cmd: string) => {
    setQuery(cmd + " ");
    if (onQuickCommand) {
      onQuickCommand(cmd);
    }
  };

  return (
    <div className="w-full flex flex-col gap-2">
      <form
        onSubmit={handleSubmit}
        className="relative w-full rounded-2xl bg-[#08090F]/90 border border-[#FFD700]/40 p-2 sm:p-2.5 flex items-center gap-2 sm:gap-3 shadow-[0_0_20px_rgba(255,215,0,0.12)] backdrop-blur-md group hover:border-[#FFD700] transition"
      >
        {/* Glow corner aura */}
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-[#FFD700]/5 via-transparent to-[#00B4D8]/5 pointer-events-none" />

        {/* Search Icon */}
        <div className="pl-1 sm:pl-2 text-[#FFD700]">
          <Search className="w-4 h-4 sm:w-5 sm:h-5 drop-shadow-[0_0_6px_rgba(255,215,0,0.8)]" />
        </div>

        {/* Input */}
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search web... Ask RADIANT QUEEN anything • /web /news /research"
          className="relative flex-1 bg-transparent text-xs sm:text-sm text-gray-100 placeholder:text-gray-500 focus:outline-none font-sans"
        />

        {/* Filter tags (web, news, research) */}
        <div className="hidden md:flex items-center gap-1.5 text-[11px] font-mono pr-1">
          <button
            type="button"
            onClick={() => setQuery("/web ")}
            className="px-2 py-0.5 rounded bg-white/5 border border-white/10 hover:border-[#FFD700]/50 text-gray-400 hover:text-[#FFD700] transition cursor-pointer"
          >
            /web
          </button>
          <button
            type="button"
            onClick={() => setQuery("/news ")}
            className="px-2 py-0.5 rounded bg-white/5 border border-white/10 hover:border-[#00B4D8]/50 text-gray-400 hover:text-[#00B4D8] transition cursor-pointer"
          >
            /news
          </button>
          <button
            type="button"
            onClick={() => setQuery("/research ")}
            className="px-2 py-0.5 rounded bg-white/5 border border-white/10 hover:border-amber-400/50 text-gray-400 hover:text-amber-300 transition cursor-pointer"
          >
            /research
          </button>
        </div>

        {/* Voice mic */}
        <button
          type="button"
          onClick={handleVoiceToggle}
          title={isListening ? "Listening... Speak now" : "Activate voice assistant"}
          className={`relative p-2 rounded-xl transition cursor-pointer flex items-center justify-center ${
            isListening
              ? "bg-red-500/20 text-red-400 border border-red-500/50 animate-pulse"
              : "bg-white/5 text-[#FFD700] hover:bg-[#FFD700]/15 border border-[#FFD700]/30"
          }`}
        >
          {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
        </button>

        {/* Submit */}
        <button
          type="submit"
          disabled={isLoading}
          className="relative px-3 sm:px-4 py-2 rounded-xl bg-gradient-to-r from-[#FFD700] to-[#E6B800] text-black font-bold text-xs sm:text-sm flex items-center gap-1 hover:brightness-110 active:scale-95 transition shadow-[0_0_12px_rgba(255,215,0,0.4)] cursor-pointer"
        >
          {isLoading ? (
            <Sparkles className="w-4 h-4 animate-spin" />
          ) : (
            <>
              <span className="hidden sm:inline">ASK</span>
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </form>

      {/* Fast Action Quick Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-[11px] font-mono">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-gray-500">HOT COMMANDS:</span>
          <button
            onClick={() => handleCommandClick("/strideclub")}
            className="px-2 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/30 text-amber-300 hover:bg-amber-500/25 flex items-center gap-1 transition cursor-pointer"
          >
            <Rocket className="w-3 h-3 text-[#FFD700]" />
            <span>/strideclub</span>
          </button>
          <button
            onClick={() => handleCommandClick("/tools")}
            className="px-2 py-0.5 rounded-md bg-[#00B4D8]/15 border border-[#00B4D8]/30 text-cyan-300 hover:bg-[#00B4D8]/25 flex items-center gap-1 transition cursor-pointer"
          >
            <Wrench className="w-3 h-3 text-[#00B4D8]" />
            <span>/tools (20 OS)</span>
          </button>
          <button
            onClick={() => handleCommandClick("/social")}
            className="px-2 py-0.5 rounded-md bg-pink-500/15 border border-pink-500/30 text-pink-300 hover:bg-pink-500/25 flex items-center gap-1 transition cursor-pointer"
          >
            <Share2 className="w-3 h-3 text-pink-400" />
            <span>/social (13 Links)</span>
          </button>
          <button
            onClick={() => handleCommandClick("/admin")}
            className="px-2 py-0.5 rounded-md bg-red-500/15 border border-red-500/30 text-red-300 hover:bg-red-500/25 flex items-center gap-1 transition cursor-pointer"
          >
            <Shield className="w-3 h-3 text-red-400" />
            <span>/admin</span>
          </button>
        </div>

        {onOpenNexus && (
          <button
            onClick={onOpenNexus}
            className="text-amber-300 hover:text-white flex items-center gap-1 cursor-pointer transition"
          >
            <Globe className="w-3 h-3 text-[#FFD700]" />
            <span>Official Pasiya Max Hub</span>
          </button>
        )}
      </div>
    </div>
  );
};
