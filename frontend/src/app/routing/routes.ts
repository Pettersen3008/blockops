import {
  Archive,
  Boxes,
  CalendarClock,
  Command,
  FolderTree,
  KeyRound,
  LayoutDashboard,
  Puzzle,
  ScrollText,
  Settings,
  UsersRound,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Permission } from "@/features/auth";

export type NavigationSection = "manage" | "server";

export interface NavigationItem {
  path: string;
  label: string;
  permission: Permission;
  icon: LucideIcon;
  section: NavigationSection;
}

/** A roadmap capability with no backend yet. The sidebar renders it disabled. */
export interface PlannedNavigationItem {
  label: string;
  icon: LucideIcon;
  section: NavigationSection;
}

export type NavigationEntry = NavigationItem | PlannedNavigationItem;

export const navigationSections = [
  { id: "manage", label: "Manage" },
  { id: "server", label: "Server" },
] as const satisfies readonly { id: NavigationSection; label: string }[];

export const navigation: readonly NavigationEntry[] = [
  { path: "/overview", label: "Overview", permission: "monitor.read", icon: LayoutDashboard, section: "manage" },
  { path: "/console", label: "Console", permission: "console.read", icon: Command, section: "manage" },
  { label: "Files", icon: FolderTree, section: "manage" },
  { label: "Mods & plugins", icon: Puzzle, section: "manage" },
  { path: "/players", label: "Players", permission: "players.read", icon: UsersRound, section: "manage" },
  { path: "/worlds", label: "Worlds", permission: "world.download", icon: Boxes, section: "manage" },
  { path: "/backups", label: "Backups", permission: "backups.read", icon: Archive, section: "manage" },
  { label: "Schedules", icon: CalendarClock, section: "manage" },
  { path: "/settings", label: "Settings", permission: "settings.manage", icon: Settings, section: "server" },
  { label: "Access", icon: KeyRound, section: "server" },
  { path: "/audit", label: "Audit log", permission: "audit.read", icon: ScrollText, section: "server" },
];

export function isRoutedItem(entry: NavigationEntry): entry is NavigationItem {
  return "path" in entry;
}
