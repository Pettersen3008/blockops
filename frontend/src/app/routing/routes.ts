import {
  Archive,
  Boxes,
  Command,
  LayoutDashboard,
  ScrollText,
  Settings,
  UsersRound,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Permission } from "@/features/auth";

export interface NavigationItem {
  path: string;
  label: string;
  permission: Permission;
  icon: LucideIcon;
}

export const navigation = [
  { path: "/overview", label: "Overview", permission: "monitor.read", icon: LayoutDashboard },
  { path: "/console", label: "Console", permission: "console.read", icon: Command },
  { path: "/players", label: "Players", permission: "players.read", icon: UsersRound },
  { path: "/worlds", label: "Worlds", permission: "world.download", icon: Boxes },
  { path: "/backups", label: "Backups", permission: "backups.read", icon: Archive },
  { path: "/audit", label: "Audit log", permission: "audit.read", icon: ScrollText },
  { path: "/settings", label: "Settings", permission: "settings.manage", icon: Settings },
] as const satisfies readonly NavigationItem[];

export function navigationItemFor(pathname: string): NavigationItem | undefined {
  return navigation.find((item) => item.path === pathname);
}
