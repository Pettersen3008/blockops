export interface ConsoleLine {
  sequence: number;
  timestamp: string;
  text: string;
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
