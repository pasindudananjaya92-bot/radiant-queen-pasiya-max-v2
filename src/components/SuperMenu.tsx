import React from "react";
import {
  LayoutDashboard,
  FolderKanban,
  Brain,
  Download,
  HardDrive,
  RefreshCw,
  BarChart3,
  BookOpen,
  Zap,
  FileCode2,
  Plug,
  Shield,
  Sliders,
  Terminal,
  Settings,
  Crown,
  Share2
} from "lucide-react";

export type MenuItemId =
  | "dashboard"
  | "file-manager"
  | "ai-brain"
  | "download-queue"
  | "cloud-storage"
  | "converter"
  | "analytics"
  | "memory-learning"
  | "automation"
  | "prompt-library"
  | "plugins"
  | "security-shield"
  | "model-control"
  | "logs-events"
  | "settings"
  | "admin-panel"
  | "social-nexus";

interface SuperMenuProps {
  activeTab: MenuItemId;
  onSelectTab: (tab: MenuItemId) => void;
  onOpenNexus: () => void;
  onOpenAdmin: () => void;
  onOpenZipExport?: () => void;
}

export const SuperMenu: React.FC<SuperMenuProps> = ({
  activeTab,
  onSelectTab,
  onOpenNexus,
  onOpenAdmin,
  onOpenZipExport,
}) => {
  const menuItems = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "file-manager", label: "File Manager", icon: FolderKanban },
    { id: "ai-brain", label: "AI Brain", icon: Brain, badge: "NEURAL" },
    {
      id: "download-queue",
      label: "Download Queue",
      icon: Download,
      badge: "3 ACTIVE",
      badgeColor: "bg-emerald-500/20 text-emerald-400 border-emerald-500/40",
    },
    {
      id: "cloud-storage",
      label: "Cloud Storage",
      icon: HardDrive,
      badge: "12.4TB / 50TB",
      badgeColor: "bg-cyan-500/20 text-cyan-300 border-cyan-500/40",
    },
    { id: "converter", label: "Converter", icon: RefreshCw },
    { id: "analytics", label: "Analytics Dashboard", icon: BarChart3 },
    { id: "memory-learning", label: "Memory & Learning", icon: BookOpen },
    { id: "automation", label: "Automation", icon: Zap },
    { id: "prompt-library", label: "Prompt Library", icon: FileCode2 },
    {
      id: "plugins",
      label: "Plugins",
      icon: Plug,
      badge: "7 Installed",
      badgeColor: "bg-amber-500/20 text-amber-300 border-amber-500/40",
    },
    {
      id: "security-shield",
      label: "Security Shield",
      icon: Shield,
      badge: "Protected",
      badgeColor: "bg-emerald-500/20 text-emerald-400 border-emerald-500/40",
    },
    { id: "model-control", label: "Model Control", icon: Sliders },
    { id: "logs-events", label: "Logs & Events", icon: Terminal },
    { id: "settings", label: "Settings", icon: Settings },
  ];

  return (
    <aside className="w-full lg:w-64 shrink-0 bg-[#08090E]/90 border border-[#FFD700]/25 rounded-2xl p-3 flex flex-col gap-1 shadow-[0_0_20px_rgba(255,215,0,0.08)] backdrop-blur-md">
      {/* Super Menu Header */}
      <div className="px-3 py-2 border-b border-white/10 flex items-center justify-between mb-1">
        <span className="text-xs font-bold uppercase tracking-wider text-[#FFD700] font-['Orbitron'] flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-[#FFD700] animate-ping" />
          SUPER MENU
        </span>
        <span className="text-[10px] font-mono text-gray-400 bg-white/5 px-2 py-0.5 rounded border border-white/10">
          OS v2.0
        </span>
      </div>

      {/* Navigation List */}
      <nav className="flex-1 space-y-0.5 overflow-y-auto max-h-[480px] pr-1">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelectTab(item.id as MenuItemId)}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition group cursor-pointer ${
                isActive
                  ? "bg-[#FFD700]/15 text-[#FFD700] border border-[#FFD700]/40 shadow-[0_0_12px_rgba(255,215,0,0.2)]"
                  : "text-gray-300 hover:text-white hover:bg-white/5 border border-transparent"
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Icon
                  className={`w-4 h-4 transition ${
                    isActive
                      ? "text-[#FFD700] drop-shadow-[0_0_5px_rgba(255,215,0,0.8)]"
                      : "text-gray-400 group-hover:text-[#00B4D8]"
                  }`}
                />
                <span className="truncate">{item.label}</span>
              </div>

              {item.badge && (
                <span
                  className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full border ${
                    item.badgeColor ||
                    "bg-[#FFD700]/20 text-[#FFD700] border-[#FFD700]/40"
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Special Queen Command & Nexus Footers */}
      <div className="pt-2 border-t border-white/10 space-y-1.5">
        <button
          onClick={onOpenNexus}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-bold bg-[#00B4D8]/15 border border-[#00B4D8]/40 text-[#00B4D8] hover:bg-[#00B4D8]/30 transition shadow-[0_0_10px_rgba(0,180,216,0.2)] cursor-pointer"
        >
          <Share2 className="w-3.5 h-3.5" />
          <span>SOCIAL NEXUS (13 CHANNELS)</span>
        </button>

        <button
          onClick={onOpenAdmin}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-amber-600/30 via-yellow-500/20 to-amber-600/30 border border-[#FFD700]/50 text-[#FFD700] hover:brightness-125 transition shadow-[0_0_12px_rgba(255,215,0,0.25)] cursor-pointer"
        >
          <Crown className="w-3.5 h-3.5 text-[#FFD700]" />
          <span>QUEEN COMMAND PANEL</span>
        </button>

        {onOpenZipExport && (
          <button
            onClick={onOpenZipExport}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-bold bg-emerald-500/15 border border-emerald-400/50 text-emerald-300 hover:bg-emerald-500/25 transition shadow-[0_0_12px_rgba(16,185,129,0.2)] cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-emerald-400" />
            <span>EXPORT PROJECT (.ZIP බාගන්න)</span>
          </button>
        )}
      </div>
    </aside>
  );
};
