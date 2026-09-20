import React, { useState } from "react";
import { ParticleBackground } from "./components/ParticleBackground";
import { TopBar } from "./components/TopBar";
import { SearchBar } from "./components/SearchBar";
import { SuperMenu, MenuItemId } from "./components/SuperMenu";
import { NeuralBrainVisualizer } from "./components/NeuralBrainVisualizer";
import { AnalyticsDashboard } from "./components/AnalyticsDashboard";
import { BottomSystemDeck } from "./components/BottomSystemDeck";
import { SocialNexusModal } from "./components/SocialNexusModal";
import { AdminCommandPanel } from "./components/AdminCommandPanel";
import { SuperComputerOSModal } from "./components/SuperComputerOSModal";
import { UpgradeModal } from "./components/UpgradeModal";
import { ZipExportModal } from "./components/ZipExportModal";
import { ThemeMode } from "./types";
import confetti from "canvas-confetti";

export default function App() {
  const [activeTab, setActiveTab] = useState<MenuItemId>("dashboard");
  const [theme, setTheme] = useState<ThemeMode>("gold");

  // AI Chat states
  const [aiLoading, setAiLoading] = useState(false);
  const [aiAnswer, setAiAnswer] = useState<string | null>(null);

  // Modals state
  const [isNexusOpen, setIsNexusOpen] = useState(false);
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const [isToolsModalOpen, setIsToolsModalOpen] = useState(false);
  const [activeToolId, setActiveToolId] = useState(1);
  const [isUpgradeOpen, setIsUpgradeOpen] = useState(false);
  const [isZipModalOpen, setIsZipModalOpen] = useState(false);

  const handleOpenTool = (toolId: number) => {
    setActiveToolId(toolId);
    setIsToolsModalOpen(true);
  };

  const handleQuickCommand = (cmd: string) => {
    const cleanCmd = cmd.toLowerCase().trim();
    if (cleanCmd === "/social" || cleanCmd === "/nexus") {
      setIsNexusOpen(true);
    } else if (cleanCmd === "/strideclub") {
      window.open(
        "https://strideclub-platform-6b71a.containers.snapdeploy.app/",
        "_blank"
      );
      confetti({ particleCount: 30, spread: 70 });
    } else if (cleanCmd === "/zip" || cleanCmd === "/download" || cleanCmd === "zip" || cleanCmd === "download") {
      setIsZipModalOpen(true);
    } else if (cleanCmd === "/tools") {
      setIsToolsModalOpen(true);
    } else if (cleanCmd === "/tagall" || cleanCmd === "/admin") {
      setIsAdminOpen(true);
    } else {
      // open tools or focus
      setIsToolsModalOpen(true);
    }
  };

  const handleSelectMenuTab = (tab: MenuItemId) => {
    setActiveTab(tab);
    if (tab === "social-nexus") {
      setIsNexusOpen(true);
    } else if (tab === "admin-panel") {
      setIsAdminOpen(true);
    } else if (tab === "file-manager") {
      setActiveToolId(3);
      setIsToolsModalOpen(true);
    } else if (tab === "converter") {
      setActiveToolId(4);
      setIsToolsModalOpen(true);
    } else if (tab === "analytics") {
      // scroll to analytics or flash
    } else if (
      tab === "automation" ||
      tab === "prompt-library" ||
      tab === "model-control" ||
      tab === "security-shield"
    ) {
      setIsToolsModalOpen(true);
    }
  };

  const [isPaused, setIsPaused] = useState(false);

  return (
    <div
      className={`min-h-screen relative overflow-x-hidden text-gray-100 flex flex-col justify-between selection:bg-[#FFD700] selection:text-black ${
        theme === "cyan-pink"
          ? "border-cyan-500"
          : theme === "matrix"
          ? "border-emerald-500"
          : theme === "rainbow"
          ? "border-pink-500"
          : "border-[#FFD700]"
      }`}
      style={{ backgroundColor: "#050507" }}
    >
      {/* Dynamic Gold & Cyan Particle Bokeh Canvas */}
      <ParticleBackground />

      {/* Main Container */}
      <div className="relative z-10 flex flex-col flex-1 w-full max-w-[1720px] mx-auto p-2 sm:p-4 lg:p-5 gap-3">
        {/* TOP BAR */}
        <TopBar
          isPaused={isPaused}
          onTogglePause={() => setIsPaused(!isPaused)}
          onOpenUpgrade={() => setIsUpgradeOpen(true)}
          onOpenNexus={() => setIsNexusOpen(true)}
          onOpenAdmin={() => setIsAdminOpen(true)}
          onOpenTools={() => setIsToolsModalOpen(true)}
          onOpenZipExport={() => setIsZipModalOpen(true)}
        />

        {/* SEARCH BAR & QUICK COMMANDS */}
        <SearchBar
          onSearch={async (query) => {
            if (query.startsWith("/")) {
              handleQuickCommand(query);
              return;
            }
            setAiLoading(true);
            setAiAnswer(null);
            try {
              const res = await fetch("/api/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ message: query }),
              });
              const data = await res.json();
              setAiAnswer(data.answer || data.error || "No response");
            } catch {
              setAiAnswer("Chat failed. Try again.");
            } finally {
              setAiLoading(false);
            }
          }}
          isLoading={aiLoading}
          onQuickCommand={handleQuickCommand}
          onOpenNexus={() => setIsNexusOpen(true)}
        />

        {(aiLoading || aiAnswer) && (
          <div className="mx-auto w-full max-w-3xl px-3 -mt-1 mb-2">
            <div className="rounded-2xl border border-amber-500/30 bg-black/70 px-4 py-3 text-sm text-amber-50/90 whitespace-pre-wrap">
              {aiLoading ? "Pasiya AI thinking..." : aiAnswer}
            </div>
          </div>
        )}

        {/* CENTRAL THREE-COLUMN WORKSPACE: LEFT MENU + CENTER BRAIN + RIGHT ANALYTICS */}
        <main className="flex-1 flex flex-col lg:flex-row gap-3 min-h-0">
          {/* Left: SUPER MENU */}
          <SuperMenu
            activeTab={activeTab}
            onSelectTab={handleSelectMenuTab}
            onOpenNexus={() => setIsNexusOpen(true)}
            onOpenAdmin={() => setIsAdminOpen(true)}
            onOpenZipExport={() => setIsZipModalOpen(true)}
          />

          {/* Center: AI BRAIN NEURAL CONTROL */}
          <NeuralBrainVisualizer onTriggerTool={handleOpenTool} />

          {/* Right: ANALYTICS DASHBOARD */}
          <AnalyticsDashboard />
        </main>

        {/* BOTTOM ROW: DOWNLOAD QUEUE + CLOUD STORAGE RING + FILE MANAGER + CONVERTER + BULLETPROOF ROBOT + FOOTER */}
        <BottomSystemDeck
          onOpenFileExplore={() => {
            setActiveToolId(3);
            setIsToolsModalOpen(true);
          }}
          onOpenConverter={() => {
            setActiveToolId(4);
            setIsToolsModalOpen(true);
          }}
          onOpenZipExport={() => setIsZipModalOpen(true)}
        />
      </div>

      {/* MODALS */}
      {/* 1. 20 Super Computer OS Tools */}
      <SuperComputerOSModal
        isOpen={isToolsModalOpen}
        onClose={() => setIsToolsModalOpen(false)}
        initialToolId={activeToolId}
      />

      {/* 2. Social Nexus (13 Links) */}
      <SocialNexusModal
        isOpen={isNexusOpen}
        onClose={() => setIsNexusOpen(false)}
      />

      {/* 3. Queen Command Panel (Admin Only) */}
      <AdminCommandPanel
        isOpen={isAdminOpen}
        onClose={() => setIsAdminOpen(false)}
        currentTheme={theme}
        onSelectTheme={(t) => setTheme(t)}
      />

      {/* 4. Upgrade / Premium Modal */}
      <UpgradeModal
        isOpen={isUpgradeOpen}
        onClose={() => setIsUpgradeOpen(false)}
      />

      {/* 5. Project ZIP Export Modal */}
      <ZipExportModal
        isOpen={isZipModalOpen}
        onClose={() => setIsZipModalOpen(false)}
      />
    </div>
  );
}
 
