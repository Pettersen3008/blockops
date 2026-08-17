export type Role = "administrator" | "operator" | "viewer";

export interface User {
  id: string;
  username: string;
  role: Role;
  disabled: boolean;
  createdAt: string;
}

export interface Session {
  user: User;
  csrfToken: string;
  expiresAt: string;
}

export interface Available<T> {
  available: boolean;
  value?: T;
  message?: string;
}

export interface ServerInfo {
  state: "online" | "offline" | "starting" | "stopping" | "unknown";
  image?: string;
  startedAt?: string;
  uptimeSeconds?: number;
  version?: string;
  software?: string;
}

export interface ServerMetrics {
  cpuPercent: number;
  memoryUsageBytes: number;
  memoryLimitBytes: number;
}

export interface DiskMetrics {
  usedBytes: number;
  totalBytes: number;
}

export interface PlayerSummary {
  online: number;
  max: number;
  names: string[];
}

export interface ConsoleLine {
  sequence: number;
  timestamp: string;
  text: string;
}

export interface Backup {
  id: string;
  sizeBytes: number;
  createdAt: string;
  createdBy: string;
  status: string;
}

export interface OverviewData {
  server: Available<ServerInfo>;
  metrics: Available<ServerMetrics>;
  disk: Available<DiskMetrics>;
  players: Available<PlayerSummary>;
  recentWarnings: ConsoleLine[];
  lastSuccessfulBackup?: Backup;
}

export interface Player {
  name: string;
  uuid?: string;
  online: boolean;
  allowlisted: boolean;
  banned: boolean;
  operator: boolean;
}

export interface AuditEvent {
  id: string;
  occurredAt: string;
  userId?: string;
  username?: string;
  action: string;
  target: string;
  sourceIp: string;
  outcome: "success" | "failure" | "denied";
  details?: Record<string, unknown>;
}

export interface SettingsData {
  rcon: {
    address: string;
    configured: boolean;
    source: string;
    credentialUpdatesEnabled: boolean;
  };
  deployment: {
    minecraftContainer: string;
    worldName: string;
    cookieSecure: boolean;
    trustedProxyCount: number;
    maxUploadBytes: number;
  };
}

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
  "monitor.read",
  "console.read",
  "console.execute",
  "players.read",
  "players.manage",
  "backups.read",
  "backups.create",
  "backups.delete",
  "backups.download",
  "world.download",
  "server.restart",
]);

const viewerPermissions = new Set<Permission>([
  "monitor.read",
  "console.read",
  "players.read",
  "backups.read",
]);

export function hasPermission(role: Role, permission: Permission): boolean {
  if (role === "administrator") return true;
  return role === "operator"
    ? operatorPermissions.has(permission)
    : viewerPermissions.has(permission);
}

