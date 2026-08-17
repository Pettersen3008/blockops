import type { Role } from "./auth-schemas";

export type Permission =
  | "monitor.read"
  | "console.read"
  | "console.execute"
  | "players.read"
  | "players.manage"
  | "backups.read"
  | "backups.create"
  | "backups.delete"
  | "backups.download"
  | "backups.restore"
  | "world.download"
  | "world.replace"
  | "server.start"
  | "server.stop"
  | "server.restart"
  | "audit.read"
  | "users.manage"
  | "settings.manage";

const operatorPermissions = new Set<Permission>([
  "monitor.read", "console.read", "console.execute", "players.read", "players.manage",
  "backups.read", "backups.create", "backups.delete", "backups.download",
  "world.download", "server.restart",
]);

const viewerPermissions = new Set<Permission>([
  "monitor.read", "console.read", "players.read", "backups.read",
]);

export function hasPermission(role: Role, permission: Permission): boolean {
  if (role === "administrator") return true;
  return role === "operator"
    ? operatorPermissions.has(permission)
    : viewerPermissions.has(permission);
}
