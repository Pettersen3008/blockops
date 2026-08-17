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

