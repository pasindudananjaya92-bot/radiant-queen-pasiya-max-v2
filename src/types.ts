export type ThemeMode = "gold" | "cyan-pink" | "matrix" | "rainbow";

export interface SocialLinkItem {
  id: string;
  name: string;
  url: string;
  iconName: string;
  category: "social" | "community" | "web" | "official";
  badge?: string;
  description: string;
}

export interface DownloadItem {
  id: string;
  name: string;
  progress: number;
  speed: string;
  size: string;
  status: "downloading" | "completed" | "paused";
}

export interface QuantumSystemStatus {
  cpu: string;
  ram: string;
  gpu: string;
  latency: string;
  integrity: string;
  threats: number;
  firewall: string;
  armor: string;
  node: string;
  region: string;
  uptime: string;
}

export interface SuperTool {
  id: number;
  title: string;
  category: string;
  icon: string;
  description: string;
  status: "Ready" | "Active" | "Quantum Sync";
}
